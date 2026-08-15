import { createHash } from "node:crypto";

import { parseCredentialReference, sha256Bytes } from "@app-factory/adapter-sdk";
import type {
  AdapterRegistry,
  CredentialReferenceV1,
  EffectDispatchClaimV1,
  EffectReconciliationResult,
  EffectSendResult,
  ValidatedExternalProviderAdapter,
} from "@app-factory/adapter-sdk";
import {
  ExternalObservationV1Schema,
  ExternalResourceV1Schema,
  IsoInstantSchema,
  Sha256DigestSchema,
  type ExternalEffectV1,
  type ExternalObservationSourceV1,
  type ExternalObservationV1,
  type ExternalResourceV1,
  type IsoInstant,
  type NamespacedCode,
  type Sha256Digest,
} from "@app-factory/contracts";
import { EffectClaimLostError } from "@app-factory/kernel";
import type {
  BeginSendResult,
  EffectDispatchToken,
  EffectOutboxClaim,
  EffectRepository,
  PersistedEffect,
} from "@app-factory/kernel";

const MAX_CLAIM_MS = 5 * 60 * 1_000;
const MAX_OPERATION_MS = 2 * 60 * 1_000;
const MAX_RECONCILE_DELAY_MS = 24 * 60 * 60 * 1_000;

export class EffectWorkerError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "EffectWorkerError";
  }
}

class EffectWorkerStop extends EffectWorkerError {
  public constructor(
    public readonly reason: "aborted" | "deadline-elapsed",
    message: string,
  ) {
    super(message);
    this.name = "EffectWorkerStop";
  }
}

class EffectClaimLost extends EffectWorkerError {
  public constructor() {
    super("trusted repository rejected the active effect claim");
    this.name = "EffectClaimLost";
  }
}

export type EffectWorkerRepositoryPort = Pick<
  EffectRepository,
  | "claimNextSend"
  | "claimNextReconciliation"
  | "beginSend"
  | "assertDispatchActive"
  | "assertReconciliationActive"
  | "recordSendOutcome"
  | "recordReconciliationObserved"
  | "recordReconciliationUnknown"
  | "recordReconciliationUnresolved"
  | "deferObservedReconciliation"
  | "confirmObserved"
  | "requireManualIntervention"
>;

export type EffectOperationContextV1 = Readonly<{
  deadline: IsoInstant;
  signal: AbortSignal;
}>;

export type EffectPayloadPort = Readonly<{
  read(
    input: EffectOperationContextV1 & Readonly<{ payloadDigest: Sha256Digest }>,
  ): Promise<Uint8Array> | Uint8Array;
}>;

/** Trusted boundary that redacts provider bytes before recording an artifact. */
export type SanitizedProviderEvidencePort = Readonly<{
  persist(
    input: EffectOperationContextV1 &
      Readonly<{
        effect: ExternalEffectV1;
        adapterId: NamespacedCode;
        adapterVersion: string;
        phase: "send" | "reconcile";
        outcome: string;
        outcomeCode: NamespacedCode | null;
        rawDetail: Uint8Array;
        recordedAt: IsoInstant;
      }>,
  ): Promise<Sha256Digest> | Sha256Digest;
}>;

export type ObservationIssuerPort = Readonly<{
  issue(
    input: EffectOperationContextV1 &
      Readonly<{
        effect: ExternalEffectV1;
        resource: ExternalResourceV1;
        source: ExternalObservationSourceV1;
        adapterId: NamespacedCode;
        adapterVersion: string;
        ownerId: string;
        fence: number;
        evidenceDigest: Sha256Digest;
        observedAt: IsoInstant;
      }>,
  ): Promise<unknown> | unknown;
}>;

export type EffectCredentialPort = Readonly<{
  referenceFor(effect: ExternalEffectV1): CredentialReferenceV1 | null;
}>;

export type EffectWorkerClockPort = Readonly<{ now(): Date }>;

