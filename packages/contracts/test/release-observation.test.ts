import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AscAppReleaseObservationV1Schema,
  AscReadOutcomeSummaryV1Schema,
  AscReleaseObservationV1Schema,
  CommandRequestV1Schema,
  CommandResultV1Schema,
  RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
  ReleaseObserverStatusV1Schema,
  ReleaseProjectionV1Schema,
  canonicalAscReleaseObservationDigestInputV1,
  canonicalReleaseProjectionDigestInputV1,
  projectAscReleaseStageV1,
  type AscAppReleaseObservationV1,
  type AscAppV1,
  type AscBuildV1,
  type AscReleaseObservationDigestInputV1,
  type ReleaseProjectionDigestInputV1,
} from "../src/index.js";

const OBSERVED_AT = "2026-08-18T02:26:00.000Z";
const OBSERVATION_ID = "7a000000-0000-4000-8000-000000000001";

const SOURCE = {
  keyId: "HGUBSYYP6G",
  issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
  keychainService: "app-factory-asc-key",
  keychainAccount: "HGUBSYYP6G",
  origin: "https://api.appstoreconnect.apple.com",
} as const;

const OBSERVED = { kind: "observed", status: 200, pages: 1, code: null, detail: null } as const;

function app(name: string, appId: string): AscAppV1 {
  return {
    schemaVersion: 1,
    appId,
    bundleId: `com.priyanshchordia.${name.toLowerCase()}`,
    name,
    sku: null,
    primaryLocale: "en-US",
  };
}

function build(appId: string, buildNumber: string, internal: string | null): AscBuildV1 {
  return {
    schemaVersion: 1,
    buildId: `b-${appId}-${buildNumber}`,
    appId,
    buildNumber,
    marketingVersion: "1.0",
    uploadedDate: "2026-08-16T21:26:00.000Z",
    processingState: "VALID",
    expired: false,
    internalBuildState: internal,
    externalBuildState: null,
  };
}

function appObservation(
  name: string,
  appId: string,
  latestBuild: AscBuildV1 | null,
): AscAppReleaseObservationV1 {
  const record = app(name, appId);
  return {
    app: record,
    builds: OBSERVED,
    appStoreVersions: OBSERVED,
    projection: projectAscReleaseStageV1({
      app: record,
      latestBuild,
      latestAppStoreVersion: null,
      observedAt: OBSERVED_AT,
    }),
  };
}

function observationInput(): AscReleaseObservationDigestInputV1 {
  return {
    schemaVersion: 1,
    observationId: OBSERVATION_ID,
    observedAt: OBSERVED_AT,
    source: SOURCE,
    apps: OBSERVED,
    appObservations: [
      appObservation("Hindsight", "1001", build("1001", "4", "IN_BETA_TESTING")),
      appObservation("Roam", "1003", null),
      appObservation("roam-legacy", "1002", build("1002", "1", null)),
    ],
    requestCount: 7,
    statuses: [200, 200, 200, 200, 200, 200, 200],
  } as AscReleaseObservationDigestInputV1;
}

