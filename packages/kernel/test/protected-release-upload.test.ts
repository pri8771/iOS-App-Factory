import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  computeReleaseIdentityDigestV1,
  createEffectRepository,
  openMigratedFactoryDatabase,
  ReleaseRunRepository,
} from "../src/index.js";

const T0 = "2026-09-08T18:00:00.000Z";
const T0B = "2026-09-08T18:00:00.500Z";
const T1 = "2026-09-08T18:00:01.000Z";
const T2 = "2026-09-08T18:00:02.000Z";
const DIGEST = `sha256:${"c".repeat(64)}`;
const POLICY = `sha256:${"d".repeat(64)}`;
const PLAN = `sha256:${"e".repeat(64)}`;
const ATTESTATION = `sha256:${"f".repeat(64)}`;
const SOURCE_COMMIT = "1".repeat(40);
const SOURCE_TREE = "2".repeat(40);
const BUNDLE_ID = "com.pchordia.aurafit";
const PROJECT_ID = "9c000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "9c000000-0000-4000-8000-000000000002";
const RELEASE_ID = "9c000000-0000-4000-8000-000000000003";
const RELEASE_RUN_ID = "9c000000-0000-4000-8000-000000000004";
const APPROVAL_ID = "9c000000-0000-4000-8000-000000000005";
const EFFECT_ID = "9c000000-0000-4000-8000-000000000006";
const INTENT_ID = "9c000000-0000-4000-8000-000000000007";
const COMMAND_ID = "9c000000-0000-4000-8000-0000000000a1";
const UPLOAD_COMMAND_ID = "9c000000-0000-4000-8000-0000000000a2";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-or28-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

function archivedRun(revision = 3) {
  return {
    schemaVersion: 1 as const,
    releaseRunId: RELEASE_RUN_ID,
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    releaseId: RELEASE_ID,
    sourceCommit: SOURCE_COMMIT,
    branch: "main",
    stage: "archived" as const,
    revision,
    promotion: {
      promotedCommit: SOURCE_COMMIT,
      branch: "main",
      at: T0,
    },
    archive: {
      buildNumber: "11",
      marketingVersion: "1.0.0",
      archiveDigest: DIGEST,
      exportedArtifactDigest: PLAN,
      receiptDigest: ATTESTATION,
      at: T1,
    },
    upload: null,
    unevaluated: [],
    notes: ["seeded archived run"],
    createdAt: T0,
    updatedAt: T1,
  };
}

function identity(releaseRunId = RELEASE_RUN_ID) {
  return {
    schemaVersion: 1 as const,
    repositoryId: REPOSITORY_ID,
    sourceCommit: SOURCE_COMMIT,
    sourceTree: SOURCE_TREE,
    policyDigest: POLICY,
    projectId: PROJECT_ID,
    releaseId: RELEASE_ID,
    releaseRunId,
    appBundleId: BUNDLE_ID,
    marketingVersion: "1.0.0",
    buildNumber: "11",
    archiveDigest: DIGEST,
    exportedArtifactDigest: PLAN,
    destination: "app-store-connect-internal" as const,
    transportProtocol: "app-factory.fake-apple-upload.v1" as const,
    transportProtocolVersion: 1,
  };
}

