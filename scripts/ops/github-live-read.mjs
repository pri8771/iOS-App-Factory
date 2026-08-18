#!/usr/bin/env node
// Manual-only, STRICTLY READ-ONLY live smoke of the GitHub provider boundary:
// the first live provider HTTP calls this repository has ever made, made the
// repository's own way -- a Keychain credential *reference* resolved
// just-in-time by `@app-factory/credential-broker` inside
// `@app-factory/provider-transport`'s bounded fetch transport, never by this
// script. Documented in docs/operations/github-live-read.md.
//
// It is NOT wired into `pnpm test` or `pnpm verify` and must never be: every
// invocation makes real GitHub API calls. It refuses to run unless the
// operator sets CONFIRM_LIVE=yes, and it never issues a GraphQL mutation:
// the only requests are the owner-binding proof, the read observers in
// packages/provider-http-adapters/src/github.ts, and one script-level
// discovery query per repository (default branch head + open PR numbers) so
// the observers have real numbers/SHAs to read.
//
// What it produces (all files 0600 under a 0700 results dir):
//   github-owner-binding.json  the digest-bound GitHubOwnerBindingV1 artifact
//   calls.jsonl                every request/response envelope (redacted per
//                              effect-worker's redactProviderDetail), timings,
//                              allowlisted rate-limit headers, and errors
//   observations.json          what each read observer returned or why it failed
//   summary.json / log.txt     the short summary printed at the end
// and, when AF_GITHUB_SMOKE_ETC_DIR is set, a copy of the binding at
// <etc>/github-owner-binding.json (the "current binding" a daemon composition
// would read; not consumed by anything yet).
//
// Required environment:
//   CONFIRM_LIVE                       must be exactly "yes"
//   AF_GITHUB_SMOKE_OWNER              enrolled GitHub owner login (e.g. pri8771)
//   AF_GITHUB_SMOKE_REPOSITORIES       comma-separated owner/name list under that owner
//   AF_GITHUB_SMOKE_KEYCHAIN_SERVICE   macOS Keychain generic-password service name
//   AF_GITHUB_SMOKE_KEYCHAIN_ACCOUNT   macOS Keychain account name
//   AF_GITHUB_SMOKE_RESULTS_ROOT       absolute private dir; <timestamp>/ is created per run
// Optional:
//   AF_GITHUB_SMOKE_API_BASE_URL       default https://api.github.com (also the credential origin)
//   AF_GITHUB_SMOKE_ETC_DIR            absolute private dir for the current-binding copy
//   AF_GITHUB_SMOKE_MAX_PULL_REQUESTS  open PRs per repository to observe (default 3, max 10)
//   AF_GITHUB_SMOKE_STOP_AFTER_BINDING=yes  make only the owner-binding call, then exit
//
// Usage (from the repository root, after `pnpm build`):
//   CONFIRM_LIVE=yes AF_GITHUB_SMOKE_... node scripts/ops/github-live-read.mjs

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const {
  createGitHubOwnerBinding,
  createGitHubReadObserver,
  createProviderHttpRequest,
  assertGitHubOwnerBindingMatches,
  performProviderHttpRequest,
  providerBaseUrl,
  providerUrl,
} = await import(join(repositoryRoot, "packages/provider-http-adapters/dist/index.js"));
const { createFetchProviderHttpTransport } = await import(
  join(repositoryRoot, "packages/provider-transport/dist/index.js")
);
const { createCredentialBroker } = await import(
  join(repositoryRoot, "packages/credential-broker/dist/index.js")
);
const { redactProviderDetail } = await import(
  join(repositoryRoot, "packages/effect-worker/dist/index.js")
);
const { canonicalJson, digestCanonical } = await import(
  join(repositoryRoot, "packages/work-tracking-integrations/dist/index.js")
);

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

