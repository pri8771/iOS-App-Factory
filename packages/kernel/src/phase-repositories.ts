import {
  IsoInstantSchema,
  PhaseDefinitionUpsertCommandV1Schema,
  PhaseDefinitionV1Schema,
  PhaseIdSchema,
  PhasePresetIdSchema,
  PhasePresetUpsertCommandV1Schema,
  PhasePresetV1Schema,
  CommandIdSchema,
  type PhaseDefinitionUpsertCommandV1,
  type PhaseDefinitionV1,
  type PhasePresetUpsertCommandV1,
  type PhasePresetV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * Studio Phase 4 persistence: `PhaseDefinitionRepository` (the reusable library of individually
 * revisioned phase definitions, `phase.upsert`) and `PhasePresetRepository` (ordered bundles that
 * embed a full, already-durable `PhaseDefinitionV1` snapshot per phase, `preset.upsert`/
 * `preset.list`). Both mirror `ProjectMilestoneRepository`'s compare-and-set-upsert-plus-append-
 * only-revision-history pattern exactly (migration 0009 mirrors migration 0007).
 *
 * Resolving `rules.standard[]` ruleIds against the compiled policy source
 * (`docs/policy/ios-app-factory-policy-source.v1.json`) is a fact this package cannot look up
 * itself: `dependency-cruiser.config.cjs`'s `kernel-imports-contracts-only` rule forbids
 * `packages/kernel` from importing `@app-factory/policy-corpus` (or any other non-contracts
 * workspace package). Both `upsert` methods therefore accept the resolved rule ID set as an
 * explicit port (`knownStandardRuleIds`) supplied by the caller — the daemon layer
 * (`apps/daemon/src/phase-command-runtime.ts`) is the one place that actually reads the policy
 * source file — and fail closed on any `rules.standard[]` entry not in that set.
 */

/**
 * Hand-parsed rather than a zod schema: `packages/kernel` may only import `@app-factory/contracts`
 * as a workspace dependency (`dependency-cruiser.config.cjs`'s `kernel-imports-contracts-only`
 * rule), and does not otherwise depend on `zod` directly.
 */
function parseKnownStandardRuleIds(value: unknown): ReadonlySet<string> {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 128)
  ) {
    throw new TypeError("knownStandardRuleIds must be an array of non-empty strings");
  }
  return new Set(value);
}

export type UpsertPhaseDefinitionInput = Readonly<{
  /** A `PhaseDefinitionUpsertCommandV1`; parsed at this boundary. */
  command: unknown;
  /** The trusted daemon-observed instant that becomes `updatedAt` (and `createdAt` on create). */
  recordedAt: unknown;
  /** Every `ruleId` the compiled policy source currently declares. */
  knownStandardRuleIds: unknown;
}>;

export type UpsertedPhaseDefinition = Readonly<{
  phase: PhaseDefinitionV1;
  created: boolean;
  duplicate: boolean;
}>;

export type PhaseDefinitionRevisionRecord = Readonly<{
  phase: PhaseDefinitionV1;
  command: PhaseDefinitionUpsertCommandV1;
}>;

export class PhaseDefinitionUpsertError extends Error {
  public constructor(
    public readonly code:
      | "phase.not-found"
      | "phase.already-exists"
      | "phase.revision-conflict"
      | "phase.identity-conflict"
      | "phase.unknown-rule-id",
    message: string,
  ) {
    super(message);
    this.name = "PhaseDefinitionUpsertError";
  }
}

export type UpsertPhasePresetInput = Readonly<{
  /** A `PhasePresetUpsertCommandV1`; parsed at this boundary. */
  command: unknown;
  recordedAt: unknown;
  knownStandardRuleIds: unknown;
}>;

export type UpsertedPhasePreset = Readonly<{
  preset: PhasePresetV1;
  created: boolean;
  duplicate: boolean;
}>;

export type PhasePresetRevisionRecord = Readonly<{
  preset: PhasePresetV1;
  command: PhasePresetUpsertCommandV1;
}>;

export class PhasePresetUpsertError extends Error {
  public constructor(
    public readonly code:
      | "preset.not-found"
      | "preset.already-exists"
      | "preset.revision-conflict"
      | "preset.identity-conflict"
      | "preset.unknown-rule-id",
    message: string,
  ) {
    super(message);
    this.name = "PhasePresetUpsertError";
  }
}

