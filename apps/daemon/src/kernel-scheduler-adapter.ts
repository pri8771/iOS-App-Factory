import { createHash } from "node:crypto";

import {
  AttemptIdSchema,
  EventIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  StepIdSchema,
  type AttemptId,
  type BlockerV1,
  type EventV1,
  type ExecutionAttemptV1,
  type FailureV1,
  type IsoInstant,
  type NamespacedCode,
  type StepV1,
} from "@app-factory/contracts";
import {
  assertActiveAttemptLease,
  createFactoryRepositories,
  type FactoryRepositories,
  type LeaseRecord,
} from "@app-factory/kernel";
import {
  RestartSafeScheduler,
  SCHEDULER_STEP_PLAN,
  SchedulerFenceError,
  SchedulerInvariantError,
  type RestartSafeSchedulerOptions,
  type SchedulerAttemptSnapshot,
  type SchedulerAttemptTransition,
  type SchedulerCandidate,
  type SchedulerLease,
  type SchedulerPersistencePort,
  type SchedulerStepExecutorPort,
  type SchedulerStepKey,
  type SchedulerStepSnapshot,
  type SchedulerStepTransition,
  type SchedulerTickResult,
  type SchedulerWorkSnapshot,
} from "@app-factory/scheduler";
import type Database from "better-sqlite3";

import type { ReconcilePort } from "./command-runtime.js";

const STEP_OPERATION_BY_KEY = {
  prepare: "factory.prepare",
  execute: "factory.execute",
  verify: "factory.verify",
} as const satisfies Readonly<Record<SchedulerStepKey, string>>;

const ENCODED_CODE_PREFIX = "scheduler.x";
const DEFAULT_CANCELLATION_REASON = "Cancelled by persisted scheduler intent.";

export type KernelSchedulerIdPurpose =
  "lease-event" | "step" | "step-created-event" | "attempt-state-event" | "step-state-event";

export type KernelSchedulerIdContext = Readonly<{
  attemptId: string;
  fence: number;
  sequence: number;
  stepKey: SchedulerStepKey | null;
}>;

export type KernelSchedulerIdFactory = (
  purpose: KernelSchedulerIdPurpose,
  context: KernelSchedulerIdContext,
) => string;

export type KernelSchedulerPersistenceOptions = Readonly<{
  database: Database.Database;
  repositories?: FactoryRepositories;
  idFactory?: KernelSchedulerIdFactory;
}>;

export type CreateKernelSchedulerControllerOptions = Readonly<{
  database: Database.Database;
  ownerId: string;
  executor: SchedulerStepExecutorPort;
  idFactory?: KernelSchedulerIdFactory;
  clock?: RestartSafeSchedulerOptions["clock"];
  observer?: RestartSafeSchedulerOptions["observer"];
  leaseDurationMs?: number;
}>;

export type KernelSchedulerController = Readonly<{
  persistence: KernelSchedulerPersistenceAdapter;
  scheduler: RestartSafeScheduler;
  tick(): Promise<SchedulerTickResult>;
  reconcile: ReconcilePort;
  interruptActiveCancellation(attemptId: AttemptId): boolean;
  stop(): Promise<void>;
}>;

function deterministicUuid(
  purpose: KernelSchedulerIdPurpose,
  context: KernelSchedulerIdContext,
): string {
  const digest = createHash("sha256")
    .update(
      [
        "app-factory.kernel-scheduler.v1",
        purpose,
        context.attemptId,
        String(context.fence),
        String(context.sequence),
        context.stepKey ?? "",
      ].join("\0"),
    )
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function parseMilliseconds(label: string, value: string): number {
  const parsed = IsoInstantSchema.parse(value);
  const milliseconds = Date.parse(parsed);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`${label} must be a finite ISO instant`);
  }
  return milliseconds;
}

