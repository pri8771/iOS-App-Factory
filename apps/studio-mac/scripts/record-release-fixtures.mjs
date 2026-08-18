// Regenerates Tests/StudioKitTests/Fixtures/release-*.response.json (Studio Phase 6 step B: the
// `release.projection` / `release.observe` wire results) through the real `@app-factory/contracts`
// build — the same "record through the real contracts" discipline as record-room-fixtures.mjs.
// The observation's content mirrors the shape (not the values) of the first live App Store Connect
// read (docs/operations/asc-live-read.md): several apps, one with a build in internal testing, one
// with no build, and one whose per-app read Apple refused by role, so every cell the rail renders has
// a fixture behind it. Digests are computed exactly the way the daemon computes them
// (`canonicalAscReleaseObservationDigestInputV1` / `canonicalReleaseProjectionDigestInputV1`).
// Re-record with:
//   pnpm --filter @app-factory/contracts build && node apps/studio-mac/scripts/record-release-fixtures.mjs
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  CommandResponseV1Schema,
  RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
  canonicalAscReleaseObservationDigestInputV1,
  canonicalReleaseProjectionDigestInputV1,
  projectAscReleaseStageV1,
} from "../../../packages/contracts/dist/index.js";

const rid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = (result) =>
  CommandResponseV1Schema.parse({ protocolVersion: 1, requestId: rid, ok: true, result });
const sha256 = (text) => `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

const OBSERVED_AT = "2026-08-18T02:26:19.000Z";
const GENERATED_AT = "2026-08-18T02:30:00.000Z";
const SOURCE = {
  keyId: "HGUBSYYP6G",
  issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
  keychainService: "app-factory-asc-key",
  keychainAccount: "HGUBSYYP6G",
  origin: "https://api.appstoreconnect.apple.com",
};
const observed = { kind: "observed", status: 200, pages: 1, code: null, detail: null };
const denied = {
  kind: "denied",
  status: 403,
  pages: null,
  code: "asc.forbidden",
  detail:
    "App Store Connect answered 403 FORBIDDEN_ERROR for GET /v1/apps/6748000004/appStoreVersions",
};

function app(appId, name, bundleId) {
  return { schemaVersion: 1, appId, bundleId, name, sku: null, primaryLocale: "en-US" };
}
function build(appId, buildId, buildNumber, marketingVersion, uploadedDate, extra = {}) {
  return {
    schemaVersion: 1,
    buildId,
    appId,
    buildNumber,
    marketingVersion,
    uploadedDate,
    processingState: "VALID",
    expired: false,
    internalBuildState: "IN_BETA_TESTING",
    externalBuildState: "READY_FOR_BETA_SUBMISSION",
    ...extra,
  };
}
function version(appId, appStoreVersionId, versionString, state, createdDate) {
  return {
    schemaVersion: 1,
    appStoreVersionId,
    appId,
    versionString,
    platform: "IOS",
    appStoreState: state,
    appVersionState: state,
    createdDate,
  };
}
function entry(appRecord, latestBuild, latestAppStoreVersion, outcomes = {}) {
  const builds = outcomes.builds ?? observed;
  const appStoreVersions = outcomes.appStoreVersions ?? observed;
  const projection =
    builds.kind === "observed" && appStoreVersions.kind === "observed"
      ? projectAscReleaseStageV1({
          app: appRecord,
          latestBuild,
          latestAppStoreVersion,
          observedAt: OBSERVED_AT,
        })
      : null;
  return { app: appRecord, builds, appStoreVersions, projection };
}

const anjali = app("6748000001", "Anjali", "com.priyanshchordia.anjali");
const hindsight = app("6748000002", "Hindsight", "com.priyanshchordia.hindsight");
const mala = app("6748000003", "Mala", "com.priyanshchordia.mala");
const roam = app("6748000004", "Roam", "com.priyanshchordia.roam");
const svara = app("6748000005", "Svara", "com.priyanshchordia.svara");

const appObservations = [
  entry(
    anjali,
    build(anjali.appId, "b-anjali-4", "4", "1.0", "2026-08-13T18:02:11.000Z"),
    version(anjali.appId, "v-anjali-1", "1.0", "WAITING_FOR_REVIEW", "2026-08-13T18:40:00.000Z"),
  ),
  entry(
    hindsight,
    build(hindsight.appId, "b-hindsight-4", "4", "1.0", "2026-08-10T21:15:41.000Z"),
    version(
      hindsight.appId,
      "v-hindsight-1",
      "1.0",
      "PREPARE_FOR_SUBMISSION",
      "2026-08-10T21:50:00.000Z",
    ),
  ),
  entry(
    mala,
    build(mala.appId, "b-mala-2", "2", "1.0", "2026-08-06T15:22:03.000Z", {
      internalBuildState: "PROCESSING",
      externalBuildState: null,
      processingState: "PROCESSING",
    }),
    version(mala.appId, "v-mala-1", "1.0", "WAITING_FOR_REVIEW", "2026-08-06T16:00:00.000Z"),
  ),
  // Roam: builds observed (none), App Store versions denied by role -> no projection, honest cell.
  entry(roam, null, null, { appStoreVersions: denied }),
  entry(svara, null, null),
];
// Canonical order: by app name (case-insensitive), then appId.
appObservations.sort((left, right) => {
  const a = `${left.app.name.toLowerCase()} ${left.app.appId}`;
  const b = `${right.app.name.toLowerCase()} ${right.app.appId}`;
  return a < b ? -1 : a > b ? 1 : 0;
});

const observationInput = {
  schemaVersion: 1,
  observationId: "7a000000-0000-4000-8000-000000000001",
  observedAt: OBSERVED_AT,
  source: SOURCE,
  apps: observed,
  appObservations,
  requestCount: 11,
  statuses: [200, 200, 200, 200, 200, 200, 200, 200, 403, 200, 200],
};
const observation = {
  ...observationInput,
  observationDigest: sha256(canonicalAscReleaseObservationDigestInputV1(observationInput)),
};

function projection(input) {
  return {
    ...input,
    generatedAt: GENERATED_AT,
    sourceDigest: sha256(canonicalReleaseProjectionDigestInputV1(input)),
  };
}

const populated = ok({
  operation: "release.projection",
  projection: projection({
    schemaVersion: 1,
    observer: { configured: true, unavailableReason: null, source: SOURCE },
    latest: observation,
    observationCount: 3,
  }),
});
const empty = ok({
  operation: "release.projection",
  projection: projection({
    schemaVersion: 1,
    observer: {
      configured: false,
      unavailableReason: RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
      source: null,
    },
    latest: null,
    observationCount: 0,
  }),
});
const observe = ok({ operation: "release.observe", observation });

const out = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url);
const write = (name, value) =>
  writeFileSync(new URL(name, out), `${JSON.stringify(value, null, 2)}\n`);
write("release-projection.response.json", populated);
write("release-projection-empty.response.json", empty);
write("release-observe.response.json", observe);
console.log(
  "wrote release-projection.response.json, release-projection-empty.response.json, release-observe.response.json",
);