function digest(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function observation() {
  const input = observationInput();
  return AscReleaseObservationV1Schema.parse({
    ...input,
    observationDigest: digest(canonicalAscReleaseObservationDigestInputV1(input)),
  });
}

describe("AscReadOutcomeSummaryV1", () => {
  it("accepts an observed outcome only with status and pages, and no error fields", () => {
    expect(AscReadOutcomeSummaryV1Schema.safeParse(OBSERVED).success).toBe(true);
    expect(
      AscReadOutcomeSummaryV1Schema.safeParse({ ...OBSERVED, code: "asc.something" }).success,
    ).toBe(false);
    expect(AscReadOutcomeSummaryV1Schema.safeParse({ ...OBSERVED, pages: null }).success).toBe(
      false,
    );
  });

  it("requires code+detail on denied/ambiguous and 401/403 on denied", () => {
    expect(
      AscReadOutcomeSummaryV1Schema.safeParse({
        kind: "denied",
        status: 403,
        pages: null,
        code: "asc.forbidden",
        detail: "the key's role cannot read builds",
      }).success,
    ).toBe(true);
    expect(
      AscReadOutcomeSummaryV1Schema.safeParse({
        kind: "denied",
        status: 500,
        pages: null,
        code: "asc.forbidden",
        detail: "x",
      }).success,
    ).toBe(false);
    expect(
      AscReadOutcomeSummaryV1Schema.safeParse({
        kind: "ambiguous",
        status: null,
        pages: null,
        code: "asc.transport-error",
        detail: "fetch failed",
      }).success,
    ).toBe(true);
    expect(
      AscReadOutcomeSummaryV1Schema.safeParse({
        kind: "ambiguous",
        status: null,
        pages: 2,
        code: "asc.transport-error",
        detail: "fetch failed",
      }).success,
    ).toBe(false);
  });
});

describe("AscAppReleaseObservationV1", () => {
  it("carries a projection exactly when both per-app reads were observed", () => {
    const entry = appObservation("Hindsight", "1001", build("1001", "4", "IN_BETA_TESTING"));
    expect(AscAppReleaseObservationV1Schema.safeParse(entry).success).toBe(true);
    expect(entry.projection?.projectedStage).toBe("internal-testflight-available");
    expect(AscAppReleaseObservationV1Schema.safeParse({ ...entry, projection: null }).success).toBe(
      false,
    );
    const denied = {
      ...entry,
      builds: {
        kind: "denied",
        status: 403,
        pages: null,
        code: "asc.forbidden",
        detail: "no",
      },
      projection: null,
    };
    expect(AscAppReleaseObservationV1Schema.safeParse(denied).success).toBe(true);
    expect(
      AscAppReleaseObservationV1Schema.safeParse({ ...denied, projection: entry.projection })
        .success,
    ).toBe(false);
  });

  it("rejects a projection describing a different app", () => {
    const entry = appObservation("Hindsight", "1001", null);
    const other = appObservation("Roam", "1003", null);
    expect(
      AscAppReleaseObservationV1Schema.safeParse({ ...entry, projection: other.projection })
        .success,
    ).toBe(false);
  });
});

describe("AscReleaseObservationV1", () => {
  it("accepts a canonical, digest-bound observation and round-trips its digest input", () => {
    const parsed = observation();
    expect(parsed.appObservations.map(({ app: a }) => a.name)).toEqual([
      "Hindsight",
      "Roam",
      "roam-legacy",
    ]);
    expect(
      digest(canonicalAscReleaseObservationDigestInputV1(parsed)) === parsed.observationDigest,
    ).toBe(true);
  });

  it("rejects unsorted, duplicated, or apps-without-list observations", () => {
    const input = observationInput();
    const digested = (candidate: AscReleaseObservationDigestInputV1) => ({
      ...candidate,
      observationDigest: digest(canonicalAscReleaseObservationDigestInputV1(candidate)),
    });
    const reversed = digested({
      ...input,
      appObservations: [...input.appObservations].reverse(),
    });
    expect(AscReleaseObservationV1Schema.safeParse(reversed).success).toBe(false);
    const [firstEntry] = input.appObservations;
    if (firstEntry === undefined) throw new Error("fixture has no app observations");
    const duplicated = digested({
      ...input,
      appObservations: [firstEntry, firstEntry],
    });
    expect(AscReleaseObservationV1Schema.safeParse(duplicated).success).toBe(false);
    const appsDenied = digested({
      ...input,
      apps: { kind: "denied", status: 401, pages: null, code: "asc.unauthorized", detail: "no" },
    });
    expect(AscReleaseObservationV1Schema.safeParse(appsDenied).success).toBe(false);
    const appsDeniedEmpty = digested({ ...appsDenied, appObservations: [] });
    expect(AscReleaseObservationV1Schema.safeParse(appsDeniedEmpty).success).toBe(true);
    const tooManyStatuses = digested({ ...input, requestCount: 2 });
    expect(AscReleaseObservationV1Schema.safeParse(tooManyStatuses).success).toBe(false);
  });
});

describe("ReleaseProjectionV1", () => {
  const configured = { configured: true, unavailableReason: null, source: SOURCE };
  const unconfigured = {
    configured: false,
    unavailableReason: RELEASE_OBSERVER_NOT_CONFIGURED_REASON_V1,
    source: null,
  };

  function projection(input: ReleaseProjectionDigestInputV1, generatedAt = OBSERVED_AT) {
    return {
      ...input,
      generatedAt,
      sourceDigest: digest(canonicalReleaseProjectionDigestInputV1(input)),
    };
  }

  it("keeps observer status honest: reason iff unconfigured, source iff configured", () => {
    expect(ReleaseObserverStatusV1Schema.safeParse(configured).success).toBe(true);
    expect(ReleaseObserverStatusV1Schema.safeParse(unconfigured).success).toBe(true);
    expect(ReleaseObserverStatusV1Schema.safeParse({ ...configured, source: null }).success).toBe(
      false,
    );
    expect(
      ReleaseObserverStatusV1Schema.safeParse({ ...unconfigured, unavailableReason: null }).success,
    ).toBe(false);
  });

  it("serves an honest empty projection and a populated one", () => {
    const empty = projection({
      schemaVersion: 1,
      observer: unconfigured,
      latest: null,
      observationCount: 0,
    });
    expect(ReleaseProjectionV1Schema.safeParse(empty).success).toBe(true);
    const populated = projection({
      schemaVersion: 1,
      observer: configured,
      latest: observation(),
      observationCount: 3,
    });
    expect(ReleaseProjectionV1Schema.safeParse(populated).success).toBe(true);
    // An unconfigured daemon still serves what an earlier configured one persisted.
    expect(
      ReleaseProjectionV1Schema.safeParse(projection({ ...populated, observer: unconfigured }))
        .success,
    ).toBe(true);
  });

  it("rejects latest/count disagreement and a latest observation after generatedAt", () => {
    expect(
      ReleaseProjectionV1Schema.safeParse(
        projection({ schemaVersion: 1, observer: unconfigured, latest: null, observationCount: 1 }),
      ).success,
    ).toBe(false);
    expect(
      ReleaseProjectionV1Schema.safeParse(
        projection({
          schemaVersion: 1,
          observer: configured,
          latest: observation(),
          observationCount: 0,
        }),
      ).success,
    ).toBe(false);
    expect(
      ReleaseProjectionV1Schema.safeParse(
        projection(
          { schemaVersion: 1, observer: configured, latest: observation(), observationCount: 1 },
          "2026-08-18T02:25:00.000Z",
        ),
      ).success,
    ).toBe(false);
  });
});

describe("release.* command protocol", () => {
  const metadata = {
    schemaVersion: 1,
    commandId: "20000000-0000-4000-8000-000000000077",
    issuedAt: OBSERVED_AT,
    origin: "cli",
  } as const;

  it("accepts the strict requests and results", () => {
    expect(
      CommandRequestV1Schema.safeParse({
        ...metadata,
        operation: "release.observe",
        payload: { buildsLimit: 5 },
      }).success,
    ).toBe(true);
    expect(
      CommandRequestV1Schema.safeParse({
        ...metadata,
        operation: "release.projection",
        payload: {},
      }).success,
    ).toBe(true);
    expect(
      CommandResultV1Schema.safeParse({ operation: "release.observe", observation: observation() })
        .success,
    ).toBe(true);
    const input: ReleaseProjectionDigestInputV1 = {
      schemaVersion: 1,
      observer: { configured: true, unavailableReason: null, source: SOURCE },
      latest: observation(),
      observationCount: 1,
    };
    expect(
      CommandResultV1Schema.safeParse({
        operation: "release.projection",
        projection: {
          ...input,
          generatedAt: OBSERVED_AT,
          sourceDigest: digest(canonicalReleaseProjectionDigestInputV1(input)),
        },
      }).success,
    ).toBe(true);
  });
});