describe("OR-28 planProtectedReleaseUpload", () => {
  it("atomically plans effect, intent, consumes approval, and CAS-advances to upload-approved", () => {
    const db = database();
    const runs = new ReleaseRunRepository(db);
    runs.upsert({
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
    runs.upsert({
      commandId: randomUUID(),
      origin: "system",
      issuedAt: T0B,
      recordedAt: T0B,
      run: {
        schemaVersion: 1,
        releaseRunId: RELEASE_RUN_ID,
        projectId: PROJECT_ID,
        repositoryId: REPOSITORY_ID,
        releaseId: RELEASE_ID,
        sourceCommit: SOURCE_COMMIT,
        branch: "main",
        stage: "certified",
        revision: 2,
        promotion: null,
        archive: null,
        upload: null,
        unevaluated: [],
        notes: [],
        createdAt: T0,
        updatedAt: T0B,
      },
    });
    runs.upsert({
      commandId: randomUUID(),
      origin: "system",
      issuedAt: T1,
      recordedAt: T1,
      run: archivedRun(3),
    });

    const identityDigest = computeReleaseIdentityDigestV1(identity());
    const effects = createEffectRepository(db, {
      verifyApprovalIssuance: () => true,
    });
    effects.registerApproval({
      issuance: {
        approval: {
          schemaVersion: 1,
          approvalId: APPROVAL_ID,
          action: "apple.upload-build",
          resourceType: "apple.build",
          resourceKey: `${BUNDLE_ID}/1.0.0/11`,
          subject: {
            projectId: PROJECT_ID,
            taskId: null,
            attemptId: null,
            releaseId: RELEASE_ID,
          },
          binding: {
            planDigest: PLAN,
            diffDigest: null,
            commit: SOURCE_COMMIT,
            buildIdentityDigest: identityDigest,
            policyDigest: POLICY,
          },
          actorId: "owner@example.com",
          mode: "single-use",
          standingScope: null,
          issuedAt: T0,
          expiresAt: "2026-09-09T18:00:00.000Z",
          status: "active",
          revokedAt: null,
          consumedAt: null,
          consumedByEffectId: null,
        },
        payloadDigest: identityDigest,
        issuerId: "trusted.approval-service",
        authenticatedAt: T0,
        attestationDigest: ATTESTATION,
      },
    });

    const planned = effects.planProtectedReleaseUpload({
      effect: {
        schemaVersion: 1,
        effectId: EFFECT_ID,
        attemptId: null,
        action: "apple.upload-build",
        operationMarker: `app-factory:v1:apple:upload-build:${EFFECT_ID}`,
        target: {
          provider: "apple",
          resourceType: "apple.build",
          resourceKey: `${BUNDLE_ID}/1.0.0/11`,
        },
        subject: {
          projectId: PROJECT_ID,
          taskId: null,
          attemptId: null,
          releaseId: RELEASE_ID,
        },
        payloadDigest: identityDigest,
        policyDigest: POLICY,
        approvalId: APPROVAL_ID,
        state: "planned",
        revision: 0,
        sendCount: 0,
        providerCorrelationKey: null,
        createdAt: T2,
        updatedAt: T2,
        lastObservedAt: null,
        nextReconcileAt: null,
        detailDigest: null,
      },
      binding: {
        planDigest: PLAN,
        diffDigest: null,
        commit: SOURCE_COMMIT,
        buildIdentityDigest: identityDigest,
      },
      authorizedAt: T2,
      availableAt: T2,
      identityDigest,
      intentId: INTENT_ID,
      releaseRunUpsert: {
        commandId: UPLOAD_COMMAND_ID,
        origin: "cli",
        issuedAt: T2,
        recordedAt: T2,
        run: {
          ...archivedRun(4),
          stage: "upload-approved",
          revision: 4,
          updatedAt: T2,
          notes: ["upload planned"],
        },
      },
    });

    expect(planned.duplicate).toBe(false);
    expect(planned.run.stage).toBe("upload-approved");
    expect(planned.effect.state).toBe("planned");
    expect(effects.getApproval(APPROVAL_ID)?.approval.status).toBe("consumed");
    const intent = db
      .prepare(
        `SELECT effect_id AS effectId, identity_digest AS identityDigest FROM release_upload_intents WHERE intent_id = ?`,
      )
      .get(INTENT_ID) as Readonly<{ effectId: string; identityDigest: string }>;
    expect(intent).toEqual({ effectId: EFFECT_ID, identityDigest });

    const T3 = "2026-09-08T18:00:03.000Z";
    expect(() =>
      effects.planProtectedReleaseUpload({
        effect: {
          schemaVersion: 1,
          effectId: randomUUID(),
          attemptId: null,
          action: "apple.upload-build",
          operationMarker: `app-factory:v1:apple:upload-build:${randomUUID()}`,
          target: {
            provider: "apple",
            resourceType: "apple.build",
            resourceKey: `${BUNDLE_ID}/1.0.0/11`,
          },
          subject: {
            projectId: PROJECT_ID,
            taskId: null,
            attemptId: null,
            releaseId: RELEASE_ID,
          },
          payloadDigest: identityDigest,
          policyDigest: POLICY,
          approvalId: APPROVAL_ID,
          state: "planned",
          revision: 0,
          sendCount: 0,
          providerCorrelationKey: null,
          createdAt: T3,
          updatedAt: T3,
          lastObservedAt: null,
          nextReconcileAt: null,
          detailDigest: null,
        },
        binding: {
          planDigest: PLAN,
          diffDigest: null,
          commit: SOURCE_COMMIT,
          buildIdentityDigest: identityDigest,
        },
        authorizedAt: T3,
        availableAt: T3,
        identityDigest,
        intentId: randomUUID(),
        releaseRunUpsert: {
          commandId: randomUUID(),
          origin: "cli",
          issuedAt: T3,
          recordedAt: T3,
          run: {
            ...archivedRun(5),
            stage: "upload-approved",
            revision: 5,
            updatedAt: T3,
            notes: ["should not land"],
          },
        },
      }),
    ).toThrow(/intent already exists|approval is not active/);

    db.close();
  });
});

describe("OR-31 / OR-37 protected release conformance extensions", () => {
  it("keeps identity digests stable across canonical recomputation", () => {
    const left = computeReleaseIdentityDigestV1(identity());
    const right = computeReleaseIdentityDigestV1(identity());
    expect(left).toBe(right);
    expect(left.startsWith("sha256:")).toBe(true);
  });

  it("proves disposable DB restore retains upload-approved run stage", () => {
    const root = mkdtempSync(join(tmpdir(), "app-factory-or38-"));
    roots.push(root);
    const dbPath = join(root, "factory.sqlite");
    const db = openMigratedFactoryDatabase(dbPath);
    const runs = new ReleaseRunRepository(db);
    runs.upsert({
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
    runs.upsert({
      commandId: randomUUID(),
      origin: "system",
      issuedAt: T0B,
      recordedAt: T0B,
      run: {
        schemaVersion: 1,
        releaseRunId: RELEASE_RUN_ID,
        projectId: PROJECT_ID,
        repositoryId: REPOSITORY_ID,
        releaseId: RELEASE_ID,
        sourceCommit: SOURCE_COMMIT,
        branch: "main",
        stage: "certified",
        revision: 2,
        promotion: null,
        archive: null,
        upload: null,
        unevaluated: [],
        notes: [],
        createdAt: T0,
        updatedAt: T0B,
      },
    });
    runs.upsert({
      commandId: randomUUID(),
      origin: "system",
      issuedAt: T1,
      recordedAt: T1,
      run: archivedRun(3),
    });
    runs.upsert({
      commandId: UPLOAD_COMMAND_ID,
      origin: "system",
      issuedAt: T2,
      recordedAt: T2,
      run: {
        ...archivedRun(4),
        stage: "upload-approved",
        revision: 4,
        updatedAt: T2,
      },
    });
    db.close();

    const restored = openMigratedFactoryDatabase(dbPath);
    const row = restored
      .prepare(`SELECT stage FROM release_runs WHERE release_run_id = ?`)
      .get(RELEASE_RUN_ID) as Readonly<{ stage: string }>;
    expect(row.stage).toBe("upload-approved");
    restored.close();
  });
});