/** Returns requested when it is already newer, otherwise one millisecond past every floor. */
function nextInstant(requested: string, ...floors: readonly string[]): IsoInstant {
  const requestedMilliseconds = parseMilliseconds("requested instant", requested);
  const floorMilliseconds = floors.map((value) => parseMilliseconds("durable time floor", value));
  const milliseconds = Math.max(
    requestedMilliseconds,
    ...floorMilliseconds.map((value) => value + 1),
  );
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

function observedInstant(requested: string, ...floors: readonly string[]): IsoInstant {
  const milliseconds = Math.max(
    parseMilliseconds("observed instant", requested),
    ...floors.map((value) => parseMilliseconds("durable observation floor", value)),
  );
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

function encodeCode(code: string): NamespacedCode {
  const direct = NamespacedCodeSchema.safeParse(code);
  if (direct.success && !code.startsWith(ENCODED_CODE_PREFIX)) return direct.data;
  const encoded = `${ENCODED_CODE_PREFIX}${Buffer.from(code, "utf8").toString("hex")}`;
  const parsed = NamespacedCodeSchema.safeParse(encoded);
  if (!parsed.success) {
    throw new SchedulerInvariantError("executor code cannot be represented by the V1 contract");
  }
  return parsed.data;
}

function decodeCode(code: string): string {
  if (!code.startsWith(ENCODED_CODE_PREFIX)) return code;
  const encoded = code.slice(ENCODED_CODE_PREFIX.length);
  if (encoded.length === 0 || encoded.length % 2 !== 0 || !/^[0-9a-f]+$/.test(encoded)) {
    throw new SchedulerInvariantError("stored scheduler code has an invalid reversible encoding");
  }
  const decoded = Buffer.from(encoded, "hex").toString("utf8");
  if (encodeCode(decoded) !== code) {
    throw new SchedulerInvariantError("stored scheduler code is not canonically encoded");
  }
  return decoded;
}

function blockerKind(code: string): BlockerV1["kind"] {
  const normalized = code.toLowerCase();
  if (normalized.includes("auth")) return "authentication";
  if (normalized.includes("approval")) return "approval";
  if (normalized.includes("policy")) return "policy";
  if (normalized.includes("input") || normalized.includes("clarif")) return "clarification";
  return "environment";
}

function toKernelBlocker(blocker: Readonly<{ code: string; message: string }>): BlockerV1 {
  return {
    kind: blockerKind(blocker.code),
    code: encodeCode(blocker.code),
    summary: blocker.message,
    requiredAction: null,
  };
}

function toSchedulerBlocker(blocker: BlockerV1 | null): SchedulerAttemptSnapshot["blocker"] {
  return blocker === null ? null : { code: decodeCode(blocker.code), message: blocker.summary };
}

function toKernelFailure(
  failure: Readonly<{
    code: string;
    message: string;
    retryable: boolean;
  }>,
): FailureV1 {
  return {
    code: encodeCode(failure.code),
    summary: failure.message,
    retryable: failure.retryable,
    detailArtifactDigest: null,
  };
}

function toSchedulerFailure(failure: FailureV1 | null): SchedulerAttemptSnapshot["failure"] {
  return failure === null
    ? null
    : {
        code: decodeCode(failure.code),
        message: failure.summary,
        retryable: failure.retryable,
      };
}

function operationKey(operation: string): SchedulerStepKey {
  for (const definition of SCHEDULER_STEP_PLAN) {
    if (STEP_OPERATION_BY_KEY[definition.key] === operation) return definition.key;
  }
  throw new SchedulerInvariantError(`unexpected durable scheduler operation ${operation}`);
}

function toAttemptSnapshot(attempt: ExecutionAttemptV1): SchedulerAttemptSnapshot {
  const failure =
    attempt.outcome?.kind === "failed" ? toSchedulerFailure(attempt.outcome.failure) : null;
  return {
    attemptId: attempt.attemptId,
    state: attempt.state,
    desiredState: attempt.desiredState,
    revision: attempt.revision,
    fence: attempt.fence,
    updatedAt: attempt.updatedAt,
    blocker: toSchedulerBlocker(attempt.blocker),
    failure,
  };
}

function toStepSnapshot(step: StepV1): SchedulerStepSnapshot {
  return {
    attemptId: step.attemptId,
    key: operationKey(step.operation),
    ordinal: step.ordinal,
    state: step.state,
    revision: step.revision,
    runCount: step.runCount,
    blocker: toSchedulerBlocker(step.blocker),
    failure: toSchedulerFailure(step.failure),
    outputDigest: step.outputDigest,
  };
}

function toSchedulerLease(lease: LeaseRecord): SchedulerLease {
  if (lease.attemptId === null) {
    throw new SchedulerInvariantError("an attempt scheduler lease is missing its attempt ID");
  }
  return {
    leaseKey: lease.leaseKey,
    attemptId: lease.attemptId,
    ownerId: lease.ownerId,
    fence: lease.fence,
    revision: lease.revision,
    heartbeatAt: lease.heartbeatAt,
    expiresAt: lease.expiresAt,
  };
}

function isEligible(attempt: ExecutionAttemptV1): boolean {
  if (
    attempt.state === "succeeded" ||
    attempt.state === "failed" ||
    attempt.state === "cancelled"
  ) {
    return false;
  }
  if (attempt.desiredState === "running") return true;
  if (attempt.desiredState === "cancelled") return true;
  return attempt.state !== "paused";
}

function planDigest(attempt: ExecutionAttemptV1, key: SchedulerStepKey): string {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(
        [
          "app-factory.scheduler-plan.v1",
          attempt.attemptId,
          attempt.taskSpecDigest,
          STEP_OPERATION_BY_KEY[key],
        ].join("\0"),
      )
      .digest("hex")}`,
  );
}

function resultAttemptId(result: SchedulerTickResult): AttemptId | null {
  switch (result.kind) {
    case "paused":
    case "cancelled":
    case "succeeded":
    case "blocked":
    case "failed":
    case "interrupted":
      return AttemptIdSchema.parse(result.attemptId);
    case "idle":
    case "busy":
    case "stopped":
    case "contended":
    case "fenced":
      return null;
  }
}

function scopedPersistence(
  persistence: KernelSchedulerPersistenceAdapter,
  attemptId: AttemptId,
): SchedulerPersistencePort {
  return {
    discoverEligible: async (input) => {
      const candidate = await persistence.discoverEligibleAttempt({
        attemptId,
        observedAt: input.observedAt,
      });
      return candidate === null ? [] : [candidate];
    },
    claimLease: async (input) => await persistence.claimLease(input),
    renewLease: async (input) => await persistence.renewLease(input),
    assertLease: async (input) => await persistence.assertLease(input),
    assertExecutionActive: async (input) => await persistence.assertExecutionActive(input),
    releaseLease: async (input) => await persistence.releaseLease(input),
    loadWork: async (input) => await persistence.loadWork(input),
    ensurePlan: async (input) => await persistence.ensurePlan(input),
    transitionAttempt: async (input) => await persistence.transitionAttempt(input),
    transitionStep: async (input) => await persistence.transitionStep(input),
  };
}

export class KernelSchedulerPersistenceAdapter implements SchedulerPersistencePort {
  readonly #database: Database.Database;
  readonly #repositories: FactoryRepositories;
  readonly #idFactory: KernelSchedulerIdFactory;

  public constructor(options: KernelSchedulerPersistenceOptions) {
    this.#database = options.database;
    this.#repositories = options.repositories ?? createFactoryRepositories(options.database);
    this.#idFactory = options.idFactory ?? deterministicUuid;
  }

  public async discoverEligible(input: {
    readonly limit: number;
    readonly observedAt: string;
  }): Promise<readonly SchedulerCandidate[]> {
    IsoInstantSchema.parse(input.observedAt);
    return this.#repositories.attempts
      .listReconciliationCandidates({ limit: input.limit })
      .map((attempt) => ({
        attemptId: attempt.attemptId,
        leaseKey: `attempt:${attempt.attemptId}`,
        updatedAt: attempt.updatedAt,
      }));
  }

  public isCancellationRequested(attemptIdValue: unknown): boolean {
    const attemptId = AttemptIdSchema.parse(attemptIdValue);
    return this.#repositories.attempts.findById(attemptId)?.desiredState === "cancelled";
  }

  /** Exact lookup used by command-scoped reconciliation; it never falls back to another attempt. */
  public async discoverEligibleAttempt(input: {
    readonly attemptId: string;
    readonly observedAt: string;
  }): Promise<SchedulerCandidate | null> {
    IsoInstantSchema.parse(input.observedAt);
    const attemptId = AttemptIdSchema.parse(input.attemptId);
    const attempt = this.#repositories.attempts.findById(attemptId);
    if (attempt === null || !isEligible(attempt)) return null;
    return {
      attemptId: attempt.attemptId,
      leaseKey: `attempt:${attempt.attemptId}`,
      updatedAt: attempt.updatedAt,
    };
  }

  public async claimLease(input: {
    readonly candidate: SchedulerCandidate;
    readonly ownerId: string;
    readonly acquiredAt: string;
    readonly expiresAt: string;
  }): Promise<SchedulerLease | null> {
    return this.#database
      .transaction((): SchedulerLease | null => {
        const attempt = this.#repositories.attempts.findById(input.candidate.attemptId);
        if (
          attempt === null ||
          attempt.updatedAt !== input.candidate.updatedAt ||
          input.candidate.leaseKey !== `attempt:${input.candidate.attemptId}` ||
          !isEligible(attempt)
        ) {
          return null;
        }

        const lastEvent = this.#repositories.events.listByAttempt(attempt.attemptId).at(-1);
        const acquiredAt = nextInstant(
          input.acquiredAt,
          attempt.updatedAt,
          ...(lastEvent === undefined ? [] : [lastEvent.occurredAt]),
        );
        const requestedDuration = Math.max(
          1,
          parseMilliseconds("lease expiry", input.expiresAt) -
            parseMilliseconds("lease acquisition", input.acquiredAt),
        );
        const expiresAt = IsoInstantSchema.parse(
          new Date(
            parseMilliseconds("effective lease acquisition", acquiredAt) + requestedDuration,
          ).toISOString(),
        );

        const active = this.#database
          .prepare(
            `SELECT lease_key FROM leases
           WHERE attempt_id = ? AND expires_at > ?
           ORDER BY lease_key LIMIT 1`,
          )
          .get(attempt.attemptId, acquiredAt) as Readonly<{ lease_key: string }> | undefined;
        if (active !== undefined) return null;

        const sequence = (lastEvent?.sequence ?? 0) + 1;
        const claimed = this.#repositories.leases.claim({
          leaseKey: input.candidate.leaseKey,
          attemptId: attempt.attemptId,
          ownerId: input.ownerId,
          expectedAttemptRevision: attempt.revision,
          acquiredAt,
          expiresAt,
          event: {
            schemaVersion: 1,
            eventId: EventIdSchema.parse(
              this.#idFactory("lease-event", {
                attemptId: attempt.attemptId,
                fence: attempt.fence + 1,
                sequence,
                stepKey: null,
              }),
            ),
            attemptId: attempt.attemptId,
            sequence,
            occurredAt: acquiredAt,
            commandId: null,
            causationEventId: lastEvent?.eventId ?? null,
            fence: attempt.fence + 1,
            type: "attempt.fence-claimed",
            data: {
              previousFence: attempt.fence,
              newFence: attempt.fence + 1,
              ownerId: input.ownerId,
            },
          },
        });
        return toSchedulerLease(claimed.lease);
      })
      .immediate();
  }

  public async renewLease(input: {
    readonly lease: SchedulerLease;
    readonly heartbeatAt: string;
    readonly expiresAt: string;
  }): Promise<SchedulerLease> {
    return this.#database
      .transaction(() => {
        const stored = this.#assertLeaseIdentity(input.lease);
        const heartbeatAt = nextInstant(input.heartbeatAt, stored.heartbeatAt);
        if (heartbeatAt >= stored.expiresAt) {
          throw new SchedulerFenceError("The scheduler lease expired before heartbeat renewal");
        }
        const requestedDuration = Math.max(
          1,
          parseMilliseconds("requested lease expiry", input.expiresAt) -
            parseMilliseconds("requested heartbeat", input.heartbeatAt),
        );
        const expiresAt = IsoInstantSchema.parse(
          new Date(
            Math.max(
              parseMilliseconds("requested lease expiry", input.expiresAt),
              parseMilliseconds("effective heartbeat", heartbeatAt) + requestedDuration,
              parseMilliseconds("durable lease expiry", stored.expiresAt) + 1,
            ),
          ).toISOString(),
        );
        try {
          return toSchedulerLease(
            this.#repositories.leases.heartbeat({
              leaseKey: stored.leaseKey,
              ownerId: stored.ownerId,
              fence: stored.fence,
              expectedRevision: stored.revision,
              heartbeatAt,
              expiresAt,
            }),
          );
        } catch (error) {
          throw this.#fenceError("Lease heartbeat lost its ownership or revision", error);
        }
      })
      .immediate();
  }

  public async assertLease(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<void> {
    this.#database
      .transaction(() => {
        const stored = this.#assertLeaseIdentity(input.lease);
        const attempt = this.#requireAttempt(stored.attemptId);
        const observedAt = observedInstant(input.observedAt, stored.heartbeatAt, attempt.updatedAt);
        this.#assertActive(stored, observedAt);
      })
      .immediate();
  }

  public async assertExecutionActive(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<void> {
    this.#database
      .transaction(() => {
        const stored = this.#assertLeaseIdentity(input.lease);
        const attempt = this.#requireAttempt(stored.attemptId);
        const observedAt = observedInstant(input.observedAt, stored.heartbeatAt, attempt.updatedAt);
        this.#assertActive(stored, observedAt);
        if (attempt.desiredState === "cancelled" || attempt.state !== "running") {
          throw new SchedulerFenceError(
            `Execution is no longer authorized while attempt state is ${attempt.state} and desired state is ${attempt.desiredState}`,
          );
        }
      })
      .immediate();
  }

  public async releaseLease(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<void> {
    this.#database
      .transaction(() => {
        const stored = this.#assertLeaseIdentity(input.lease);
        const attempt = this.#requireAttempt(stored.attemptId);
        const observedAt = observedInstant(input.observedAt, stored.heartbeatAt, attempt.updatedAt);
        this.#assertActive(stored, observedAt);
        try {
          this.#repositories.leases.release({
            leaseKey: stored.leaseKey,
            ownerId: stored.ownerId,
            fence: stored.fence,
          });
        } catch (error) {
          throw this.#fenceError("Lease release lost its ownership or fence", error);
        }
      })
      .immediate();
  }

  public async loadWork(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<SchedulerWorkSnapshot> {
    return this.#database
      .transaction(() => {
        const stored = this.#assertLeaseIdentity(input.lease);
        const attempt = this.#requireAttempt(stored.attemptId);
        const observedAt = observedInstant(input.observedAt, stored.heartbeatAt, attempt.updatedAt);
        this.#assertActive(stored, observedAt);
        return this.#loadWorkSnapshot(attempt);
      })
      .immediate();
  }

  public async ensurePlan(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly plan: typeof SCHEDULER_STEP_PLAN;
  }): Promise<SchedulerWorkSnapshot> {
    return this.#database
      .transaction(() => {
        this.#assertExactPlanDefinition(input.plan);
        const storedLease = this.#assertLeaseIdentity(input.lease);
        let attempt = this.#requireAttempt(storedLease.attemptId);
        let eventFloor = this.#repositories.events
          .listByAttempt(attempt.attemptId)
          .at(-1)?.occurredAt;
        this.#assertActive(
          storedLease,
          observedInstant(input.observedAt, storedLease.heartbeatAt, attempt.updatedAt),
        );

        const existing = this.#repositories.steps.listByAttempt(attempt.attemptId);
        this.#assertExistingPlan(existing, attempt);
        for (const definition of SCHEDULER_STEP_PLAN) {
          if (existing.some((step) => step.ordinal === definition.ordinal)) continue;
          const lastEvent = this.#repositories.events.listByAttempt(attempt.attemptId).at(-1);
          const sequence = (lastEvent?.sequence ?? 0) + 1;
          const occurredAt = nextInstant(
            input.observedAt,
            storedLease.heartbeatAt,
            attempt.updatedAt,
            ...(eventFloor === undefined ? [] : [eventFloor]),
          );
          const context: KernelSchedulerIdContext = {
            attemptId: attempt.attemptId,
            fence: storedLease.fence,
            sequence,
            stepKey: definition.key,
          };
          const stepId = StepIdSchema.parse(
            this.#idFactory("step", { ...context, fence: 0, sequence: definition.ordinal }),
          );
          const inputDigest = planDigest(attempt, definition.key);
          this.#repositories.steps.create({
            leaseKey: storedLease.leaseKey,
            ownerId: storedLease.ownerId,
            observedAt: occurredAt,
            step: {
              schemaVersion: 1,
              stepId,
              attemptId: attempt.attemptId,
              ordinal: definition.ordinal,
              operation: STEP_OPERATION_BY_KEY[definition.key],
              state: "pending",
              revision: 0,
              lastFence: storedLease.fence,
              runCount: 0,
              inputDigest,
              outputDigest: null,
              blocker: null,
              failure: null,
              startedAt: null,
              finishedAt: null,
            },
            event: {
              schemaVersion: 1,
              eventId: EventIdSchema.parse(this.#idFactory("step-created-event", context)),
              attemptId: attempt.attemptId,
              sequence,
              occurredAt,
              commandId: null,
              causationEventId: lastEvent?.eventId ?? null,
              fence: storedLease.fence,
              type: "step.created",
              data: {
                stepId,
                ordinal: definition.ordinal,
                operation: STEP_OPERATION_BY_KEY[definition.key],
                inputDigest,
              },
            },
          });
          eventFloor = occurredAt;
          attempt = this.#requireAttempt(storedLease.attemptId);
        }

        const completed = this.#repositories.steps.listByAttempt(attempt.attemptId);
        this.#assertExistingPlan(completed, attempt, true);
        return this.#loadWorkSnapshot(attempt);
      })
      .immediate();
  }

  public async transitionAttempt(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly expectedRevision: number;
    readonly transition: SchedulerAttemptTransition;
  }): Promise<SchedulerAttemptSnapshot> {
    return this.#database
      .transaction(() => {
        const storedLease = this.#assertLeaseIdentity(input.lease);
        const current = this.#requireAttempt(storedLease.attemptId);
        if (current.revision !== input.expectedRevision) {
          throw new SchedulerFenceError("Attempt revision changed before scheduler transition");
        }
        const occurredAt = this.#mutationTime(input.observedAt, current, storedLease);
        this.#assertActive(storedLease, occurredAt);
        const next = this.#nextAttempt(current, input.transition, occurredAt);
        const lastEvent = this.#repositories.events.listByAttempt(current.attemptId).at(-1);
        const sequence = (lastEvent?.sequence ?? 0) + 1;
        const event: EventV1 = {
          schemaVersion: 1,
          eventId: EventIdSchema.parse(
            this.#idFactory("attempt-state-event", {
              attemptId: current.attemptId,
              fence: storedLease.fence,
              sequence,
              stepKey: null,
            }),
          ),
          attemptId: current.attemptId,
          sequence,
          occurredAt,
          commandId: null,
          causationEventId: lastEvent?.eventId ?? null,
          fence: storedLease.fence,
          type: "attempt.state-changed",
          data: {
            from: current.state,
            to: next.state,
            blocker: next.blocker,
            outcome: next.outcome,
          },
        };
        try {
          return toAttemptSnapshot(
            this.#repositories.transitionAttemptState({
              leaseKey: storedLease.leaseKey,
              ownerId: storedLease.ownerId,
              observedAt: occurredAt,
              expectedRevision: input.expectedRevision,
              attempt: next,
              event,
            }),
          );
        } catch (error) {
          if (this.#isConcurrencyError(error)) {
            throw this.#fenceError("Attempt transition lost its lease or revision", error);
          }
          throw error;
        }
      })
      .immediate();
  }

  public async transitionStep(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly key: SchedulerStepKey;
    readonly expectedRevision: number;
    readonly transition: SchedulerStepTransition;
  }): Promise<SchedulerStepSnapshot> {
    return this.#database
      .transaction(() => {
        const storedLease = this.#assertLeaseIdentity(input.lease);
        const attempt = this.#requireAttempt(storedLease.attemptId);
        const current = this.#stepByKey(attempt.attemptId, input.key);
        if (current.revision !== input.expectedRevision) {
          throw new SchedulerFenceError("Step revision changed before scheduler transition");
        }
        if (input.transition.to === "running" && attempt.desiredState !== "running") {
          throw new SchedulerFenceError(
            "Attempt intent changed before the scheduler could start the step",
          );
        }
        const occurredAt = this.#mutationTime(input.observedAt, attempt, storedLease);
        this.#assertActive(storedLease, occurredAt);
        const next = this.#nextStep(current, input.transition, storedLease.fence, occurredAt);
        const lastEvent = this.#repositories.events.listByAttempt(attempt.attemptId).at(-1);
        const sequence = (lastEvent?.sequence ?? 0) + 1;
        const event: EventV1 = {
          schemaVersion: 1,
          eventId: EventIdSchema.parse(
            this.#idFactory("step-state-event", {
              attemptId: attempt.attemptId,
              fence: storedLease.fence,
              sequence,
              stepKey: input.key,
            }),
          ),
          attemptId: attempt.attemptId,
          sequence,
          occurredAt,
          commandId: null,
          causationEventId: lastEvent?.eventId ?? null,
          fence: storedLease.fence,
          type: "step.state-changed",
          data: {
            stepId: current.stepId,
            from: current.state,
            to: next.state,
            outputDigest: next.outputDigest,
            failureCode: next.failure?.code ?? null,
          },
        };
        try {
          return toStepSnapshot(
            this.#repositories.steps.transition({
              leaseKey: storedLease.leaseKey,
              ownerId: storedLease.ownerId,
              observedAt: occurredAt,
              expectedRevision: input.expectedRevision,
              fence: storedLease.fence,
              step: next,
              event,
            }),
          );
        } catch (error) {
          if (this.#isConcurrencyError(error)) {
            throw this.#fenceError("Step transition lost its lease or revision", error);
          }
          throw error;
        }
      })
      .immediate();
  }

  #requireAttempt(attemptId: string | null): ExecutionAttemptV1 {
    if (attemptId === null) {
      throw new SchedulerFenceError("The scheduler lease is not attached to an attempt");
    }
    const attempt = this.#repositories.attempts.findById(attemptId);
    if (attempt === null) {
      throw new SchedulerFenceError("The scheduler attempt no longer exists");
    }
    return attempt;
  }

  #assertLeaseIdentity(lease: SchedulerLease): LeaseRecord {
    const stored = this.#repositories.leases.findByKey(lease.leaseKey);
    if (
      stored === null ||
      stored.attemptId !== lease.attemptId ||
      stored.ownerId !== lease.ownerId ||
      stored.fence !== lease.fence ||
      stored.revision !== lease.revision ||
      stored.heartbeatAt !== lease.heartbeatAt ||
      stored.expiresAt !== lease.expiresAt
    ) {
      throw new SchedulerFenceError("The scheduler lease identity or revision is stale");
    }
    const attempt = this.#requireAttempt(stored.attemptId);
    if (attempt.fence !== stored.fence) {
      throw new SchedulerFenceError("The scheduler lease fence is no longer authoritative");
    }
    return stored;
  }

  #assertActive(lease: LeaseRecord, observedAt: IsoInstant): void {
    try {
      assertActiveAttemptLease(this.#database, {
        leaseKey: lease.leaseKey,
        attemptId: lease.attemptId,
        ownerId: lease.ownerId,
        fence: lease.fence,
        observedAt,
      });
    } catch (error) {
      throw this.#fenceError("The scheduler lease is absent, expired, or stale", error);
    }
  }

  #mutationTime(requested: string, attempt: ExecutionAttemptV1, lease: LeaseRecord): IsoInstant {
    const lastEvent = this.#repositories.events.listByAttempt(attempt.attemptId).at(-1);
    return nextInstant(
      requested,
      attempt.updatedAt,
      lease.heartbeatAt,
      ...(lastEvent === undefined ? [] : [lastEvent.occurredAt]),
    );
  }

  #loadWorkSnapshot(attempt: ExecutionAttemptV1): SchedulerWorkSnapshot {
    return {
      attempt: toAttemptSnapshot(attempt),
      steps: this.#repositories.steps.listByAttempt(attempt.attemptId).map(toStepSnapshot),
    };
  }

  #assertExactPlanDefinition(plan: typeof SCHEDULER_STEP_PLAN): void {
    if (
      plan.length !== SCHEDULER_STEP_PLAN.length ||
      plan.some(
        (definition, index) =>
          definition.key !== SCHEDULER_STEP_PLAN[index]?.key ||
          definition.ordinal !== SCHEDULER_STEP_PLAN[index]?.ordinal,
      )
    ) {
      throw new SchedulerInvariantError("scheduler requested an unsupported durable plan");
    }
  }

  #assertExistingPlan(
    steps: readonly StepV1[],
    attempt: ExecutionAttemptV1,
    requireComplete = false,
  ): void {
    if (steps.length > SCHEDULER_STEP_PLAN.length || (requireComplete && steps.length !== 3)) {
      throw new SchedulerInvariantError("durable plan must contain exactly three steps");
    }
    const ordinals = new Set<number>();
    for (const step of steps) {
      const expected = SCHEDULER_STEP_PLAN[step.ordinal];
      if (
        expected === undefined ||
        step.attemptId !== attempt.attemptId ||
        step.operation !== STEP_OPERATION_BY_KEY[expected.key] ||
        step.inputDigest !== planDigest(attempt, expected.key) ||
        ordinals.has(step.ordinal)
      ) {
        throw new SchedulerInvariantError("existing durable plan keys or ordinals do not match");
      }
      ordinals.add(step.ordinal);
    }
  }

  #stepByKey(attemptId: string, key: SchedulerStepKey): StepV1 {
    const matches = this.#repositories.steps
      .listByAttempt(attemptId)
      .filter((step) => step.operation === STEP_OPERATION_BY_KEY[key]);
    if (matches.length !== 1 || matches[0] === undefined) {
      throw new SchedulerInvariantError(`durable plan does not contain one ${key} step`);
    }
    return matches[0];
  }

  #nextAttempt(
    current: ExecutionAttemptV1,
    transition: SchedulerAttemptTransition,
    occurredAt: IsoInstant,
  ): ExecutionAttemptV1 {
    const common = {
      ...current,
      state: transition.to,
      revision: current.revision + 1,
      updatedAt: occurredAt,
      blocker: null,
      outcome: null,
      terminalAt: null,
    } as const;
    switch (transition.to) {
      case "running":
      case "paused":
        return common;
      case "blocked":
        return { ...common, blocker: toKernelBlocker(transition.blocker) };
      case "succeeded":
        return {
          ...common,
          currentStepId: null,
          outcome: { kind: "succeeded" },
          terminalAt: occurredAt,
        };
      case "failed":
        return {
          ...common,
          currentStepId: null,
          outcome: { kind: "failed", failure: toKernelFailure(transition.failure) },
          terminalAt: occurredAt,
        };
      case "cancelled":
        return {
          ...common,
          desiredState: "cancelled",
          currentStepId: null,
          outcome: { kind: "cancelled", reason: DEFAULT_CANCELLATION_REASON },
          terminalAt: occurredAt,
        };
    }
  }

  #nextStep(
    current: StepV1,
    transition: SchedulerStepTransition,
    fence: number,
    occurredAt: IsoInstant,
  ): StepV1 {
    const common = {
      ...current,
      state: transition.to,
      revision: current.revision + 1,
      lastFence: fence,
      outputDigest: null,
      blocker: null,
      failure: null,
    } as const;
    switch (transition.to) {
      case "running":
        return {
          ...common,
          runCount: current.runCount + 1,
          startedAt: current.startedAt ?? occurredAt,
          finishedAt: null,
        };
      case "succeeded":
        return {
          ...common,
          outputDigest: Sha256DigestSchema.parse(transition.outputDigest),
          finishedAt: occurredAt,
        };
      case "blocked":
        return { ...common, blocker: toKernelBlocker(transition.blocker), finishedAt: null };
      case "failed":
        return {
          ...common,
          failure: toKernelFailure(transition.failure),
          finishedAt: occurredAt,
        };
      case "cancelled":
        return { ...common, finishedAt: occurredAt };
      case "skipped":
        return { ...common, startedAt: null, finishedAt: null };
    }
  }

  #isConcurrencyError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return /lease|fence|revision conflict|expected (?:attempt|step )?revision|desiredState/i.test(
      error.message,
    );
  }

  #fenceError(message: string, cause: unknown): SchedulerFenceError {
    const error = new SchedulerFenceError(message);
    if (cause instanceof Error) error.cause = cause;
    return error;
  }
}

export function createKernelSchedulerController(
  options: CreateKernelSchedulerControllerOptions,
): KernelSchedulerController {
  const persistence = new KernelSchedulerPersistenceAdapter({
    database: options.database,
    ...(options.idFactory === undefined ? {} : { idFactory: options.idFactory }),
  });
  const scheduler = new RestartSafeScheduler({
    ownerId: options.ownerId,
    persistence,
    executor: options.executor,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.observer === undefined ? {} : { observer: options.observer }),
    ...(options.leaseDurationMs === undefined ? {} : { leaseDurationMs: options.leaseDurationMs }),
  });

  let tail: Promise<void> = Promise.resolve();
  let activeScheduler: RestartSafeScheduler | null = null;
  let stopping = false;

  const runExclusive = async <T>(
    selectedScheduler: RestartSafeScheduler,
    whenStopped: T,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const previous = tail;
    let release: (() => void) | undefined;
    tail = new Promise<void>((resolvePromise) => {
      release = resolvePromise;
    });
    await previous;
    if (stopping) {
      release?.();
      return whenStopped;
    }
    activeScheduler = selectedScheduler;
    try {
      return await operation();
    } finally {
      if (activeScheduler === selectedScheduler) activeScheduler = null;
      release?.();
    }
  };

  const tick = async (): Promise<SchedulerTickResult> =>
    await runExclusive(
      scheduler,
      { kind: "stopped", attemptId: null },
      async () => await scheduler.tick(),
    );
  const reconcile: ReconcilePort = async (request) => {
    if (request.attemptId === null) {
      const result = await tick();
      const attemptId = resultAttemptId(result);
      return attemptId === null ? [] : [attemptId];
    }

    const attemptId = AttemptIdSchema.parse(request.attemptId);
    const selectedScheduler = new RestartSafeScheduler({
      ownerId: options.ownerId,
      persistence: scopedPersistence(persistence, attemptId),
      executor: options.executor,
      ...(options.clock === undefined ? {} : { clock: options.clock }),
      ...(options.observer === undefined ? {} : { observer: options.observer }),
      ...(options.leaseDurationMs === undefined
        ? {}
        : { leaseDurationMs: options.leaseDurationMs }),
    });
    const result = await runExclusive(
      selectedScheduler,
      null,
      async () => await selectedScheduler.tick(),
    );
    if (result === null) return [];
    const reconciledAttemptId = resultAttemptId(result);
    if (reconciledAttemptId === null) return [];
    if (reconciledAttemptId !== attemptId) {
      throw new SchedulerInvariantError(
        "scoped reconciliation returned an attempt outside its requested scope",
      );
    }
    return [attemptId];
  };

  return {
    persistence,
    scheduler,
    tick,
    reconcile,
    interruptActiveCancellation: (attemptIdValue) => {
      const attemptId = AttemptIdSchema.parse(attemptIdValue);
      if (!persistence.isCancellationRequested(attemptId)) return false;
      activeScheduler?.interruptActiveAttempt(attemptId);
      return true;
    },
    stop: async () => {
      stopping = true;
      activeScheduler?.requestStop();
      await tail;
      await scheduler.stop();
    },
  };
}
