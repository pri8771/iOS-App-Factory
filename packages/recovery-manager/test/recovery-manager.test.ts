import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME,
  openMigratedFactoryDatabase,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  RecoveryManagerError,
  assertRuntimeRecoveryReady,
  completeRecoveryReconciliation,
  createRecoveryBundle,
  readRecoveryState,
  releaseRuntimeRecoveryQuarantine,
  restoreRecoveryBundle,
  verifyRecoveryBundle,
} from "../src/index.js";

const temporaryDirectories: string[] = [];
const DIGEST = `sha256:${"a".repeat(64)}` as const;
const RECONCILIATION_DIGEST = `sha256:${"b".repeat(64)}` as const;

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-recovery-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function bundleFixture(root: string, evidence = true) {
  const database = openMigratedFactoryDatabase(join(root, "live.sqlite3"));
  database.exec("CREATE TABLE recovery_probe (value TEXT NOT NULL) STRICT");
  database.prepare("INSERT INTO recovery_probe(value) VALUES (?)").run("durable");
  const bundle = await createRecoveryBundle({
    database,
    destinationDirectory: join(root, "bundle"),
    createdAt: "2026-08-10T12:00:00.000Z",
    evidence: evidence ? [{ digest: DIGEST, logicalName: "attempt-evidence" }] : [],
  });
  database.close();
  return bundle;
}