function requireAbsoluteEnvironment(name) {
  const value = requireEnvironment(name);
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

if (requireEnvironment("CONFIRM_LIVE") !== "yes") {
  throw new Error("Refusing to run: CONFIRM_LIVE must be exactly 'yes'");
}
const owner = requireEnvironment("AF_GITHUB_SMOKE_OWNER");
const enrolledRepositories = requireEnvironment("AF_GITHUB_SMOKE_REPOSITORIES")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);
const credentialReference = {
  schemaVersion: 1,
  kind: "macos-keychain",
  service: requireEnvironment("AF_GITHUB_SMOKE_KEYCHAIN_SERVICE"),
  account: requireEnvironment("AF_GITHUB_SMOKE_KEYCHAIN_ACCOUNT"),
};
const resultsRoot = requireAbsoluteEnvironment("AF_GITHUB_SMOKE_RESULTS_ROOT");
const apiBaseUrl = process.env.AF_GITHUB_SMOKE_API_BASE_URL ?? "https://api.github.com";
const etcDirectory = process.env.AF_GITHUB_SMOKE_ETC_DIR;
if (etcDirectory !== undefined && !isAbsolute(etcDirectory)) {
  throw new Error("AF_GITHUB_SMOKE_ETC_DIR must be an absolute path");
}
const maxPullRequests = Math.min(
  10,
  Math.max(0, Number.parseInt(process.env.AF_GITHUB_SMOKE_MAX_PULL_REQUESTS ?? "3", 10) || 0),
);
const stopAfterBinding = process.env.AF_GITHUB_SMOKE_STOP_AFTER_BINDING === "yes";

const startedAt = new Date();
const resultsDirectory = join(resultsRoot, startedAt.toISOString().replace(/[:.]/g, "-"));
mkdirSync(resultsRoot, { recursive: true, mode: 0o700 });
chmodSync(resultsRoot, 0o700);
mkdirSync(resultsDirectory, { recursive: true, mode: 0o700 });
chmodSync(resultsDirectory, 0o700);
for (const path of [resultsRoot, resultsDirectory]) {
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
    throw new Error(`${path} must be a private (0700), non-symlink directory`);
  }
}

const log = [];
function note(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  log.push(line);
  process.stdout.write(`${line}\n`);
}
function writeResult(name, contents) {
  writeFileSync(join(resultsDirectory, name), contents, { mode: 0o600 });
}
function writeJsonResult(name, value) {
  writeResult(name, `${JSON.stringify(value, null, 2)}\n`);
}
function redactedText(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(redactProviderDetail(bytes, 64 * 1024));
}
function errorRecord(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: redactedText(Buffer.from(error instanceof Error ? error.message : String(error))),
    code: error !== null && typeof error === "object" && "code" in error ? error.code : null,
  };
}

// ---------------------------------------------------------------------------
// The trust boundary: broker -> fetch transport -> recording wrapper
// ---------------------------------------------------------------------------

const broker = createCredentialBroker();
const fetchTransport = createFetchProviderHttpTransport({ credentials: broker });