export type EffectWorkerOptions = Readonly<{
  ownerId: string;
  repository: EffectWorkerRepositoryPort;
  adapters: AdapterRegistry;
  payloads: EffectPayloadPort;
  evidence: SanitizedProviderEvidencePort;
  observations: ObservationIssuerPort;
  credentials: EffectCredentialPort;
  clock?: EffectWorkerClockPort;
  claimDurationMs?: number;
  /** Absolute budget for payload, provider, evidence, and attestation work. */
  adapterCallTimeoutMs?: number;
  reconcileDelayMs?: number;
}>;

export type EffectWorkerResult =
  | Readonly<{ kind: "idle"; operation: "send" | "reconcile" }>
  | Readonly<{
      kind: "completed";
      operation: "send" | "reconcile";
      effectId: string;
      state: ExternalEffectV1["state"];
    }>
  | Readonly<{
      kind: "interrupted";
      operation: "send" | "reconcile";
      effectId: string;
      reason: "aborted" | "claim-lost" | "deadline-elapsed";
    }>;

function fail(message: string): never {
  throw new EffectWorkerError(message);
}

function boundedMilliseconds(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(`${label} must be an integer from 1 through ${String(maximum)}`);
  }
  return value;
}

function safeOwnerId(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(value)) fail("worker ownerId is invalid");
  return value;
}

function instant(clock: EffectWorkerClockPort): IsoInstant {
  return IsoInstantSchema.parse(clock.now().toISOString());
}

function later(at: IsoInstant, delayMs: number): IsoInstant {
  return IsoInstantSchema.parse(new Date(Date.parse(at) + delayMs).toISOString());
}

function claimInput(ownerId: string, now: IsoInstant, claimDurationMs: number) {
  return { ownerId, observedAt: now, lockedUntil: later(now, claimDurationMs) };
}

function mutationInput(claim: EffectOutboxClaim, effectRevision: number, observedAt: IsoInstant) {
  return {
    effectId: claim.effect.effectId,
    ownerId: claim.lockedBy,
    fence: claim.fence,
    expectedOutboxRevision: claim.revision,
    expectedEffectRevision: effectRevision,
    observedAt,
  };
}

function dispatchClaim(claim: EffectOutboxClaim, effectRevision: number): EffectDispatchClaimV1 {
  return {
    ownerId: claim.lockedBy,
    fence: claim.fence,
    outboxRevision: claim.revision,
    effectRevision,
    lockedUntil: claim.lockedUntil,
  };
}

function reconciliationToken(claim: EffectOutboxClaim): EffectDispatchToken {
  return {
    effectId: claim.effect.effectId,
    ownerId: claim.lockedBy,
    fence: claim.fence,
    outboxRevision: claim.revision,
    effectRevision: claim.effect.revision,
  };
}

function rethrowTrustedRepositoryError(error: unknown): never {
  if (error instanceof EffectClaimLostError) throw new EffectClaimLost();
  throw error;
}

function genericFailureDetail(effect: ExternalEffectV1, phase: "send" | "reconcile"): Uint8Array {
  return Buffer.from(
    `${JSON.stringify({
      schemaVersion: 1,
      kind: "adapter-call-did-not-complete",
      effectId: effect.effectId,
      provider: effect.target.provider,
      phase,
    })}\n`,
    "utf8",
  );
}

function zeroBytes(value: Uint8Array): void {
  value.fill(0);
}

function zeroResultDetail(value: EffectSendResult | EffectReconciliationResult): void {
  zeroBytes(value.detail);
}

function normalizedResource(value: ExternalResourceV1, observedAt: IsoInstant): ExternalResourceV1 {
  const parsed = ExternalResourceV1Schema.parse(value);
  return ExternalResourceV1Schema.parse({ ...parsed, observedAt });
}

function safeReconcileAt(
  requested: IsoInstant | undefined,
  observedAt: IsoInstant,
  fallbackDelayMs: number,
): IsoInstant {
  if (requested !== undefined) {
    const requestedMs = Date.parse(requested);
    const observedMs = Date.parse(observedAt);
    if (requestedMs > observedMs && requestedMs - observedMs <= MAX_RECONCILE_DELAY_MS) {
      return IsoInstantSchema.parse(requested);
    }
  }
  return later(observedAt, fallbackDelayMs);
}

