import { IsoInstantSchema, Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

import { QualityFindingV1Schema, type QualityFindingV1 } from "./model.js";
import { qualityDigest } from "./coherence.js";

export type OperatorFindingInput = Readonly<{
  projectId: string;
  candidateCommit: string;
  routeId: string;
  stateId: string;
  comment: string;
  observedAt: string;
  screenshotDigest: Sha256Digest;
  recordingDigest: Sha256Digest | null;
}>;

export type OperatorFindingRecordV1 = Readonly<{
  schemaVersion: 1;
  observationId: string;
  projectId: string;
  candidateCommit: string;
  routeId: string;
  stateId: string;
  comment: string;
  observedAt: string;
  screenshotDigest: Sha256Digest;
  recordingDigest: Sha256Digest | null;
  finding: QualityFindingV1;
}>;

export function recordOperatorFinding(input: OperatorFindingInput): OperatorFindingRecordV1 {
  if (!/^[0-9a-f-]{36}$/.test(input.projectId)) throw new TypeError("projectId is invalid");
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(input.candidateCommit)) {
    throw new TypeError("candidateCommit is invalid");
  }
  if (
    input.comment.trim() !== input.comment ||
    input.comment.length < 1 ||
    input.comment.length > 4_000
  ) {
    throw new TypeError("operator comment must be a trimmed bounded string");
  }
  const observedAt = IsoInstantSchema.parse(input.observedAt);
  const screenshotDigest = Sha256DigestSchema.parse(input.screenshotDigest);
  const recordingDigest =
    input.recordingDigest === null ? null : Sha256DigestSchema.parse(input.recordingDigest);
  const identity = {
    projectId: input.projectId,
    candidateCommit: input.candidateCommit,
    routeId: input.routeId,
    stateId: input.stateId,
    comment: input.comment,
    screenshotDigest,
    recordingDigest,
  };
  const fingerprint = qualityDigest({
    ruleId: "quality.operator.observation",
    routeId: input.routeId,
    stateId: input.stateId,
    summary: input.comment,
  });
  const observationDigest = qualityDigest(identity);
  return {
    schemaVersion: 1,
    observationId: `qob-${observationDigest.slice("sha256:".length, "sha256:".length + 24)}`,
    ...identity,
    observedAt,
    finding: QualityFindingV1Schema.parse({
      schemaVersion: 1,
      findingId: `qf-${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
      fingerprint,
      ruleId: "quality.operator.observation",
      severity: "p2",
      routeId: input.routeId,
      stateId: input.stateId,
      path: null,
      summary: input.comment,
      rootCause: null,
      escapedGate: null,
      regressionId: null,
      lessonScope: null,
      evidenceDigests: [screenshotDigest, ...(recordingDigest === null ? [] : [recordingDigest])],
      status: "open",
    }),
  };
}

export function mergeFindingLedger(
  existingInput: readonly unknown[],
  incomingInput: readonly unknown[],
): readonly QualityFindingV1[] {
  const merged = new Map<string, QualityFindingV1>();
  for (const value of [...existingInput, ...incomingInput]) {
    const finding = QualityFindingV1Schema.parse(value);
    const previous = merged.get(finding.fingerprint);
    if (previous === undefined) {
      merged.set(finding.fingerprint, finding);
      continue;
    }
    const immutable = (item: QualityFindingV1) => ({
      findingId: item.findingId,
      fingerprint: item.fingerprint,
      ruleId: item.ruleId,
      severity: item.severity,
      routeId: item.routeId,
      stateId: item.stateId,
      path: item.path,
      summary: item.summary,
    });
    if (qualityDigest(immutable(previous)) !== qualityDigest(immutable(finding))) {
      throw new TypeError(`finding fingerprint collision: ${finding.fingerprint}`);
    }
    const evidenceDigests = [
      ...new Set([...previous.evidenceDigests, ...finding.evidenceDigests]),
    ].sort();
    const statusRank = { open: 0, accepted: 1, deferred: 2, fixed: 3 } as const;
    const latest = statusRank[finding.status] > statusRank[previous.status] ? finding : previous;
    merged.set(finding.fingerprint, { ...latest, evidenceDigests });
  }
  return [...merged.values()].sort((left, right) => left.findingId.localeCompare(right.findingId));
}

export function closeFindingWithRegression(
  findingInput: unknown,
  closure: Readonly<{
    rootCause: string;
    escapedGate: string;
    regressionId: string;
    lessonScope: "project" | "shared-component" | "template" | "factory";
    evidenceDigests: readonly Sha256Digest[];
  }>,
): QualityFindingV1 {
  const finding = QualityFindingV1Schema.parse(findingInput);
  if (finding.status === "deferred")
    throw new TypeError("a deferred finding cannot be silently fixed");
  if (closure.rootCause.trim().length < 1 || closure.escapedGate.trim().length < 1) {
    throw new TypeError("finding closure requires root cause and escaped gate");
  }
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(closure.regressionId)) {
    throw new TypeError("finding closure regression ID is invalid");
  }
  const evidence = closure.evidenceDigests.map((digest) => Sha256DigestSchema.parse(digest));
  if (evidence.length < 1) throw new TypeError("finding closure requires regression evidence");
  return QualityFindingV1Schema.parse({
    ...finding,
    rootCause: closure.rootCause,
    escapedGate: closure.escapedGate,
    regressionId: closure.regressionId,
    lessonScope: closure.lessonScope,
    evidenceDigests: [...new Set([...finding.evidenceDigests, ...evidence])].sort(),
    status: "fixed",
  });
}
