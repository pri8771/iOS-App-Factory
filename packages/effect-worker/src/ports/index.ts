import { randomUUID } from "node:crypto";

import {
  RunIdSchema,
  Sha256DigestSchema,
  type ExternalEffectV1,
  type ExternalObservationSourceV1,
  type ExternalObservationV1,
  type ExternalResourceV1,
  type IsoInstant,
  type NamespacedCode,
  type Sha256Digest,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import {
  computeObservationAttestationEnvelopeDigest,
  type ArtifactRepository,
  type ObservationAttestationEnvelope,
} from "@app-factory/kernel";

/**
 * Production implementations of the ports declared in `../index.js`
 * (`EffectPayloadPort`, `SanitizedProviderEvidencePort`,
 * `ObservationIssuerPort`). This module intentionally does not import from
 * `../index.js`: the exported factories are structurally compatible with
 * those port types (verified by the test suite), which keeps this file free
 * of any dependency back onto the worker module.
 *
 * Nothing here is wired into a daemon; these are ports plus their tests.
 */

export class EffectWorkerPortsError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EffectWorkerPortsError";
  }
}

function fail(message: string): never {
  throw new EffectWorkerPortsError(message);
}

/* --------------------------------------------------------------------- *
 * EffectPayloadPort: read a send payload persisted as a kernel artifact.
 * --------------------------------------------------------------------- */

/** The subset of the kernel artifacts repository this port depends on. */
export type ArtifactLookupPort = Pick<ArtifactRepository, "findByDigest">;

export type KernelEffectPayloadPortOptions = Readonly<{
  /** Authoritative record of which digests are legitimate artifacts. */
  artifacts: ArtifactLookupPort;
  /** Content-addressed byte storage the artifact metadata points at. */
  evidenceStore: EvidenceStore;
}>;

export type KernelEffectPayloadReadInput = Readonly<{
  payloadDigest: Sha256Digest;
  deadline: IsoInstant;
  signal: AbortSignal;
}>;

export type KernelEffectPayloadPort = Readonly<{
  read(input: KernelEffectPayloadReadInput): Uint8Array;
}>;

/**
 * Reads an effect's send payload by digest. The kernel's artifact
 * repository is the authoritative record that a digest was legitimately
 * planned; the evidence store is the content-addressed byte store the
 * artifact record points at. Both must agree before bytes are returned.
 */
export function createKernelEffectPayloadPort(
  options: KernelEffectPayloadPortOptions,
): KernelEffectPayloadPort {
  const { artifacts, evidenceStore } = options;
  return {
    read(input) {
      if (input.signal.aborted) fail("payload read aborted before dispatch");
      const digest = Sha256DigestSchema.parse(input.payloadDigest);
      const artifact = artifacts.findByDigest(digest);
      if (artifact === null) {
        fail(`no payload artifact is recorded in the kernel for digest ${digest}`);
      }
      // readBlob independently verifies the digest of what it reads and
      // throws on any mismatch, so this is not trusting the artifact row.
      const bytes = evidenceStore.readBlob(digest);
      if (bytes.byteLength !== artifact.byteLength) {
        fail(`payload artifact byte length does not match its recorded metadata for ${digest}`);
      }
      return Uint8Array.from(bytes);
    },
  };
}

/* --------------------------------------------------------------------- *
 * SanitizedProviderEvidencePort: redact + persist provider call evidence.
 * --------------------------------------------------------------------- */

/** The subset of the kernel artifacts repository this port depends on. */
export type ArtifactRegistrationPort = Pick<ArtifactRepository, "record">;

export type DurableSanitizedProviderEvidencePortOptions = Readonly<{
  artifacts: ArtifactRegistrationPort;
  evidenceStore: EvidenceStore;
  /** Hard cap on redacted evidence bytes actually persisted. */
  maximumDetailBytes?: number;
}>;

