import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProviderBuildObservationError,
  assertUsableProviderBuildObservationV1,
} from "@app-factory/contracts";

import {
  ReleaseBuildNumberRepository,
  ReleaseRunRepository,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const T0 = "2026-09-08T18:00:00.000Z";
const T1 = "2026-09-08T18:00:01.000Z";
const T2 = "2026-09-08T18:10:00.000Z";
const DIGEST = `sha256:${"c".repeat(64)}`;
const BUNDLE_ID = "com.pchordia.aurafit";
const PROJECT_ID = "9c000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "9c000000-0000-4000-8000-000000000002";
const RELEASE_ID = "9c000000-0000-4000-8000-000000000003";
const RELEASE_RUN_ID = "9c000000-0000-4000-8000-000000000004";
const COMMAND_ID = "9c000000-0000-4000-8000-0000000000a1";
const SOURCE_COMMIT = "1".repeat(40);

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-or31-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

function seedReleaseRun(db: ReturnType<typeof database>) {
  new ReleaseRunRepository(db).upsert({
    commandId: COMMAND_ID,
    origin: "system",
    issuedAt: T0,
    recordedAt: T0,
    run: {
      schemaVersion: 1,
      releaseRunId: RELEASE_RUN_ID,
      projectId: PROJECT_ID,
      repositoryId: REPOSITORY_ID,
      releaseId: RELEASE_ID,
      sourceCommit: SOURCE_COMMIT,
      branch: "main",
      stage: "candidate",
      revision: 1,
      promotion: null,
      archive: null,
      upload: null,
      unevaluated: [],
      notes: [],
      createdAt: T0,
      updatedAt: T0,
    },
  });
}

describe("OR-31 protected release offline conformance", () => {
  it("fails closed on stale and ambiguous max-build observations", () => {
    expect(() =>
      assertUsableProviderBuildObservationV1(
        {
          schemaVersion: 1,
          observationId: randomUUID(),
          bundleId: BUNDLE_ID,
          platform: "ios",
          observedAt: T0,
          freshnessDeadline: T1,
          kind: "known-maximum",
          maximumBuildNumber: "9",
          evidenceDigest: DIGEST,
        },
        T2,
      ),
    ).toThrow(ProviderBuildObservationError);

    expect(() =>
      assertUsableProviderBuildObservationV1(
        {
          schemaVersion: 1,
          observationId: randomUUID(),
          bundleId: BUNDLE_ID,
          platform: "ios",
          observedAt: T0,
          freshnessDeadline: T2,
          kind: "ambiguous",
          maximumBuildNumber: null,
          evidenceDigest: DIGEST,
        },
        T1,
      ),
    ).toThrow(/ambiguous/);
  });

  it("reserves monotonic builds against known-maximum fake observations", () => {
    const db = database();
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    const first = repo.allocateNextAgainstObservation(
      BUNDLE_ID,
      RELEASE_RUN_ID,
      {
        schemaVersion: 1,
        observationId: randomUUID(),
        bundleId: BUNDLE_ID,
        platform: "ios",
        observedAt: T0,
        freshnessDeadline: T2,
        kind: "known-maximum",
        maximumBuildNumber: "10",
        evidenceDigest: DIGEST,
      },
      T1,
    );
    expect(first.buildNumber).toBe("11");
    const second = repo.allocateNextAgainstObservation(
      BUNDLE_ID,
      RELEASE_RUN_ID,
      {
        schemaVersion: 1,
        observationId: randomUUID(),
        bundleId: BUNDLE_ID,
        platform: "ios",
        observedAt: T0,
        freshnessDeadline: T2,
        kind: "known-maximum",
        maximumBuildNumber: "10",
        evidenceDigest: DIGEST,
      },
      T1,
    );
    expect(second.buildNumber).toBe("12");
    db.close();
  });
});