async function withAbsoluteDeadline<T>(input: {
  deadline: IsoInstant;
  clock: EffectWorkerClockPort;
  parentSignal: AbortSignal;
  label: string;
  operation(signal: AbortSignal): Promise<T> | T;
  disposeLateResult?(value: T): void;
}): Promise<T> {
  const remainingMs = Date.parse(input.deadline) - input.clock.now().getTime();
  if (input.parentSignal.aborted) {
    throw new EffectWorkerStop("aborted", `${input.label} aborted`);
  }
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    throw new EffectWorkerStop("deadline-elapsed", `${input.label} deadline elapsed`);
  }

  const controller = new AbortController();
  let acceptResult = true;
  let stopReason: "aborted" | "deadline-elapsed" = "deadline-elapsed";
  let rejectStop: ((error: EffectWorkerStop) => void) | undefined;
  const stop = new Promise<never>((_resolve, reject) => {
    rejectStop = reject;
  });
  const stopNow = (reason: "aborted" | "deadline-elapsed") => {
    stopReason = reason;
    controller.abort(
      reason === "aborted" ? input.parentSignal.reason : new Error("operation deadline elapsed"),
    );
    rejectStop?.(
      new EffectWorkerStop(
        reason,
        reason === "aborted" ? `${input.label} aborted` : `${input.label} deadline elapsed`,
      ),
    );
  };
  const onParentAbort = () => stopNow("aborted");
  input.parentSignal.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => stopNow("deadline-elapsed"), Math.max(1, remainingMs));

  const operation = Promise.resolve().then(() => input.operation(controller.signal));
  const guardedOperation = operation.then((value) => {
    if (!acceptResult) {
      try {
        input.disposeLateResult?.(value);
      } catch {
        // Cleanup must never turn a safely discarded late result into an
        // unhandled rejection or revive it as a usable provider outcome.
      }
      throw new EffectWorkerStop(
        stopReason,
        stopReason === "aborted" ? `${input.label} aborted` : `${input.label} deadline elapsed`,
      );
    }
    return value;
  });

  try {
    return await Promise.race([guardedOperation, stop]);
  } finally {
    acceptResult = false;
    clearTimeout(timer);
    input.parentSignal.removeEventListener("abort", onParentAbort);
  }
}