export type PersistProviderEvidenceInput = Readonly<{
  effect: ExternalEffectV1;
  adapterId: NamespacedCode;
  adapterVersion: string;
  phase: "send" | "reconcile";
  outcome: string;
  outcomeCode: NamespacedCode | null;
  rawDetail: Uint8Array;
  recordedAt: IsoInstant;
  deadline: IsoInstant;
  signal: AbortSignal;
}>;

export type DurableSanitizedProviderEvidencePort = Readonly<{
  persist(input: PersistProviderEvidenceInput): Sha256Digest;
}>;

const DEFAULT_MAXIMUM_DETAIL_BYTES = 64 * 1024;
const REDACTED_MARKER = "[REDACTED]";
const MAX_LOGICAL_NAME_LENGTH = 200;

// Matches `"authorization": "..."` / `"token": "..."` style JSON key-value
// pairs regardless of nesting, case, or the separator style a provider uses
// for the key ("api_key", "api-key", "apiKey", ...).
const SECRET_JSON_FIELD_PATTERN =
  /("(?:authorization|token|access[-_]?token|refresh[-_]?token|api[-_]?key|secret|password|passwd|client[-_]?secret|private[-_]?key|cookie|set-cookie)"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;
// Matches an inline bearer/basic/token scheme value wherever it appears,
// e.g. inside a free-text error message a provider echoed back.
const SCHEME_VALUE_PATTERN = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{4,}/g;
// Matches a raw header line, in case a provider ever echoes request headers
// back in its response/error body.
const CREDENTIAL_HEADER_LINE_PATTERN = /^(authorization|cookie|set-cookie)\s*:.*$/gim;

/**
 * Redacts likely-secret substrings and enforces a hard byte bound. This is
 * defense in depth, not the primary control: adapters must already produce
 * detail bytes free of raw credential material (the credential broker and
 * transport are the trusted boundaries that hold secret bytes). Truncation
 * happens before pattern redaction so this never scans an unbounded buffer.
 */
export function redactProviderDetail(rawDetail: Uint8Array, maximumBytes: number): Uint8Array {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    fail("maximum redacted evidence size must be a positive safe integer");
  }
  const bounded =
    rawDetail.byteLength > maximumBytes ? rawDetail.subarray(0, maximumBytes) : rawDetail;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bounded);
  } catch {
    // Not decodable as UTF-8 text: keep it bounded and opaque rather than
    // guess at an encoding and risk mangling (or missing a redaction in) a
    // format we cannot safely parse as text.
    return Uint8Array.from(bounded);
  }
  const redacted = text
    .replace(SECRET_JSON_FIELD_PATTERN, (_match, prefix: string) => `${prefix}"${REDACTED_MARKER}"`)
    .replace(SCHEME_VALUE_PATTERN, (_match, scheme: string) => `${scheme} ${REDACTED_MARKER}`)
    .replace(
      CREDENTIAL_HEADER_LINE_PATTERN,
      (_match, name: string) => `${name}: ${REDACTED_MARKER}`,
    );
  return new TextEncoder().encode(redacted);
}

function detailMediaType(redacted: Uint8Array): string {
  try {
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(redacted));
    return "application/json";
  } catch {
    return "application/octet-stream";
  }
}

function evidenceLogicalName(effect: ExternalEffectV1, phase: "send" | "reconcile"): string {
  const name = `provider-evidence.${phase}.${effect.effectId}.json`;
  return name.length > MAX_LOGICAL_NAME_LENGTH ? name.slice(0, MAX_LOGICAL_NAME_LENGTH) : name;
}

/**
 * Redacts and bounds raw provider call evidence, writes the resulting bytes
 * into the evidence store, and registers the result as a kernel artifact so
 * a later `ObservationIssuerPort.issue` can bind an observation's
 * `evidenceDigest` to a digest the kernel actually recognizes (see
 * `insertAttestedObservation`'s artifact-existence check in
 * `effect-repositories.ts`).
 */