describe("control-plane recovery", () => {
  it("restores into durable quarantine and resumes only after verified reconciliation", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root);
    expect(await verifyRecoveryBundle(bundle.directory, bundle.manifestDigest, () => true)).toEqual(
      bundle,
    );
    const result = await restoreRecoveryBundle({
      bundleDirectory: bundle.directory,
      expectedManifestDigest: bundle.manifestDigest,
      runtimeDirectory: join(root, "restored"),
      verifyEvidence: (entry) => entry.digest === DIGEST,
      restoredAt: "2026-08-11T12:00:00.000Z",
    });
    expect(result).toMatchObject({
      verifiedEvidenceCount: 1,
      recoveryStateRevision: 2,
      integrity: "ok",
      reconciliationRequired: true,
    });
    expect(readRecoveryState(result.runtimeDirectory)).toMatchObject({
      revision: 2,
      status: "quarantined",
    });
    expect(() => assertRuntimeRecoveryReady(result.runtimeDirectory)).toThrow("quarantined");
    const restored = openMigratedFactoryDatabase(result.databasePath, { fileMustExist: true });
    expect(restored.prepare("SELECT value FROM recovery_probe").get()).toEqual({
      value: "durable",
    });
    restored.close();

    expect(
      completeRecoveryReconciliation({
        runtimeDirectory: result.runtimeDirectory,
        expectedManifestDigest: result.sourceManifestDigest,
        expectedDatabaseDigest: result.restoredDatabaseDigest,
        reconciliationEvidenceDigest: RECONCILIATION_DIGEST,
        reconciledAt: "2026-08-11T13:00:00.000Z",
        verifyReconciliationEvidence: (digest) => digest === RECONCILIATION_DIGEST,
      }),
    ).toMatchObject({ revision: 3, status: "reconciled" });
    expect(() => assertRuntimeRecoveryReady(result.runtimeDirectory)).not.toThrow();
    expect(
      releaseRuntimeRecoveryQuarantine({
        runtimeDirectory: result.runtimeDirectory,
        releasedAt: "2026-08-11T14:00:00.000Z",
      }),
    ).toMatchObject({ revision: 4, status: "released" });

    const active = openMigratedFactoryDatabase(result.databasePath, { fileMustExist: true });
    active.prepare("INSERT INTO recovery_probe(value) VALUES (?)").run("post-release");
    active.close();
    expect(() => assertRuntimeRecoveryReady(result.runtimeDirectory)).not.toThrow();
    expect(
      releaseRuntimeRecoveryQuarantine({
        runtimeDirectory: result.runtimeDirectory,
        releasedAt: "2026-08-11T15:00:00.000Z",
      }),
    ).toMatchObject({ revision: 4, status: "released" });
  });

  it("requires an external manifest anchor and rejects a rewritten canonical bundle", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root, false);
    const manifestPath = join(bundle.directory, "recovery-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.backupId = "00000000-0000-4000-8000-000000000001";
    writeFileSync(
      manifestPath,
      `${JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))))}\n`,
      { mode: 0o600 },
    );
    await expect(
      verifyRecoveryBundle(bundle.directory, bundle.manifestDigest, () => true),
    ).rejects.toThrow("external trust anchor");
  });

  it("keeps manifest reads bounded when a pinned file grows concurrently", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root, false);
    await expect(
      verifyRecoveryBundle(bundle.directory, bundle.manifestDigest, () => true, {
        manifestReadCheckpoint: () => {
          appendFileSync(join(bundle.directory, "recovery-manifest.json"), "x");
        },
      }),
    ).rejects.toThrow(/grew beyond the bounded read|changed while it was read/);
  });

  it("fails closed on missing evidence before creating a runtime", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root);
    const runtime = join(root, "must-not-exist");
    await expect(
      restoreRecoveryBundle({
        bundleDirectory: bundle.directory,
        expectedManifestDigest: bundle.manifestDigest,
        runtimeDirectory: runtime,
        verifyEvidence: () => false,
        restoredAt: "2026-08-11T12:00:00.000Z",
      }),
    ).rejects.toThrow("unavailable or invalid");
    expect(() => readFileSync(runtime)).toThrow();
  });

  it("never exposes a fail-open final runtime if restore crashes before quarantine", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root, false);
    const runtime = join(root, "atomic-runtime");
    await expect(
      restoreRecoveryBundle(
        {
          bundleDirectory: bundle.directory,
          expectedManifestDigest: bundle.manifestDigest,
          runtimeDirectory: runtime,
          verifyEvidence: () => true,
          restoredAt: "2026-08-11T12:00:00.000Z",
        },
        {
          afterRuntimeStagingCreated: () => {
            throw new Error("injected crash before quarantine");
          },
        },
      ),
    ).rejects.toThrow("injected crash");
    expect(existsSync(runtime)).toBe(false);

    await expect(
      restoreRecoveryBundle({
        bundleDirectory: bundle.directory,
        expectedManifestDigest: bundle.manifestDigest,
        runtimeDirectory: runtime,
        verifyEvidence: () => true,
        restoredAt: "2026-08-11T12:01:00.000Z",
      }),
    ).resolves.toMatchObject({ runtimeDirectory: runtime, reconciliationRequired: true });
    expect(readRecoveryState(runtime)).toMatchObject({ status: "quarantined", revision: 2 });
  });

  it("pins no-follow file descriptors and detects a path swap before verification", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root, false);
    const databasePath = join(bundle.directory, FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME);
    const moved = join(bundle.directory, "moved.sqlite3");
    await expect(
      verifyRecoveryBundle(bundle.directory, bundle.manifestDigest, () => true, {
        quiescenceCheckpoint: () => {
          renameSync(databasePath, moved);
          symlinkSync(moved, databasePath);
        },
      }),
    ).rejects.toThrow(/single-link regular file|ELOOP/);
  });

  it("detects database tampering and unsafe bundle permissions", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root, false);
    writeFileSync(
      join(bundle.directory, FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME),
      Buffer.from("tampered"),
    );
    await expect(
      verifyRecoveryBundle(bundle.directory, bundle.manifestDigest, () => true),
    ).rejects.toThrow(/size does not match|digest mismatch/);
    chmodSync(bundle.directory, 0o755);
    await expect(
      verifyRecoveryBundle(bundle.directory, bundle.manifestDigest, () => true),
    ).rejects.toThrow(RecoveryManagerError);
  });

  it("rejects duplicate evidence and never overwrites a destination", async () => {
    const root = temporaryDirectory();
    const database = openMigratedFactoryDatabase(join(root, "live.sqlite3"));
    await expect(
      createRecoveryBundle({
        database,
        destinationDirectory: join(root, "duplicate"),
        createdAt: "2026-08-10T12:00:00.000Z",
        evidence: [
          { digest: DIGEST, logicalName: "one" },
          { digest: DIGEST, logicalName: "two" },
        ],
      }),
    ).rejects.toThrow("duplicate digests");
    const existing = join(root, "existing");
    mkdirSync(existing);
    await expect(
      createRecoveryBundle({
        database,
        destinationDirectory: existing,
        createdAt: "2026-08-10T12:00:00.000Z",
        evidence: [],
      }),
    ).rejects.toThrow("already exists");
    database.close();
  });

  it("ignores OS metadata junk in the recovery-state directory instead of failing closed", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root, false);
    const result = await restoreRecoveryBundle({
      bundleDirectory: bundle.directory,
      expectedManifestDigest: bundle.manifestDigest,
      runtimeDirectory: join(root, "restored"),
      verifyEvidence: () => true,
      restoredAt: "2026-08-11T12:00:00.000Z",
    });
    const stateDirectory = join(result.runtimeDirectory, "recovery-state");
    // Finder writes .DS_Store and AppleDouble sidecars as files; Spotlight,
    // Trash, and fseventsd bookkeeping are directories. Both shapes must be
    // ignored by name, regardless of entry type.
    writeFileSync(join(stateDirectory, ".DS_Store"), "junk\n");
    writeFileSync(join(stateDirectory, "._0000000000000001.json"), "junk\n");
    mkdirSync(join(stateDirectory, ".Spotlight-V100"));
    mkdirSync(join(stateDirectory, ".Trashes"));
    mkdirSync(join(stateDirectory, ".fseventsd"));

    expect(readRecoveryState(result.runtimeDirectory)).toMatchObject({
      status: "quarantined",
      revision: 2,
    });
  });

  it("still fails closed on a genuinely unexpected recovery-state entry", async () => {
    const root = temporaryDirectory();
    const bundle = await bundleFixture(root, false);
    const result = await restoreRecoveryBundle({
      bundleDirectory: bundle.directory,
      expectedManifestDigest: bundle.manifestDigest,
      runtimeDirectory: join(root, "restored"),
      verifyEvidence: () => true,
      restoredAt: "2026-08-11T12:00:00.000Z",
    });
    writeFileSync(
      join(result.runtimeDirectory, "recovery-state", "untrusted.txt"),
      "not a recovery state\n",
    );

    expect(() => readRecoveryState(result.runtimeDirectory)).toThrow(
      /unexpected recovery state entry/,
    );
    expect(() => readRecoveryState(result.runtimeDirectory)).toThrow(RecoveryManagerError);
  });
});