function sha256(value: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(value).digest("hex")}`);
}

export class EffectWorker {
  readonly #ownerId: string;
  readonly #repository: EffectWorkerRepositoryPort;
  readonly #adapters: AdapterRegistry;
  readonly #payloads: EffectPayloadPort;
  readonly #evidence: SanitizedProviderEvidencePort;
  readonly #observations: ObservationIssuerPort;
  readonly #credentials: EffectCredentialPort;
  readonly #clock: EffectWorkerClockPort;
  readonly #claimDurationMs: number;
  readonly #operationTimeoutMs: number;
  readonly #reconcileDelayMs: number;

  public constructor(options: EffectWorkerOptions) {
    this.#ownerId = safeOwnerId(options.ownerId);
    this.#repository = options.repository;
    this.#adapters = options.adapters;
    this.#payloads = options.payloads;
    this.#evidence = options.evidence;
    this.#observations = options.observations;
    this.#credentials = options.credentials;
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#claimDurationMs = boundedMilliseconds(
      options.claimDurationMs ?? 60_000,
      "claimDurationMs",
      MAX_CLAIM_MS,
    );
    this.#operationTimeoutMs = boundedMilliseconds(
      options.adapterCallTimeoutMs ?? 30_000,
      "adapterCallTimeoutMs",
      MAX_OPERATION_MS,
    );
    if (this.#operationTimeoutMs >= this.#claimDurationMs) {
      fail("adapterCallTimeoutMs must be shorter than claimDurationMs");
    }
    this.#reconcileDelayMs = boundedMilliseconds(
      options.reconcileDelayMs ?? 30_000,
      "reconcileDelayMs",
      MAX_RECONCILE_DELAY_MS,
    );
  }

  public async processNextSend(signal: AbortSignal): Promise<EffectWorkerResult> {
    const claimedAt = instant(this.#clock);
    const claim = this.#repository.claimNextSend(
      claimInput(this.#ownerId, claimedAt, this.#claimDurationMs),
    );
    if (claim === null) return { kind: "idle", operation: "send" };
    const deadline = later(claimedAt, this.#operationTimeoutMs);
    try {
      if (signal.aborted) throw new EffectWorkerStop("aborted", "send aborted");
      const adapter = this.#adapters.require(claim.effect.target.provider);
      const rawCredentialReference = this.#credentials.referenceFor(claim.effect);
      const credentialReference =
        rawCredentialReference === null ? null : parseCredentialReference(rawCredentialReference);
      const payload = await withAbsoluteDeadline({
        deadline,
        clock: this.#clock,
        parentSignal: signal,
        label: "payload read",
        operation: async (stageSignal) =>
          Uint8Array.from(
            await this.#payloads.read({
              payloadDigest: claim.effect.payloadDigest,
              deadline,
              signal: stageSignal,
            }),
          ),
        disposeLateResult: zeroBytes,
      });
      try {
        if (sha256Bytes(payload) !== claim.effect.payloadDigest) {
          fail("payload store returned bytes with the wrong digest");
        }
        if (signal.aborted) throw new EffectWorkerStop("aborted", "send aborted before begin");
        const begunAt = this.#freshBeforeDeadline(deadline, "begin send");
        let sent: BeginSendResult;
        try {
          sent = this.#repository.beginSend(mutationInput(claim, claim.effect.revision, begunAt));
        } catch (error) {
          rethrowTrustedRepositoryError(error);
        }
        return await this.#invokeSend(
          adapter,
          sent,
          claim,
          payload,
          credentialReference,
          signal,
          deadline,
        );
      } finally {
        zeroBytes(payload);
      }
    } catch (error) {
      const interrupted = this.#interrupted("send", claim.effect.effectId, signal, error);
      if (interrupted !== null) return interrupted;
      throw error;
    }
  }

  async #invokeSend(
    adapter: ValidatedExternalProviderAdapter,
    sent: BeginSendResult,
    claim: EffectOutboxClaim,
    payload: Uint8Array,
    credentialReference: CredentialReferenceV1 | null,
    signal: AbortSignal,
    deadline: IsoInstant,
  ): Promise<EffectWorkerResult> {
    let result: EffectSendResult | undefined;
    try {
      try {
        const providerResult = await withAbsoluteDeadline<EffectSendResult>({
          deadline,
          clock: this.#clock,
          parentSignal: signal,
          label: "provider send",
          operation: async (callSignal) =>
            await adapter.send({
              effect: sent.effect,
              payload,
              credentialReference,
              claim: dispatchClaim(claim, sent.effect.revision),
              deadline,
              signal: callSignal,
              assertActive: async () => {
                const checkedAt = this.#freshAdapterAuthorizationTime(
                  callSignal,
                  signal,
                  deadline,
                  "provider send authorization",
                );
                try {
                  this.#repository.assertDispatchActive(sent.dispatchToken, checkedAt);
                } catch (error) {
                  rethrowTrustedRepositoryError(error);
                }
              },
            }),
          disposeLateResult: zeroResultDetail,
        });
        result = providerResult;
      } catch (error) {
        if (error instanceof EffectWorkerStop || error instanceof EffectClaimLost || signal.aborted)
          throw error;
        return await this.#recordSendFailure(adapter, sent, claim, signal, deadline);
      }
      if (result === undefined) fail("provider send completed without a result");
      return await this.#recordSendResult(adapter, sent, claim, result, signal, deadline);
    } finally {
      if (result !== undefined) zeroResultDetail(result);
    }
  }

  async #recordSendFailure(
    adapter: ValidatedExternalProviderAdapter,
    sent: BeginSendResult,
    claim: EffectOutboxClaim,
    signal: AbortSignal,
    deadline: IsoInstant,
  ): Promise<EffectWorkerResult> {
    const detail = genericFailureDetail(sent.effect, "send");
    const recordedAt = this.#freshBeforeDeadline(deadline, "send failure evidence");
    const detailDigest = await this.#persistEvidence(adapter, {
      effect: sent.effect,
      phase: "send",
      outcome: "ambiguous",
      outcomeCode: null,
      detail,
      recordedAt,
      deadline,
      signal,
    });
    const persisted = this.#mutateSend(sent, deadline, (mutationAt) =>
      this.#repository.recordSendOutcome({
        ...mutationInput(claim, sent.effect.revision, mutationAt),
        outcome: {
          kind: "timeout",
          providerCorrelationKey: null,
          nextReconcileAt: later(mutationAt, this.#reconcileDelayMs),
          detailDigest,
        },
      }),
    );
    return this.#completed("send", persisted);
  }

  async #recordSendResult(
    adapter: ValidatedExternalProviderAdapter,
    sent: BeginSendResult,
    claim: EffectOutboxClaim,
    result: EffectSendResult,
    signal: AbortSignal,
    deadline: IsoInstant,
  ): Promise<EffectWorkerResult> {
    const recordedAt = this.#freshBeforeDeadline(deadline, "send evidence");
    const detailDigest = await this.#persistEvidence(adapter, {
      effect: sent.effect,
      phase: "send",
      outcome: result.kind,
      outcomeCode: result.kind === "rejected" ? result.code : null,
      detail: result.detail,
      recordedAt,
      deadline,
      signal,
    });

    let persisted: PersistedEffect;
    if (result.kind === "observed") {
      const observedAt = this.#freshBeforeDeadline(deadline, "send observation");
      const resource = normalizedResource(result.resource, observedAt);
      const observation = await this.#issueObservation(adapter, {
        effect: sent.effect,
        resource,
        source: "provider-send",
        ownerId: claim.lockedBy,
        fence: claim.fence,
        evidenceDigest: detailDigest,
        observedAt,
        deadline,
        signal,
      });
      persisted = this.#mutateSend(sent, deadline, () =>
        this.#repository.recordSendOutcome({
          ...mutationInput(claim, sent.effect.revision, observedAt),
          outcome: {
            kind: "observed",
            providerCorrelationKey: result.correlationKey,
            resource,
            observation,
            detailDigest,
          },
        }),
      );
    } else if (result.kind === "ambiguous") {
      persisted = this.#mutateSend(sent, deadline, (mutationAt) =>
        this.#repository.recordSendOutcome({
          ...mutationInput(claim, sent.effect.revision, mutationAt),
          outcome: {
            kind: "ambiguous",
            providerCorrelationKey: result.correlationKey,
            nextReconcileAt: safeReconcileAt(
              result.reconcileAfter,
              mutationAt,
              this.#reconcileDelayMs,
            ),
            detailDigest,
          },
        }),
      );
    } else {
      persisted = this.#mutateSend(sent, deadline, (mutationAt) =>
        this.#repository.recordSendOutcome({
          ...mutationInput(claim, sent.effect.revision, mutationAt),
          outcome: {
            kind: "rejected",
            code: result.code,
            retryable: result.retryable,
            evidenceDigest: detailDigest,
          },
        }),
      );
    }
    return this.#completed("send", persisted);
  }

  public async processNextReconciliation(signal: AbortSignal): Promise<EffectWorkerResult> {
    const claimedAt = instant(this.#clock);
    const claim = this.#repository.claimNextReconciliation(
      claimInput(this.#ownerId, claimedAt, this.#claimDurationMs),
    );
    if (claim === null) return { kind: "idle", operation: "reconcile" };
    const deadline = later(claimedAt, this.#operationTimeoutMs);
    try {
      if (signal.aborted) throw new EffectWorkerStop("aborted", "reconciliation aborted");
      const adapter = this.#adapters.require(claim.effect.target.provider);
      let result: EffectReconciliationResult | undefined;
      try {
        try {
          const providerResult = await withAbsoluteDeadline<EffectReconciliationResult>({
            deadline,
            clock: this.#clock,
            parentSignal: signal,
            label: "provider reconciliation",
            operation: async (callSignal) =>
              await adapter.reconcile({
                effect: claim.effect,
                credentialReference: this.#credentials.referenceFor(claim.effect),
                claim: dispatchClaim(claim, claim.effect.revision),
                deadline,
                signal: callSignal,
                assertActive: async () => {
                  const checkedAt = this.#freshAdapterAuthorizationTime(
                    callSignal,
                    signal,
                    deadline,
                    "provider reconciliation authorization",
                  );
                  try {
                    this.#repository.assertReconciliationActive(
                      reconciliationToken(claim),
                      checkedAt,
                    );
                  } catch (error) {
                    rethrowTrustedRepositoryError(error);
                  }
                },
              }),
            disposeLateResult: zeroResultDetail,
          });
          result = providerResult;
        } catch (error) {
          if (
            error instanceof EffectWorkerStop ||
            error instanceof EffectClaimLost ||
            signal.aborted
          )
            throw error;
          result = {
            kind: "ambiguous",
            correlationKey: claim.effect.providerCorrelationKey,
            reconcileAfter: later(
              this.#freshBeforeDeadline(deadline, "reconciliation failure"),
              this.#reconcileDelayMs,
            ),
            detail: genericFailureDetail(claim.effect, "reconcile"),
          };
        }
        if (result === undefined) fail("provider reconciliation completed without a result");
        return await this.#recordReconciliationResult(adapter, claim, result, signal, deadline);
      } finally {
        if (result !== undefined) zeroResultDetail(result);
      }
    } catch (error) {
      const interrupted = this.#interrupted("reconcile", claim.effect.effectId, signal, error);
      if (interrupted !== null) return interrupted;
      throw error;
    }
  }

  async #recordReconciliationResult(
    adapter: ValidatedExternalProviderAdapter,
    claim: EffectOutboxClaim,
    result: EffectReconciliationResult,
    signal: AbortSignal,
    deadline: IsoInstant,
  ): Promise<EffectWorkerResult> {
    const recordedAt = this.#freshBeforeDeadline(deadline, "reconciliation evidence");
    const detailDigest = await this.#persistEvidence(adapter, {
      effect: claim.effect,
      phase: "reconcile",
      outcome: result.kind,
      outcomeCode: result.kind === "manual-intervention" ? result.code : null,
      detail: result.detail,
      recordedAt,
      deadline,
      signal,
    });

    let persisted: PersistedEffect;
    if (result.kind === "observed") {
      const observedAt = this.#freshBeforeDeadline(deadline, "reconciliation observation");
      const resource = normalizedResource(result.resource, observedAt);
      const observation = await this.#issueObservation(adapter, {
        effect: claim.effect,
        resource,
        source: "provider-reconciliation",
        ownerId: claim.lockedBy,
        fence: claim.fence,
        evidenceDigest: detailDigest,
        observedAt,
        deadline,
        signal,
      });
      if (claim.effect.state === "observed") {
        persisted = this.#mutateReconciliation(claim, deadline, () =>
          this.#repository.confirmObserved({
            ...mutationInput(claim, claim.effect.revision, observedAt),
            providerCorrelationKey: result.correlationKey,
            resource,
            observation,
            confirmationEvidenceDigest: detailDigest,
          }),
        );
      } else {
        persisted = this.#mutateReconciliation(claim, deadline, () =>
          this.#repository.recordReconciliationObserved({
            ...mutationInput(claim, claim.effect.revision, observedAt),
            providerCorrelationKey: result.correlationKey,
            resource,
            observation,
            detailDigest,
          }),
        );
      }
    } else if (
      result.kind === "manual-intervention" &&
      (claim.effect.state === "unknown" || claim.effect.state === "observed")
    ) {
      persisted = this.#mutateReconciliation(claim, deadline, (mutationAt) =>
        this.#repository.requireManualIntervention({
          ...mutationInput(claim, claim.effect.revision, mutationAt),
          detailDigest,
        }),
      );
    } else if (claim.effect.state === "sent") {
      // A sent effect must first become unknown. This preserves the legal
      // sent -> unknown -> manual-intervention path and prevents a provider
      // response from skipping the durable ambiguity checkpoint.
      persisted = this.#mutateReconciliation(claim, deadline, (mutationAt) =>
        this.#repository.recordReconciliationUnknown({
          ...mutationInput(claim, claim.effect.revision, mutationAt),
          providerCorrelationKey:
            result.kind === "manual-intervention" ? null : result.correlationKey,
          nextReconcileAt: safeReconcileAt(
            result.kind === "manual-intervention" ? undefined : result.reconcileAfter,
            mutationAt,
            this.#reconcileDelayMs,
          ),
          detailDigest,
        }),
      );
    } else if (claim.effect.state === "observed") {
      // A missing or ambiguous follow-up cannot negate an already attested
      // provider resource. Preserve observed and schedule another read.
      persisted = this.#mutateReconciliation(claim, deadline, (mutationAt) =>
        this.#repository.deferObservedReconciliation({
          ...mutationInput(claim, claim.effect.revision, mutationAt),
          outcome: result.kind === "not-found" ? "not-found" : "ambiguous",
          providerCorrelationKey:
            result.kind === "manual-intervention" ? null : result.correlationKey,
          nextReconcileAt: safeReconcileAt(
            result.kind === "manual-intervention" ? undefined : result.reconcileAfter,
            mutationAt,
            this.#reconcileDelayMs,
          ),
          detailDigest,
        }),
      );
    } else {
      if (result.kind === "manual-intervention") {
        fail("manual intervention outcome reached an unsupported effect state");
      }
      persisted = this.#mutateReconciliation(claim, deadline, (mutationAt) =>
        this.#repository.recordReconciliationUnresolved({
          ...mutationInput(claim, claim.effect.revision, mutationAt),
          outcome: result.kind,
          providerCorrelationKey: result.correlationKey,
          nextReconcileAt: safeReconcileAt(
            result.reconcileAfter,
            mutationAt,
            this.#reconcileDelayMs,
          ),
          detailDigest,
        }),
      );
    }
    return this.#completed("reconcile", persisted);
  }

  async #persistEvidence(
    adapter: ValidatedExternalProviderAdapter,
    input: Readonly<{
      effect: ExternalEffectV1;
      phase: "send" | "reconcile";
      outcome: string;
      outcomeCode: NamespacedCode | null;
      detail: Uint8Array;
      recordedAt: IsoInstant;
      deadline: IsoInstant;
      signal: AbortSignal;
    }>,
  ): Promise<Sha256Digest> {
    const raw = Uint8Array.from(input.detail);
    zeroBytes(input.detail);
    try {
      return Sha256DigestSchema.parse(
        await withAbsoluteDeadline({
          deadline: input.deadline,
          clock: this.#clock,
          parentSignal: input.signal,
          label: `${input.phase} evidence persistence`,
          operation: async (stageSignal) =>
            await this.#evidence.persist({
              effect: input.effect,
              adapterId: adapter.adapterId,
              adapterVersion: adapter.adapterVersion,
              phase: input.phase,
              outcome: input.outcome,
              outcomeCode: input.outcomeCode,
              rawDetail: raw,
              recordedAt: input.recordedAt,
              deadline: input.deadline,
              signal: stageSignal,
            }),
        }),
      );
    } finally {
      zeroBytes(raw);
      zeroBytes(input.detail);
    }
  }

  async #issueObservation(
    adapter: ValidatedExternalProviderAdapter,
    input: Readonly<{
      effect: ExternalEffectV1;
      resource: ExternalResourceV1;
      source: ExternalObservationSourceV1;
      ownerId: string;
      fence: number;
      evidenceDigest: Sha256Digest;
      observedAt: IsoInstant;
      deadline: IsoInstant;
      signal: AbortSignal;
    }>,
  ): Promise<ExternalObservationV1> {
    const issued = await withAbsoluteDeadline({
      deadline: input.deadline,
      clock: this.#clock,
      parentSignal: input.signal,
      label: "observation issuance",
      operation: async (stageSignal) =>
        await this.#observations.issue({
          ...input,
          adapterId: adapter.adapterId,
          adapterVersion: adapter.adapterVersion,
          signal: stageSignal,
        }),
    });
    const observation = ExternalObservationV1Schema.parse(issued);
    if (
      observation.source !== input.source ||
      observation.adapterId !== adapter.adapterId ||
      observation.adapterVersion !== adapter.adapterVersion ||
      observation.evidenceDigest !== input.evidenceDigest ||
      observation.observedAt !== input.observedAt
    ) {
      fail("issued observation does not bind the exact adapter, evidence, and invocation");
    }
    return observation;
  }

  #freshBeforeDeadline(deadline: IsoInstant, label: string): IsoInstant {
    const observedAt = instant(this.#clock);
    if (observedAt >= deadline) {
      throw new EffectWorkerStop("deadline-elapsed", `${label} deadline elapsed`);
    }
    return observedAt;
  }

  #freshAdapterAuthorizationTime(
    stageSignal: AbortSignal,
    parentSignal: AbortSignal,
    deadline: IsoInstant,
    label: string,
  ): IsoInstant {
    if (parentSignal.aborted) {
      throw new EffectWorkerStop("aborted", `${label} aborted`);
    }
    if (stageSignal.aborted) {
      throw new EffectWorkerStop("deadline-elapsed", `${label} deadline elapsed`);
    }
    return this.#freshBeforeDeadline(deadline, label);
  }

  #mutateSend(
    sent: BeginSendResult,
    deadline: IsoInstant,
    mutation: (mutationAt: IsoInstant) => PersistedEffect,
  ): PersistedEffect {
    const checkedAt = this.#freshBeforeDeadline(deadline, "send commit");
    try {
      this.#repository.assertDispatchActive(sent.dispatchToken, checkedAt);
      // Intentionally no await between the fresh lease/approval check and the
      // fenced repository mutation. A competing claimant still loses via CAS.
      return mutation(checkedAt);
    } catch (error) {
      return rethrowTrustedRepositoryError(error);
    }
  }

  #mutateReconciliation(
    claim: EffectOutboxClaim,
    deadline: IsoInstant,
    mutation: (mutationAt: IsoInstant) => PersistedEffect,
  ): PersistedEffect {
    const checkedAt = this.#freshBeforeDeadline(deadline, "reconciliation commit");
    try {
      this.#repository.assertReconciliationActive(reconciliationToken(claim), checkedAt);
      // Intentionally no await between the fresh lease check and the fenced
      // repository mutation. Resource timestamps cannot substitute for this.
      return mutation(checkedAt);
    } catch (error) {
      return rethrowTrustedRepositoryError(error);
    }
  }

  #interrupted(
    operation: "send" | "reconcile",
    effectId: string,
    signal: AbortSignal,
    error: unknown,
  ): EffectWorkerResult | null {
    if (signal.aborted || (error instanceof EffectWorkerStop && error.reason === "aborted")) {
      return { kind: "interrupted", operation, effectId, reason: "aborted" };
    }
    if (error instanceof EffectWorkerStop && error.reason === "deadline-elapsed") {
      return { kind: "interrupted", operation, effectId, reason: "deadline-elapsed" };
    }
    if (error instanceof EffectClaimLost) {
      return { kind: "interrupted", operation, effectId, reason: "claim-lost" };
    }
    return null;
  }

  #completed(operation: "send" | "reconcile", persisted: PersistedEffect): EffectWorkerResult {
    return {
      kind: "completed",
      operation,
      effectId: persisted.effect.effectId,
      state: persisted.effect.state,
    };
  }
}

export function createInMemorySanitizingEvidencePort(
  sink: Map<Sha256Digest, Uint8Array>,
): SanitizedProviderEvidencePort {
  return {
    persist(input) {
      // Intended for tests/local development only: callers supply already-safe
      // bytes. Production composition must provide provider-specific redaction.
      const bytes = Uint8Array.from(input.rawDetail);
      const digest = sha256(bytes);
      sink.set(digest, bytes);
      return digest;
    },
  };
}

// Production port implementations (kernel-artifact-backed payload reads,
// redacted evidence persistence, canonical observation attestation). See
// ./ports/index.ts. This file does not depend on that module, so re-
// exporting it here creates no import cycle.
export * from "./ports/index.js";

// The plan-to-outbox bridge: turns a work-tracking-integrations provision
// plan into planned kernel effects. See ./plan-outbox-bridge.ts.
export * from "./plan-outbox-bridge.js";