export function createDurableSanitizedProviderEvidencePort(
  options: DurableSanitizedProviderEvidencePortOptions,
): DurableSanitizedProviderEvidencePort {
  const { artifacts, evidenceStore } = options;
  const maximumDetailBytes = options.maximumDetailBytes ?? DEFAULT_MAXIMUM_DETAIL_BYTES;
  return {
    persist(input) {
      if (input.signal.aborted) fail("evidence persistence aborted before dispatch");
      const redacted = redactProviderDetail(input.rawDetail, maximumDetailBytes);
      try {
        const digest = evidenceStore.putBlob(redacted);
        artifacts.record({
          artifact: {
            digest,
            byteLength: redacted.byteLength,
            mediaType: detailMediaType(redacted),
            logicalName: evidenceLogicalName(input.effect, input.phase),
          },
          storagePath: evidenceStore.blobPath(digest),
          recordedAt: input.recordedAt,
        });
        return digest;
      } finally {
        redacted.fill(0);
      }
    },
  };
}

/* --------------------------------------------------------------------- *
 * ObservationIssuerPort: issue an ExternalObservationV1 with a real
 * attestation digest, computed exactly the way the kernel recomputes and
 * checks it in `insertAttestedObservation`.
 * --------------------------------------------------------------------- */

export type CanonicalObservationIssueInput = Readonly<{
  effect: ExternalEffectV1;
  resource: ExternalResourceV1;
  source: ExternalObservationSourceV1;
  adapterId: NamespacedCode;
  adapterVersion: string;
  ownerId: string;
  fence: number;
  evidenceDigest: Sha256Digest;
  observedAt: IsoInstant;
}>;

export type CanonicalObservationIssuerPort = Readonly<{
  issue(input: CanonicalObservationIssueInput): ExternalObservationV1;
}>;

export type CanonicalObservationIssuerOptions = Readonly<{
  /** Injectable for deterministic tests; defaults to `crypto.randomUUID`. */
  newInvocationId?: () => string;
}>;

// `computeObservationAttestationEnvelopeDigest` requires a full
// `ExternalObservationV1` (including `attestationDigest`) as input, but
// only reads schemaVersion/invocationId/source/adapterId/adapterVersion/
// evidenceDigest/observedAt out of it - `attestationDigest` itself is never
// part of the digest input. This placeholder exists purely to satisfy that
// type before the real digest is known; its value is never inspected.
const ATTESTATION_DIGEST_PLACEHOLDER = Sha256DigestSchema.parse(`sha256:${"0".repeat(64)}`);

export function createCanonicalObservationIssuerPort(
  options: CanonicalObservationIssuerOptions = {},
): CanonicalObservationIssuerPort {
  const newInvocationId = options.newInvocationId ?? randomUUID;
  return {
    issue(input) {
      const draft: ExternalObservationV1 = {
        schemaVersion: 1,
        invocationId: RunIdSchema.parse(newInvocationId()),
        source: input.source,
        adapterId: input.adapterId,
        adapterVersion: input.adapterVersion,
        evidenceDigest: input.evidenceDigest,
        attestationDigest: ATTESTATION_DIGEST_PLACEHOLDER,
        observedAt: input.observedAt,
      };
      const attestationDigest = computeObservationAttestationEnvelopeDigest({
        observation: draft,
        effect: input.effect,
        resource: input.resource,
        ownerId: input.ownerId,
        fence: input.fence,
      });
      return { ...draft, attestationDigest };
    },
  };
}

/**
 * The natural counterpart to `createCanonicalObservationIssuerPort`: an
 * `EffectRepositoryOptions.verifyObservationAttestation` implementation
 * that trusts an observation exactly when its `attestationDigest` is the
 * canonical digest of the envelope the kernel itself recomputes. Exported
 * so a future daemon composition can wire the issuer and the verifier from
 * the same source of truth instead of re-deriving one independently.
 */
export function verifyCanonicalObservationAttestation(
  envelope: ObservationAttestationEnvelope,
): boolean {
  return (
    envelope.observation.attestationDigest === computeObservationAttestationEnvelopeDigest(envelope)
  );
}
