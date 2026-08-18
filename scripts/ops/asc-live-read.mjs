#!/usr/bin/env node
// Manual-only, STRICTLY READ-ONLY live smoke of the App Store Connect
// observer (packages/asc-adapter). It is NOT wired into `pnpm test` or
// `pnpm verify` and must never be: every invocation makes real HTTPS GETs to
// api.appstoreconnect.apple.com with the owner's team API key.
//
// What it does, in order:
//   1. Preflights the Keychain `.p8` item through the credential broker
//      (`security find-generic-password` WITHOUT `-w` — metadata only).
//   2. Builds the sanctioned fetch transport (`provider-transport`) with the
//      ASC ES256-JWT authorization derivation: the `.p8` is resolved just in
//      time per request, signed, and zeroized inside the broker's window.
//   3. GET /v1/apps, then per app GET /v1/builds (latest 5, with beta detail)
//      and GET /v1/apps/{id}/appStoreVersions. Nothing else. No POST/PATCH/
//      DELETE exists in the adapter.
//   4. Writes redacted request/response envelopes (method, URL, status,
//      allowlisted response headers, timings, body digest, body), the parsed
//      observations, and the projected release-stage table under
//      <RESULTS_ROOT>/<timestamp>/ (0700), and prints a compact table.
//
// The JWT and the private key never appear anywhere: the observer never
// holds them, exchange records are built before the transport attaches the
// header, and every string written passes through `scrubSecrets`.
//
// Required environment (no defaults that could go live by accident):
//   AF_ASC_SMOKE_CONFIRM_LIVE     must be exactly "yes"
//   AF_ASC_SMOKE_KEY_ID           the 10-character API key ID (JWT kid; also the Keychain account)
//   AF_ASC_SMOKE_ISSUER_ID        the team Issuer ID (JWT iss; not secret)
//   AF_ASC_SMOKE_KEY_SERVICE      Keychain service name of the .p8 item
//   AF_ASC_SMOKE_RESULTS_ROOT     private results dir; a <timestamp>/ subdir is created per run
// Optional:
//   AF_ASC_SMOKE_KEY_ACCOUNT      Keychain account of the .p8 item (default: the key ID)
//   AF_ASC_SMOKE_BUILDS_LIMIT     latest-N builds per app, 1..200 (default 5)
//   AF_ASC_SMOKE_TIMEOUT_MS       per-request deadline (default 30000)
//   AF_ASC_SMOKE_JWT_SCOPE=yes    add a per-request `scope` claim to each token (default off)
//   AF_ASC_SMOKE_JWT_TTL_SECONDS  token lifetime (default 600, max 1200)
//
// Usage (from the repository root, after `pnpm build`):
//   AF_ASC_SMOKE_CONFIRM_LIVE=yes AF_ASC_SMOKE_... node scripts/ops/asc-live-read.mjs