// Records every envelope that crosses the transport contract. It sits
// OUTSIDE the fetch transport, so it only ever sees ProviderHttpRequestV1
// (which by contract carries no credential header) and the projected,
// allowlisted ProviderHttpResponseV1 -- never the resolved Authorization
// value or the raw fetch Response.
let callSequence = 0;
let lastRateLimit = null;
let lastResponse = null;
const httpStatuses = [];
const callsPath = join(resultsDirectory, "calls.jsonl");
writeFileSync(callsPath, "", { mode: 0o600 });
const recordingTransport = {
  async request(request) {
    callSequence += 1;
    const sequence = callSequence;
    const began = process.hrtime.bigint();
    const record = {
      sequence,
      startedAt: new Date().toISOString(),
      request: {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body === null ? null : redactedText(request.body),
        credentialReference: request.credentialReference,
        credentialOrigin: request.credentialOrigin,
        deadline: request.deadline,
        maximumResponseBytes: request.maximumResponseBytes,
      },
      response: null,
      error: null,
      durationMs: null,
    };
    try {
      const raw = await fetchTransport.request(request);
      httpStatuses.push(raw.status);
      lastResponse = record.response = {
        status: raw.status,
        headers: raw.headers,
        body: redactedText(raw.body),
        bodyBytes: raw.body.byteLength,
      };
      const remaining = raw.headers.find((header) => header.name === "x-ratelimit-remaining");
      const reset = raw.headers.find((header) => header.name === "x-ratelimit-reset");
      const resource = raw.headers.find((header) => header.name === "x-ratelimit-resource");
      if (remaining !== undefined) {
        lastRateLimit = {
          remaining: remaining.value,
          reset: reset?.value ?? null,
          resource: resource?.value ?? null,
        };
      }
      return raw;
    } catch (error) {
      record.error = errorRecord(error);
      throw error;
    } finally {
      record.durationMs = Number(process.hrtime.bigint() - began) / 1_000_000;
      appendFileSync(callsPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      note(
        `call #${String(sequence)} ${request.method} ${request.url} -> ` +
          `${record.response ? `HTTP ${String(record.response.status)}` : `ERROR ${record.error.name}`} ` +
          `in ${record.durationMs.toFixed(0)} ms` +
          (lastRateLimit ? ` (rate-limit remaining ${lastRateLimit.remaining})` : ""),
      );
    }
  },
};

const observations = [];
async function observe(label, run) {
  const began = process.hrtime.bigint();
  const entry = { label, outcome: null, value: null, error: null, durationMs: null };
  try {
    entry.value = await run();
    entry.outcome = "ok";
  } catch (error) {
    entry.outcome = "failed";
    entry.error = errorRecord(error);
  } finally {
    entry.durationMs = Number(process.hrtime.bigint() - began) / 1_000_000;
    observations.push(entry);
    note(
      `${label}: ${entry.outcome}${entry.error ? ` -- ${entry.error.name}: ${entry.error.message}` : ""}`,
    );
  }
  return entry;
}

const summary = {
  schemaVersion: 1,
  startedAt: startedAt.toISOString(),
  finishedAt: null,
  repositoryRoot,
  apiBaseUrl,
  owner,
  enrolledRepositories,
  credentialReference,
  credentialPreflight: null,
  binding: null,
  bindingDigest: null,
  bindingPath: null,
  liveCallCount: 0,
  httpStatuses: [],
  lastRateLimit: null,
  observations: [],
  outcome: "incomplete",
  error: null,
  hint: null,
};

try {
  // -------------------------------------------------------------------------
  // 0. Credential preflight: metadata-only Keychain probe (no -w), by the broker.
  // -------------------------------------------------------------------------
  const preflight = await broker.preflight(credentialReference, new AbortController().signal);
  summary.credentialPreflight = {
    available: preflight.available,
    blockerCode: preflight.blockerCode,
  };
  note(
    `credential preflight (${credentialReference.service}/${credentialReference.account}): ` +
      `${preflight.available ? "available" : `unavailable (${preflight.blockerCode})`}`,
  );
  if (!preflight.available) throw new Error("credential preflight failed; nothing dispatched");

  // -------------------------------------------------------------------------
  // 1. The owner-binding proof (one read-only GraphQL call).
  // -------------------------------------------------------------------------
  const binding = await createGitHubOwnerBinding(
    {
      transport: recordingTransport,
      apiBaseUrl,
      owner,
      enrolledRepositories,
      credentialReference,
    },
    new AbortController().signal,
  );
  // Re-validate exactly the way a consumer would before trusting it.
  assertGitHubOwnerBindingMatches(JSON.parse(JSON.stringify(binding)), {
    owner,
    ownerNodeId: binding.ownerNodeId,
    credentialReference,
    credentialOrigin: apiBaseUrl,
  });
  const bindingJson = `${JSON.stringify(binding, null, 2)}\n`;
  writeResult("github-owner-binding.json", bindingJson);
  summary.binding = binding;
  summary.bindingDigest = binding.bindingDigest;
  summary.bindingPath = join(resultsDirectory, "github-owner-binding.json");
  note(
    `owner binding: viewer=${binding.viewerLogin} owner=${binding.ownerLogin} (${binding.ownerType}) ` +
      `ownerNodeId=${binding.ownerNodeId} observed=${binding.observedRepositories.map((r) => r.fullName).join(",") || "(none)"} ` +
      `digest=${binding.bindingDigest}`,
  );
  if (etcDirectory !== undefined) {
    mkdirSync(etcDirectory, { recursive: true, mode: 0o700 });
    chmodSync(etcDirectory, 0o700);
    writeFileSync(join(etcDirectory, "github-owner-binding.json"), bindingJson, { mode: 0o600 });
    note(`owner binding copied to ${join(etcDirectory, "github-owner-binding.json")}`);
  }

  if (stopAfterBinding) {
    note("AF_GITHUB_SMOKE_STOP_AFTER_BINDING=yes: stopping after the binding call");
  } else {
    // -----------------------------------------------------------------------
    // 2. The existing read observers, constructed FROM the binding.
    // -----------------------------------------------------------------------
    const observer = createGitHubReadObserver({
      transport: recordingTransport,
      apiBaseUrl,
      owner: binding.ownerLogin,
      ownerNodeId: binding.ownerNodeId,
      credentialReference,
    });
    const base = providerBaseUrl(apiBaseUrl, "GitHub API base URL");
    const signal = new AbortController().signal;

    // Script-level, read-only discovery so the observers get real inputs.
    // Not an adapter method: the observers need a PR number / commit SHA
    // and no existing observer lists them.
    const DISCOVERY_QUERY =
      "query AppFactoryLiveReadDiscovery($owner: String!, $name: String!, $first: Int!) { repository(owner: $owner, name: $name) { nameWithOwner defaultBranchRef { name target { oid } } pullRequests(states: OPEN, first: $first, orderBy: {field: UPDATED_AT, direction: DESC}) { totalCount nodes { number headRefOid } } } }";
    async function discover(fullName) {
      const [repoOwner, name] = fullName.split("/");
      const body = Buffer.from(
        canonicalJson({
          query: DISCOVERY_QUERY,
          variables: { owner: repoOwner, name, first: Math.max(1, maxPullRequests) },
        }),
        "utf8",
      );
      const request = createProviderHttpRequest({
        method: "POST",
        url: providerUrl(base, "/graphql"),
        headers: [
          { name: "accept", value: "application/vnd.github+json" },
          { name: "content-type", value: "application/json" },
          { name: "x-github-api-version", value: "2022-11-28" },
        ],
        body,
        credentialReference,
        credentialOrigin: base.origin,
        deadline: new Date(Date.now() + 15_000).toISOString(),
        signal,
      });
      const response = await performProviderHttpRequest(recordingTransport, request);
      if (response.status !== 200) throw new Error(`discovery returned HTTP ${response.status}`);
      const parsed = JSON.parse(Buffer.from(response.body).toString("utf8"));
      const repository = parsed?.data?.repository;
      if (!repository) throw new Error("discovery returned no repository");
      return {
        nameWithOwner: repository.nameWithOwner,
        defaultBranch: repository.defaultBranchRef?.name ?? null,
        defaultBranchHeadSha: repository.defaultBranchRef?.target?.oid ?? null,
        openPullRequestCount: repository.pullRequests?.totalCount ?? null,
        openPullRequests: (repository.pullRequests?.nodes ?? [])
          .slice(0, maxPullRequests)
          .map((node) => ({ number: node.number, headRefOid: node.headRefOid })),
      };
    }

    for (const fullName of binding.observedRepositories.map((entry) => entry.fullName)) {
      // observeRepository requires the App Factory marker in the repository
      // description; enrolled repositories were not created by App Factory,
      // so this is expected to fail AFTER a successful HTTP 200 -- that
      // outcome is recorded honestly rather than papered over.
      await observe(`observeRepository ${fullName}`, () =>
        observer.observeRepository(fullName, signal),
      );

      const discovery = await observe(`discovery ${fullName}`, () => discover(fullName));
      if (discovery.outcome !== "ok") continue;
      const { defaultBranchHeadSha, openPullRequests } = discovery.value;

      if (defaultBranchHeadSha !== null) {
        await observe(
          `observeChecks ${fullName}@${discovery.value.defaultBranch} ${defaultBranchHeadSha}`,
          () => observer.observeChecks(fullName, defaultBranchHeadSha, signal),
        );
      }
      for (const pull of openPullRequests) {
        await observe(`observePullRequest ${fullName}#${String(pull.number)}`, () =>
          observer.observePullRequest(fullName, pull.number, signal),
        );
        await observe(`observeChecks ${fullName}#${String(pull.number)} ${pull.headRefOid}`, () =>
          observer.observeChecks(fullName, pull.headRefOid, signal),
        );
        await observe(`observePullRequestComments ${fullName}#${String(pull.number)}`, () =>
          observer.observePullRequestComments(fullName, pull.number, signal),
        );
      }
    }
    // Deliberately NOT exercised: observeDelivery and findByCorrelation
    // (both start with the marker-gated repository observation above and
    // would fail identically), and createGitHubHttpAdapter (mutation
    // adapter; requires an EffectPayloadReader and is out of scope for a
    // read-only proof).
  }
  summary.outcome = "completed";
} catch (error) {
  summary.outcome = "failed";
  summary.error = errorRecord(error);
  note(`FAILED: ${summary.error.name}: ${summary.error.message}`);
  // Operator hint only (nothing here inspects credential bytes): GitHub
  // answers "Requires authentication" when the Authorization value carried
  // no recognisable scheme, and "Bad credentials" when a scheme was present
  // but the token itself was rejected. The transport forwards the Keychain
  // value verbatim, so the former means the item was stored as a bare
  // token instead of the complete header value "Bearer <token>".
  if (lastResponse?.status === 401) {
    const body = lastResponse.body ?? "";
    summary.hint = body.includes("Requires authentication")
      ? "HTTP 401 'Requires authentication': the Keychain item does not hold a complete Authorization header value; re-provision it as 'Bearer <token>' (the transport forwards the stored value verbatim)."
      : body.includes("Bad credentials")
        ? "HTTP 401 'Bad credentials': the stored token itself was rejected by GitHub (revoked, expired, or mistyped)."
        : "HTTP 401 with an unrecognised body; see calls.jsonl.";
    note(`hint: ${summary.hint}`);
  }
} finally {
  summary.finishedAt = new Date().toISOString();
  summary.liveCallCount = callSequence;
  summary.httpStatuses = httpStatuses;
  summary.lastRateLimit = lastRateLimit;
  summary.observations = observations.map((entry) => ({
    label: entry.label,
    outcome: entry.outcome,
    error: entry.error,
    durationMs: entry.durationMs,
  }));
  writeJsonResult("observations.json", observations);
  writeJsonResult("summary.json", summary);
  writeResult("log.txt", `${log.join("\n")}\n`);
  // Digest of the summary for the operations record.
  summary.summaryDigest = digestCanonical(JSON.parse(JSON.stringify(summary)));
  writeJsonResult("summary.json", summary);
  note(`results: ${resultsDirectory}`);
  note(
    `outcome=${summary.outcome} liveCalls=${String(callSequence)} ` +
      `bindingDigest=${summary.bindingDigest ?? "(none)"} ` +
      `rateLimitRemaining=${lastRateLimit?.remaining ?? "(unknown)"}`,
  );
  if (!existsSync(join(resultsDirectory, "summary.json"))) process.exitCode = 2;
  if (summary.outcome !== "completed") process.exitCode = 1;
}
