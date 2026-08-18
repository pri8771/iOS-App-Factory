import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AscReleaseObservationV1Schema,
  canonicalAscReleaseObservationDigestInputV1,
  projectAscReleaseStageV1,
  type AscAppV1,
  type AscReleaseObservationDigestInputV1,
  type AscReleaseObservationV1,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  AscReleaseObservationConflictError,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const roots: string[] = [];

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-asc-observations-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const OBSERVED = { kind: "observed", status: 200, pages: 1, code: null, detail: null } as const;

function observation(
  suffix: number,
  observedAt: string,
  appNames: readonly string[] = ["Hindsight"],
): AscReleaseObservationV1 {
  const apps = appNames.map((name, index): AscAppV1 => ({
    schemaVersion: 1,
    appId: `${suffix}${index}`,
    bundleId: `com.example.${name.toLowerCase()}`,
    name,
    sku: null,
    primaryLocale: null,
  }));
  const input = {
    schemaVersion: 1,
    observationId: `7a000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`,
    observedAt,
    source: {
      keyId: "HGUBSYYP6G",
      issuerId: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
      keychainService: "app-factory-asc-key",
      keychainAccount: "HGUBSYYP6G",
      origin: "https://api.appstoreconnect.apple.com",
    },
    apps: OBSERVED,
    appObservations: apps
      .map((app) => ({
        app,
        builds: OBSERVED,
        appStoreVersions: OBSERVED,
        projection: projectAscReleaseStageV1({
          app,
          latestBuild: null,
          latestAppStoreVersion: null,
          observedAt,
        }),
      }))
      .sort((left, right) =>
        `${left.app.name.toLowerCase()} ${left.app.appId}` <
        `${right.app.name.toLowerCase()} ${right.app.appId}`
          ? -1
          : 1,
      ),
    requestCount: 1 + 2 * apps.length,
    statuses: Array.from({ length: 1 + 2 * apps.length }, () => 200),
  } as AscReleaseObservationDigestInputV1;
  return AscReleaseObservationV1Schema.parse({
    ...input,
    observationDigest: `sha256:${createHash("sha256")
      .update(canonicalAscReleaseObservationDigestInputV1(input), "utf8")
      .digest("hex")}`,
  });
}

describe("AscReleaseObservationRepository", () => {
  it("starts empty, records once, and serves the newest by observedAt", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const repository = repositories.ascReleaseObservations;
    expect(repository.latest()).toBeNull();
    expect(repository.count()).toBe(0);

    const first = observation(1, "2026-08-18T02:26:00.000Z");
    const second = observation(2, "2026-08-18T03:00:00.000Z", ["Roam", "Anjali"]);
    expect(repository.record(second)).toEqual({ observation: second, inserted: true });
    expect(repository.record(first)).toEqual({ observation: first, inserted: true });
    expect(repository.count()).toBe(2);
    expect(repository.latest()).toEqual(second);
    expect(repository.get(first.observationId)).toEqual(first);
    expect(repository.latest()?.appObservations.map(({ app }) => app.name)).toEqual([
      "Anjali",
      "Roam",
    ]);
    db.close();
  });

  it("is idempotent for the same observation and fails closed on a different one under the same id", () => {
    const db = database();
    const repository = createFactoryRepositories(db).ascReleaseObservations;
    const recorded = observation(3, "2026-08-18T02:26:00.000Z");
    expect(repository.record(recorded).inserted).toBe(true);
    expect(repository.record(recorded)).toEqual({ observation: recorded, inserted: false });
    expect(repository.count()).toBe(1);
    const different = { ...observation(3, "2026-08-18T02:27:00.000Z") };
    expect(() => repository.record(different)).toThrow(AscReleaseObservationConflictError);
    expect(repository.count()).toBe(1);
    db.close();
  });

  it("never updates or deletes a recorded observation", () => {
    const db = database();
    const repository = createFactoryRepositories(db).ascReleaseObservations;
    const recorded = observation(4, "2026-08-18T02:26:00.000Z");
    repository.record(recorded);
    expect(() =>
      db
        .prepare(`UPDATE asc_release_observations SET request_count = 99 WHERE observation_id = ?`)
        .run(recorded.observationId),
    ).toThrow(/never rewritten/);
    expect(() =>
      db
        .prepare(`DELETE FROM asc_release_observations WHERE observation_id = ?`)
        .run(recorded.observationId),
    ).toThrow(/retained/);
    expect(repository.get(recorded.observationId)).toEqual(recorded);
    db.close();
  });

  it("projects the wire-visible columns it stores", () => {
    const db = database();
    const repository = createFactoryRepositories(db).ascReleaseObservations;
    const recorded = observation(5, "2026-08-18T02:26:00.000Z", ["Svara", "Mala"]);
    repository.record(recorded);
    const row = db
      .prepare(
        `SELECT key_id, issuer_id, keychain_service, keychain_account, apps_outcome, app_count,
                request_count, observation_digest
           FROM asc_release_observations WHERE observation_id = ?`,
      )
      .get(recorded.observationId);
    expect(row).toEqual({
      key_id: "HGUBSYYP6G",
      issuer_id: "69a6de8c-b017-47e3-e053-5b8c7c11a4d1",
      keychain_service: "app-factory-asc-key",
      keychain_account: "HGUBSYYP6G",
      apps_outcome: "observed",
      app_count: 2,
      request_count: 5,
      observation_digest: recorded.observationDigest,
    });
    db.close();
  });
});