import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const { createCredentialBroker } = await import(
  join(repositoryRoot, "packages/credential-broker/dist/index.js")
);
const { createFetchProviderHttpTransport } = await import(
  join(repositoryRoot, "packages/provider-transport/dist/index.js")
);
const { createAscJwtAuthorization, createAscReadObserver, scrubSecrets, ASC_API_ORIGIN } =
  await import(join(repositoryRoot, "packages/asc-adapter/dist/index.js"));

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function requireEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function optionalInteger(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

if (requireEnvironment("AF_ASC_SMOKE_CONFIRM_LIVE") !== "yes") {
  throw new Error("Refusing to run: AF_ASC_SMOKE_CONFIRM_LIVE must be exactly 'yes'");
}
const keyId = requireEnvironment("AF_ASC_SMOKE_KEY_ID");
const issuerId = requireEnvironment("AF_ASC_SMOKE_ISSUER_ID");
const keyService = requireEnvironment("AF_ASC_SMOKE_KEY_SERVICE");
const keyAccount = process.env.AF_ASC_SMOKE_KEY_ACCOUNT ?? keyId;
const resultsRoot = requireEnvironment("AF_ASC_SMOKE_RESULTS_ROOT");
if (!isAbsolute(resultsRoot)) throw new Error("AF_ASC_SMOKE_RESULTS_ROOT must be an absolute path");
const buildsLimit = optionalInteger("AF_ASC_SMOKE_BUILDS_LIMIT", 5);
const requestTimeoutMs = optionalInteger("AF_ASC_SMOKE_TIMEOUT_MS", 30_000);
const scopeToRequest = process.env.AF_ASC_SMOKE_JWT_SCOPE === "yes";
const ttlSeconds = optionalInteger("AF_ASC_SMOKE_JWT_TTL_SECONDS", 600);

// ---------------------------------------------------------------------------
// Results directory (private)
// ---------------------------------------------------------------------------

const startedAt = new Date();
const runDirectory = join(resultsRoot, startedAt.toISOString().replaceAll(":", "-"));
mkdirSync(resultsRoot, { recursive: true, mode: 0o700 });
chmodSync(resultsRoot, 0o700);
mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
chmodSync(runDirectory, 0o700);
mkdirSync(join(runDirectory, "exchanges"), { recursive: true, mode: 0o700 });

function writeJson(name, value) {
  const path = join(runDirectory, name);
  writeFileSync(path, scrubSecrets(`${JSON.stringify(value, null, 2)}\n`), { mode: 0o600 });
  return path;
}

// ---------------------------------------------------------------------------
// Composition: broker -> transport (JWT derivation) -> observer
// ---------------------------------------------------------------------------

const credentialReference = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: keyService,
  account: keyAccount,
};
const broker = createCredentialBroker();
const controller = new AbortController();
const overallTimer = setTimeout(
  () => controller.abort(new Error("smoke wall-clock limit elapsed")),
  10 * 60 * 1000,
);

const preflight = await broker.preflight(credentialReference, controller.signal);
if (!preflight.available) {
  clearTimeout(overallTimer);
  writeJson("summary.json", {
    schemaVersion: 1,
    startedAt: startedAt.toISOString(),
    outcome: "credential-unavailable",
    blockerCode: preflight.blockerCode,
    credentialReference,
  });
  console.error(`Keychain item unavailable: ${preflight.blockerCode}`);
  process.exit(2);
}

const transport = createFetchProviderHttpTransport({
  credentials: broker,
  authorization: createAscJwtAuthorization({ keyId, issuerId, ttlSeconds, scopeToRequest }),
});

const exchanges = [];
const observer = createAscReadObserver({
  transport,
  credentialReference,
  requestTimeoutMs,
  onExchange: (record) => {
    const index = exchanges.length + 1;
    const bodyText =
      record.body === null ? null : scrubSecrets(Buffer.from(record.body).toString("utf8"));
    const envelope = {
      ...record,
      body: undefined,
      bodyFile: bodyText === null ? null : `exchanges/${String(index).padStart(3, "0")}.body.json`,
    };
    exchanges.push(envelope);
    if (bodyText !== null) {
      writeFileSync(join(runDirectory, envelope.bodyFile), bodyText, { mode: 0o600 });
    }
  },
});

// ---------------------------------------------------------------------------
// Observe (GET only)
// ---------------------------------------------------------------------------