type PhaseDefinitionRow = Readonly<{
  phase_id: string;
  name: string;
  purpose: string;
  mode: string;
  revision: number;
  created_at: string;
  updated_at: string;
  payload_json: string;
}>;

type PhaseDefinitionRevisionRow = Readonly<{
  phase_id: string;
  revision: number;
  command_id: string;
  origin: string;
  issued_at: string;
  expected_revision: number | null;
  recorded_at: string;
  command_json: string;
  payload_json: string;
}>;

type PhasePresetRow = Readonly<{
  preset_id: string;
  name: string;
  revision: number;
  created_at: string;
  updated_at: string;
  payload_json: string;
}>;

type PhasePresetRevisionRow = Readonly<{
  preset_id: string;
  revision: number;
  command_id: string;
  origin: string;
  issued_at: string;
  expected_revision: number | null;
  recorded_at: string;
  command_json: string;
  payload_json: string;
}>;

function failInvariant(message: string): never {
  throw new Error(`Factory persistence invariant failed: ${message}`);
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failInvariant(
      `${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
    );
  }
}

function parseStoredJson<T>(
  table: string,
  identifier: string,
  payloadJson: string,
  parse: (value: unknown) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson) as unknown;
  } catch (error) {
    throw new Error(`${table} ${identifier} contains invalid JSON`, { cause: error });
  }
  try {
    return parse(value);
  } catch (error) {
    throw new Error(`${table} ${identifier} violates the current runtime contract`, {
      cause: error,
    });
  }
}

/** Every `rules.standard` entry across `phase` not present in `knownRuleIds`, in declared order. */
function unknownStandardRuleIds(
  standard: readonly string[],
  knownRuleIds: ReadonlySet<string>,
): readonly string[] {
  return standard.filter((ruleId) => !knownRuleIds.has(ruleId));
}

function decodePhaseDefinition(row: PhaseDefinitionRow): PhaseDefinitionV1 {
  const phase = parseStoredJson("phase_definitions", row.phase_id, row.payload_json, (value) =>
    PhaseDefinitionV1Schema.parse(value),
  );
  assertSame("phase_definitions phase_id projection", row.phase_id, phase.phaseId);
  assertSame("phase_definitions name projection", row.name, phase.name);
  assertSame("phase_definitions purpose projection", row.purpose, phase.purpose);
  assertSame("phase_definitions mode projection", row.mode, phase.mode);
  assertSame("phase_definitions revision projection", row.revision, phase.revision);
  assertSame("phase_definitions created_at projection", row.created_at, phase.createdAt);
  assertSame("phase_definitions updated_at projection", row.updated_at, phase.updatedAt);
  return phase;
}

function decodePhaseDefinitionRevision(
  row: PhaseDefinitionRevisionRow,
): PhaseDefinitionRevisionRecord {
  const phase = parseStoredJson(
    "phase_definition_revisions",
    `${row.phase_id}@${String(row.revision)}`,
    row.payload_json,
    (value) => PhaseDefinitionV1Schema.parse(value),
  );
  const command = parseStoredJson(
    "phase_definition_revisions",
    row.command_id,
    row.command_json,
    (value) => PhaseDefinitionUpsertCommandV1Schema.parse(value),
  );
  assertSame("revision phase_id projection", row.phase_id, phase.phaseId);
  assertSame("revision projection", row.revision, phase.revision);
  assertSame("revision updated_at projection", row.recorded_at, phase.updatedAt);
  assertSame("revision command_id projection", row.command_id, command.commandId);
  assertSame("revision origin projection", row.origin, command.origin);
  assertSame("revision issued_at projection", row.issued_at, command.issuedAt);
  assertSame(
    "revision expected_revision projection",
    row.expected_revision,
    command.upsert.expectedRevision,
  );
  assertSame("revision command phase", command.upsert.phase.phaseId, phase.phaseId);
  return { phase, command };
}

function decodePhasePreset(row: PhasePresetRow): PhasePresetV1 {
  const preset = parseStoredJson("phase_presets", row.preset_id, row.payload_json, (value) =>
    PhasePresetV1Schema.parse(value),
  );
  assertSame("phase_presets preset_id projection", row.preset_id, preset.presetId);
  assertSame("phase_presets name projection", row.name, preset.name);
  assertSame("phase_presets revision projection", row.revision, preset.revision);
  assertSame("phase_presets created_at projection", row.created_at, preset.createdAt);
  assertSame("phase_presets updated_at projection", row.updated_at, preset.updatedAt);
  return preset;
}

function decodePhasePresetRevision(row: PhasePresetRevisionRow): PhasePresetRevisionRecord {
  const preset = parseStoredJson(
    "phase_preset_revisions",
    `${row.preset_id}@${String(row.revision)}`,
    row.payload_json,
    (value) => PhasePresetV1Schema.parse(value),
  );
  const command = parseStoredJson(
    "phase_preset_revisions",
    row.command_id,
    row.command_json,
    (value) => PhasePresetUpsertCommandV1Schema.parse(value),
  );
  assertSame("revision preset_id projection", row.preset_id, preset.presetId);
  assertSame("revision projection", row.revision, preset.revision);
  assertSame("revision updated_at projection", row.recorded_at, preset.updatedAt);
  assertSame("revision command_id projection", row.command_id, command.commandId);
  assertSame("revision origin projection", row.origin, command.origin);
  assertSame("revision issued_at projection", row.issued_at, command.issuedAt);
  assertSame(
    "revision expected_revision projection",
    row.expected_revision,
    command.upsert.expectedRevision,
  );
  assertSame("revision command preset", command.upsert.preset.presetId, preset.presetId);
  return { preset, command };
}

const PHASE_DEFINITION_SELECT = `SELECT
  phase_id, name, purpose, mode, revision, created_at, updated_at, payload_json
FROM phase_definitions`;

const PHASE_DEFINITION_REVISION_SELECT = `SELECT
  phase_id, revision, command_id, origin, issued_at, expected_revision,
  recorded_at, command_json, payload_json
FROM phase_definition_revisions`;

/** Durable, revisioned library of reusable phase definitions. See the module doc comment. */
export class PhaseDefinitionRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(phaseIdInput: unknown): PhaseDefinitionV1 | null {
    const phaseId = PhaseIdSchema.parse(phaseIdInput);
    const row = this.database
      .prepare(`${PHASE_DEFINITION_SELECT} WHERE phase_id = ?`)
      .get(phaseId) as PhaseDefinitionRow | undefined;
    return row === undefined ? null : decodePhaseDefinition(row);
  }

  public findRevisionByCommandId(commandIdInput: unknown): PhaseDefinitionRevisionRecord | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database
      .prepare(`${PHASE_DEFINITION_REVISION_SELECT} WHERE command_id = ?`)
      .get(commandId) as PhaseDefinitionRevisionRow | undefined;
    return row === undefined ? null : decodePhaseDefinitionRevision(row);
  }

  /**
   * Creates (`expectedRevision: null`) or compare-and-set updates a phase definition and journals
   * the command as one immutable revision, atomically. Fails closed
   * (`phase.unknown-rule-id`) if any `rules.standard[]` entry is not in
   * `input.knownStandardRuleIds`. Replaying the same command ID with identical content returns the
   * revision it already wrote (`duplicate: true`).
   */
  public upsert(input: UpsertPhaseDefinitionInput): UpsertedPhaseDefinition {
    const command = PhaseDefinitionUpsertCommandV1Schema.parse(input.command);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);
    const knownRuleIds = parseKnownStandardRuleIds(input.knownStandardRuleIds);
    const draft = command.upsert.phase;
    const expectedRevision = command.upsert.expectedRevision;

    const unresolved = unknownStandardRuleIds(draft.rules.standard, knownRuleIds);
    if (unresolved.length > 0) {
      throw new PhaseDefinitionUpsertError(
        "phase.unknown-rule-id",
        `phase ${draft.phaseId} references unknown standard rule id(s): ${unresolved.join(", ")}`,
      );
    }

    const persist = this.database.transaction((): UpsertedPhaseDefinition => {
      const stored = this.findRevisionByCommandId(command.commandId);
      if (stored !== null) {
        if (JSON.stringify(stored.command) !== JSON.stringify(command)) {
          throw new PhaseDefinitionUpsertError(
            "phase.identity-conflict",
            `command ${command.commandId} is already bound to a different phase upsert`,
          );
        }
        return { phase: stored.phase, created: stored.phase.revision === 0, duplicate: true };
      }

      const headRow = this.database
        .prepare(`${PHASE_DEFINITION_SELECT} WHERE phase_id = ?`)
        .get(draft.phaseId) as PhaseDefinitionRow | undefined;
      const head = headRow === undefined ? null : decodePhaseDefinition(headRow);

      if (expectedRevision === null && head !== null) {
        throw new PhaseDefinitionUpsertError(
          "phase.already-exists",
          `phase ${draft.phaseId} already exists at revision ${String(head.revision)}`,
        );
      }
      if (expectedRevision !== null && head === null) {
        throw new PhaseDefinitionUpsertError(
          "phase.not-found",
          `phase ${draft.phaseId} does not exist`,
        );
      }
      if (head !== null && expectedRevision !== null) {
        if (head.revision !== expectedRevision) {
          throw new PhaseDefinitionUpsertError(
            "phase.revision-conflict",
            `phase ${draft.phaseId} is at revision ${String(head.revision)}, not ${String(expectedRevision)}`,
          );
        }
        if (recordedAt <= head.updatedAt) {
          failInvariant(
            `phase ${draft.phaseId} recordedAt ${recordedAt} must follow ${head.updatedAt}`,
          );
        }
      }

      const phase: PhaseDefinitionV1 = PhaseDefinitionV1Schema.parse({
        schemaVersion: 1,
        ...draft,
        revision: head === null ? 0 : head.revision + 1,
        createdAt: head === null ? recordedAt : head.createdAt,
        updatedAt: recordedAt,
      });
      const payloadJson = JSON.stringify(phase);

      if (head === null) {
        this.database
          .prepare(
            `INSERT INTO phase_definitions(
               phase_id, schema_version, name, purpose, mode, revision, created_at, updated_at, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            phase.phaseId,
            phase.schemaVersion,
            phase.name,
            phase.purpose,
            phase.mode,
            phase.revision,
            phase.createdAt,
            phase.updatedAt,
            payloadJson,
          );
      } else {
        const result = this.database
          .prepare(
            `UPDATE phase_definitions SET
               name = ?, purpose = ?, mode = ?, revision = ?, updated_at = ?, payload_json = ?
             WHERE phase_id = ? AND revision = ?`,
          )
          .run(
            phase.name,
            phase.purpose,
            phase.mode,
            phase.revision,
            phase.updatedAt,
            payloadJson,
            phase.phaseId,
            head.revision,
          );
        if (result.changes !== 1) {
          throw new Error(`Phase definition revision conflict: ${phase.phaseId}`);
        }
      }
      this.database
        .prepare(
          `INSERT INTO phase_definition_revisions(
             phase_id, revision, command_id, origin, issued_at, expected_revision,
             recorded_at, command_json, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          phase.phaseId,
          phase.revision,
          command.commandId,
          command.origin,
          command.issuedAt,
          expectedRevision,
          phase.updatedAt,
          JSON.stringify(command),
          payloadJson,
        );
      return { phase, created: head === null, duplicate: false };
    });
    return persist.immediate();
  }
}

const PHASE_PRESET_SELECT = `SELECT
  preset_id, name, revision, created_at, updated_at, payload_json
FROM phase_presets`;

const PHASE_PRESET_REVISION_SELECT = `SELECT
  preset_id, revision, command_id, origin, issued_at, expected_revision,
  recorded_at, command_json, payload_json
FROM phase_preset_revisions`;

/** Durable, revisioned ordered bundles of phase definitions. See the module doc comment. */
export class PhasePresetRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(presetIdInput: unknown): PhasePresetV1 | null {
    const presetId = PhasePresetIdSchema.parse(presetIdInput);
    const row = this.database
      .prepare(`${PHASE_PRESET_SELECT} WHERE preset_id = ?`)
      .get(presetId) as PhasePresetRow | undefined;
    return row === undefined ? null : decodePhasePreset(row);
  }

  /** Every preset's head revision, ordered by `presetId`. */
  public listAll(): readonly PhasePresetV1[] {
    const rows = this.database
      .prepare(`${PHASE_PRESET_SELECT} ORDER BY preset_id`)
      .all() as readonly PhasePresetRow[];
    return rows.map(decodePhasePreset);
  }

  public findRevisionByCommandId(commandIdInput: unknown): PhasePresetRevisionRecord | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database
      .prepare(`${PHASE_PRESET_REVISION_SELECT} WHERE command_id = ?`)
      .get(commandId) as PhasePresetRevisionRow | undefined;
    return row === undefined ? null : decodePhasePresetRevision(row);
  }

  /**
   * Creates or compare-and-set updates a preset and journals the command as one immutable
   * revision, atomically. Fails closed (`preset.unknown-rule-id`) if any embedded phase's
   * `rules.standard[]` entry is not in `input.knownStandardRuleIds` — a preset embeds full phase
   * values directly, so this re-checks every phase even when each one individually passed
   * `phase.upsert` at an earlier time the rule catalog could since have changed.
   */
  public upsert(input: UpsertPhasePresetInput): UpsertedPhasePreset {
    const command = PhasePresetUpsertCommandV1Schema.parse(input.command);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);
    const knownRuleIds = parseKnownStandardRuleIds(input.knownStandardRuleIds);
    const draft = command.upsert.preset;
    const expectedRevision = command.upsert.expectedRevision;

    for (const phase of draft.phases) {
      const unresolved = unknownStandardRuleIds(phase.rules.standard, knownRuleIds);
      if (unresolved.length > 0) {
        throw new PhasePresetUpsertError(
          "preset.unknown-rule-id",
          `preset ${draft.presetId} phase ${phase.phaseId} references unknown standard rule id(s): ${unresolved.join(", ")}`,
        );
      }
    }

    const persist = this.database.transaction((): UpsertedPhasePreset => {
      const stored = this.findRevisionByCommandId(command.commandId);
      if (stored !== null) {
        if (JSON.stringify(stored.command) !== JSON.stringify(command)) {
          throw new PhasePresetUpsertError(
            "preset.identity-conflict",
            `command ${command.commandId} is already bound to a different preset upsert`,
          );
        }
        return { preset: stored.preset, created: stored.preset.revision === 0, duplicate: true };
      }

      const headRow = this.database
        .prepare(`${PHASE_PRESET_SELECT} WHERE preset_id = ?`)
        .get(draft.presetId) as PhasePresetRow | undefined;
      const head = headRow === undefined ? null : decodePhasePreset(headRow);

      if (expectedRevision === null && head !== null) {
        throw new PhasePresetUpsertError(
          "preset.already-exists",
          `preset ${draft.presetId} already exists at revision ${String(head.revision)}`,
        );
      }
      if (expectedRevision !== null && head === null) {
        throw new PhasePresetUpsertError(
          "preset.not-found",
          `preset ${draft.presetId} does not exist`,
        );
      }
      if (head !== null && expectedRevision !== null) {
        if (head.revision !== expectedRevision) {
          throw new PhasePresetUpsertError(
            "preset.revision-conflict",
            `preset ${draft.presetId} is at revision ${String(head.revision)}, not ${String(expectedRevision)}`,
          );
        }
        if (recordedAt <= head.updatedAt) {
          failInvariant(
            `preset ${draft.presetId} recordedAt ${recordedAt} must follow ${head.updatedAt}`,
          );
        }
      }

      const preset: PhasePresetV1 = PhasePresetV1Schema.parse({
        schemaVersion: 1,
        ...draft,
        revision: head === null ? 0 : head.revision + 1,
        createdAt: head === null ? recordedAt : head.createdAt,
        updatedAt: recordedAt,
      });
      const payloadJson = JSON.stringify(preset);

      if (head === null) {
        this.database
          .prepare(
            `INSERT INTO phase_presets(
               preset_id, schema_version, name, revision, created_at, updated_at, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            preset.presetId,
            preset.schemaVersion,
            preset.name,
            preset.revision,
            preset.createdAt,
            preset.updatedAt,
            payloadJson,
          );
      } else {
        const result = this.database
          .prepare(
            `UPDATE phase_presets SET
               name = ?, revision = ?, updated_at = ?, payload_json = ?
             WHERE preset_id = ? AND revision = ?`,
          )
          .run(
            preset.name,
            preset.revision,
            preset.updatedAt,
            payloadJson,
            preset.presetId,
            head.revision,
          );
        if (result.changes !== 1) {
          throw new Error(`Phase preset revision conflict: ${preset.presetId}`);
        }
      }
      this.database
        .prepare(
          `INSERT INTO phase_preset_revisions(
             preset_id, revision, command_id, origin, issued_at, expected_revision,
             recorded_at, command_json, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          preset.presetId,
          preset.revision,
          command.commandId,
          command.origin,
          command.issuedAt,
          expectedRevision,
          preset.updatedAt,
          JSON.stringify(command),
          payloadJson,
        );
      return { preset, created: head === null, duplicate: false };
    });
    return persist.immediate();
  }
}
