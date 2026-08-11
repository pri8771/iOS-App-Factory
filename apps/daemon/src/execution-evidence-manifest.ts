import { createHash } from "node:crypto";

import {
  EvidenceIdSchema,
  EvidenceManifestV1Schema,
  GitObjectIdSchema,
  NamespacedCodeSchema,
  type ArtifactRefV1,
  type EvidenceManifestV1,
  type EvidenceSubjectV1,
  type EvidenceV1,
  type Sha256Digest,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import {
  parseAgentEventLogBytes,
  type VerifiedExecutionEvidence,
} from "@app-factory/execution-engine";

function deterministicEvidenceId(namespace: string, ...parts: readonly string[]): string {
  const digest = createHash("sha256")
    .update(["app-factory.verified-local-execution.v1", namespace, ...parts].join("\0"))
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function storedArtifact(
  store: EvidenceStore,
  digest: Sha256Digest,
  mediaType: string,
  logicalName: string,
): ArtifactRefV1 {
  return {
    digest,
    byteLength: store.readBlob(digest).byteLength,
    mediaType,
    logicalName,
  };
}

function uniqueArtifacts(artifacts: readonly ArtifactRefV1[]): ArtifactRefV1[] {
  const digests = new Set<string>();
  const unique: ArtifactRefV1[] = [];
  for (const artifact of artifacts) {
    if (digests.has(artifact.digest)) continue;
    digests.add(artifact.digest);
    unique.push(artifact);
  }
  return unique;
}

/**
 * Publishes the already semantically verified execution closure into the
 * generic immutable evidence store. Later EvidenceStore verification proves
 * storage and reference integrity only; it does not rerun semantic checks.
 */
export function commitVerifiedExecutionManifest(
  store: EvidenceStore,
  verified: VerifiedExecutionEvidence,
): EvidenceManifestV1 {
  const { index } = verified;
  const subject: EvidenceSubjectV1 = {
    taskSpecDigest: index.taskSpecDigest,
    policyDigest: index.policyDigest,
    baseCommit: index.baseCommit,
    candidateTree: index.candidateTree,
    fence: index.fence,
  };
  const common = {
    schemaVersion: 1 as const,
    attemptId: index.attemptId,
    createdAt: index.createdAt,
    subject,
  };
  const eventLog = parseAgentEventLogBytes(store.readBlob(index.eventDigest), {
    attemptId: index.attemptId,
    implementingRunId: index.implementingRunId,
    maximumFence: index.fence,
  });
  const firstEvent = eventLog[0];
  const lastEvent = eventLog.at(-1);
  if (firstEvent === undefined || lastEvent === undefined) {
    throw new Error("Verified execution event evidence is unexpectedly empty");
  }

  const evidence: EvidenceV1[] = [
    {
      ...common,
      evidenceId: EvidenceIdSchema.parse(
        deterministicEvidenceId("event-log-evidence", index.attemptId, verified.indexDigest),
      ),
      producer: NamespacedCodeSchema.parse("factory.local-agent"),
      artifacts: [
        storedArtifact(
          store,
          index.eventDigest,
          "application/vnd.app-factory.agent-events.v1+json",
          "agent-events.v1.json",
        ),
      ],
      kind: "event-log",
      claims: {
        firstSequence: firstEvent.sequence,
        lastSequence: lastEvent.sequence,
        eventCount: eventLog.length,
        eventLogDigest: index.eventDigest,
      },
    },
    ...verified.trustedTests.map((test, testIndex): EvidenceV1 => ({
      ...common,
      evidenceId: EvidenceIdSchema.parse(
        deterministicEvidenceId(
          "verification-evidence",
          index.attemptId,
          verified.indexDigest,
          test.recordDigest,
        ),
      ),
      producer: NamespacedCodeSchema.parse("factory.trusted-verifier"),
      artifacts: uniqueArtifacts([
        storedArtifact(
          store,
          test.recordDigest,
          "application/vnd.app-factory.trusted-test-record.v1+json",
          `trusted-test-${String(testIndex + 1)}-record.v1.json`,
        ),
        storedArtifact(
          store,
          test.stdoutDigest,
          "application/octet-stream",
          `trusted-test-${String(testIndex + 1)}-stdout.bin`,
        ),
        storedArtifact(
          store,
          test.stderrDigest,
          "application/octet-stream",
          `trusted-test-${String(testIndex + 1)}-stderr.bin`,
        ),
      ]),
      kind: "verification",
      claims: test.claims,
    })),
    {
      ...common,
      evidenceId: EvidenceIdSchema.parse(
        deterministicEvidenceId("review-evidence", index.attemptId, verified.indexDigest),
      ),
      producer: NamespacedCodeSchema.parse("factory.independent-review"),
      artifacts: uniqueArtifacts([
        storedArtifact(
          store,
          index.preReviewBundleDigest,
          "application/vnd.app-factory.pre-review-bundle.v1+json",
          "pre-review-bundle.v1.json",
        ),
        storedArtifact(
          store,
          index.reviewInputArtifactDigest,
          "application/vnd.app-factory.review-input.v1+json",
          "review-input.v1.json",
        ),
        storedArtifact(
          store,
          index.reviewDigest,
          "application/vnd.app-factory.review-report.v1+json",
          "review-report.v1.json",
        ),
      ]),
      kind: "review",
      claims: { report: verified.review },
    },
    {
      ...common,
      evidenceId: EvidenceIdSchema.parse(
        deterministicEvidenceId("commit-evidence", index.attemptId, verified.indexDigest),
      ),
      producer: NamespacedCodeSchema.parse("factory.commit-broker"),
      artifacts: uniqueArtifacts([
        storedArtifact(
          store,
          verified.indexDigest,
          "application/vnd.app-factory.execution-evidence-index.v1+json",
          "execution-evidence-index.v1.json",
        ),
        storedArtifact(
          store,
          index.taskSpecArtifactDigest,
          "application/vnd.app-factory.task-spec.v1+json",
          "task-spec.v1.json",
        ),
        storedArtifact(store, index.policyArtifactDigest, "text/plain", "reviewed-policy.txt"),
        storedArtifact(
          store,
          index.candidatePolicyArtifactDigest,
          "application/vnd.app-factory.candidate-policy.v1+json",
          "candidate-policy.v1.json",
        ),
        storedArtifact(
          store,
          index.verificationPlanBundleDigest,
          "application/vnd.app-factory.verification-plan-bundle.v1+json",
          "verification-plan-bundle.v1.json",
        ),
        storedArtifact(
          store,
          index.reviewerDescriptorArtifactDigest,
          "application/vnd.app-factory.reviewer-descriptor.v1+json",
          "reviewer-descriptor.v1.json",
        ),
        storedArtifact(
          store,
          index.candidateVerificationArtifactDigest,
          "application/vnd.app-factory.candidate-verification.v1+json",
          "candidate-verification.v1.json",
        ),
        storedArtifact(store, index.candidatePatchArtifactDigest, "text/x-diff", "candidate.patch"),
        storedArtifact(
          store,
          index.testDigest,
          "application/vnd.app-factory.trusted-test-bundle.v1+json",
          "trusted-test-bundle.v1.json",
        ),
        storedArtifact(
          store,
          index.commitRecordDigest,
          "application/vnd.app-factory.broker-commit.v1+json",
          "broker-commit.v1.json",
        ),
      ]),
      kind: "commit",
      claims: {
        commit: GitObjectIdSchema.parse(verified.brokerCommit.commitSha),
        tree: GitObjectIdSchema.parse(verified.brokerCommit.candidateTreeId),
        attemptMarker: verified.brokerCommit.attemptMarker,
      },
    },
  ];
  const entries = evidence.map((item) => {
    const stored = store.putEvidence(item);
    return { evidenceId: stored.evidence.evidenceId, digest: stored.digest };
  });
  const manifest = EvidenceManifestV1Schema.parse({
    schemaVersion: 1,
    attemptId: index.attemptId,
    createdAt: index.createdAt,
    subject,
    entries,
    requiredKinds: ["event-log", "verification", "review", "commit"],
  });
  return store.commitManifest(manifest);
}