const rows = [];
const observations = [];
let appsOutcome;
try {
  appsOutcome = await observer.listApps(controller.signal);
  if (appsOutcome.kind === "observed") {
    for (const app of appsOutcome.value) {
      const observation = await observer.observeAppRelease(app, controller.signal, {
        limit: buildsLimit,
      });
      observations.push(observation);
      const build =
        observation.builds.kind === "observed" ? (observation.builds.value[0] ?? null) : null;
      const version = observation.projection?.latestAppStoreVersion ?? null;
      rows.push({
        app: app.name,
        bundleId: app.bundleId,
        builds:
          observation.builds.kind === "observed"
            ? build === null
              ? "none"
              : `${build.marketingVersion ?? "?"} (${build.buildNumber}) ${build.processingState}${build.internalBuildState ? "/" + build.internalBuildState : ""}${build.expired ? " expired" : ""}`
            : `${observation.builds.kind}:${observation.builds.code}`,
        storeVersion:
          observation.appStoreVersions.kind === "observed"
            ? version === null
              ? "none"
              : `${version.versionString} ${version.appVersionState ?? version.appStoreState ?? "?"}`
            : `${observation.appStoreVersions.kind}:${observation.appStoreVersions.code}`,
        projectedStage: observation.projection?.projectedStage ?? "-",
        basis: observation.projection?.projectionBasis ?? "-",
      });
    }
  }
} finally {
  clearTimeout(overallTimer);
}

const finishedAt = new Date();
const rateLimits = exchanges
  .map((exchange) => exchange.responseHeaders.find((header) => header.name === "x-rate-limit"))
  .filter((header) => header !== undefined)
  .map((header) => header.value);

const summary = {
  schemaVersion: 1,
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  elapsedMs: finishedAt.getTime() - startedAt.getTime(),
  origin: ASC_API_ORIGIN,
  keyId,
  issuerId,
  credentialReference,
  jwt: { ttlSeconds, scopeToRequest },
  requestTimeoutMs,
  buildsLimit,
  requestCount: exchanges.length,
  methods: [...new Set(exchanges.map((exchange) => exchange.method))],
  statuses: exchanges.map((exchange) => exchange.status),
  rateLimitHeaders: rateLimits,
  apps:
    appsOutcome.kind === "observed"
      ? { kind: "observed", count: appsOutcome.value.length, pages: appsOutcome.pages }
      : appsOutcome,
  table: rows,
};

writeJson("summary.json", summary);
writeJson("exchanges.json", exchanges);
writeJson("apps.json", appsOutcome);
writeJson(
  "observations.json",
  observations.map((observation) => ({
    app: observation.app,
    builds: observation.builds,
    appStoreVersions: observation.appStoreVersions,
    projection: observation.projection,
  })),
);
writeJson(
  "projections.json",
  observations.map((observation) => observation.projection),
);

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

function pad(text, width) {
  return String(text).padEnd(width);
}

console.log(`ASC live read — ${summary.startedAt} — ${String(exchanges.length)} GET request(s)`);
console.log(`results: ${runDirectory}`);
if (appsOutcome.kind !== "observed") {
  console.log(
    `apps: ${appsOutcome.kind} ${appsOutcome.code} (${String(appsOutcome.status)}) ${appsOutcome.detail}`,
  );
} else {
  const widths = {
    app: Math.max(3, ...rows.map((row) => row.app.length)),
    bundleId: Math.max(8, ...rows.map((row) => row.bundleId.length)),
    builds: Math.max(12, ...rows.map((row) => row.builds.length)),
    storeVersion: Math.max(13, ...rows.map((row) => row.storeVersion.length)),
    projectedStage: Math.max(15, ...rows.map((row) => row.projectedStage.length)),
  };
  console.log(
    `${pad("app", widths.app)}  ${pad("bundleId", widths.bundleId)}  ${pad("latest build", widths.builds)}  ${pad("store version", widths.storeVersion)}  ${pad("projected stage", widths.projectedStage)}  basis`,
  );
  for (const row of rows) {
    console.log(
      `${pad(row.app, widths.app)}  ${pad(row.bundleId, widths.bundleId)}  ${pad(row.builds, widths.builds)}  ${pad(row.storeVersion, widths.storeVersion)}  ${pad(row.projectedStage, widths.projectedStage)}  ${row.basis}`,
    );
  }
}
console.log(`statuses: ${summary.statuses.join(",")}`);
if (rateLimits.length > 0) console.log(`x-rate-limit (last): ${rateLimits[rateLimits.length - 1]}`);

process.exit(appsOutcome.kind === "observed" ? 0 : 1);
