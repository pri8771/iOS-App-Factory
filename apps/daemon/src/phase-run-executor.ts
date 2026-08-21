import { createRequire } from "node:module";

import {
  PhaseDefinitionV1Schema,
  PhasePersonaSchema,
  PhaseProviderSchema,
  RoomPersonaSchema,
  RoomProviderSchema,
  type IsoInstant,
  type PhaseDefinitionV1,
  type PhaseId,
  type PhaseParticipantV1,
  type PhaseRunGraderVerdictV1,
  type PhaseRunId,
  type PhaseRunOutcomeV1,
  type PhaseRunTokenUsageV1,
  type ProjectId,
  type RoomId,
  type RoomPersona,
  type RoomProvider,
} from "@app-factory/contracts";
import type {
  ParticipantAdapter,
  ParticipantContextMessage,
  ParticipantContributionResult,
  ParticipantUsage,
} from "@app-factory/studio-room-adapters";

import type { PhaseOutputFileV1 } from "./phase-run-types.js";

/**
 * Phase Runner mode execution: turns a `PhaseDefinitionV1` plus a bounded set of ports into a
 * `PhaseRunExecutionOutcomeV1` — the terminal (or awaiting-human) shape `phase-run-command-
 * runtime.ts` persists through the kernel's `PhaseRunRepository.transitionState`. This module owns
 * no durable state itself and issues no I/O beyond calling the injected ports, so it is exercised
 * directly in tests with fake `ParticipantAdapter`s over an in-memory transcript — the same "real
 * moderator + fake adapters" shape `packages/studio-room-adapters/test/moderator-integration.test.ts`
 * already established for the room system, minus the persistent-room machinery (see below for why).
 *
 * SOLO reuses `@app-factory/studio-room-adapters`'s `ParticipantAdapter` directly: a `PhaseParticipantV1`
 * is always `readOnly: true` (schema-enforced), which is exactly the containment `ParticipantAdapter`
 * already gives a room participant (fresh scratch working directory, no filesystem write surface,
 * network only when explicitly enabled) — reusing it here means Phase Runner does not reinvent
 * `codex-independent-reviewer.ts`'s bespoke containment machinery for a second, structurally
 * identical purpose.
 *
 * PANEL/DEBATE do **not** use `@app-factory/studio-rooms`'s `RoomModerator`/`RoomModeratorLoop`: that
 * subsystem is built for a long-lived, reactively-driven human chat room (dormancy, orphan sweep,
 * daily token budgets across restarts) with no "run N bounded rounds and return" primitive and no
 * "coordinator" concept at all (`cast.coordinator` is a schema field nothing in that package reads).
 * Building a bounded round loop directly here — a purpose-built, deterministic, in-memory transcript,
 * not a persisted `RoomV1` — is a closer fit and keeps the round budget genuinely bounded, per the
 * "keep it minimal, debate rarely mattered" scoping. PANEL gates speaking to one participant per
 * round on a deterministic round-robin cooldown (the same "who hasn't spoken most recently" shape
 * `RoomModerator`'s real cooldown filter uses, minus a live urgency scorer — a real urgency-scoring
 * port can replace `selectPanelSpeaker` later without changing the surrounding loop). DEBATE instead
 * round-barriers every participant each round, PASS allowed, mirroring the room contribution
 * protocol's own `kind: "pass"` primitive.
 *
 * CHAT is the one mode that *does* use the real, persistent `@app-factory/studio-rooms` system (via
 * the injected `PhaseRoomPort`): the phase declares a durable human conversation, not a bounded
 * agent round, so it belongs in the same room store every other Studio room lives in.
 */

const MAX_PHASE_ROUND_MESSAGES_V1 = 30;
const MAX_PHASE_ROUNDS_V1 = 6;
const DEFAULT_MAX_OUTPUT_TOKENS_V1 = 4_000;

export class PhaseRunExecutionError extends Error {
  public constructor(
    public readonly code:
      | "participant-unconfigured"
      | "participant-error"
      | "output-parse-failed"
      | "output-schema-invalid"
      | "grader-parse-failed",
    message: string,
  ) {
    super(message);
    this.name = "PhaseRunExecutionError";
  }
}

/** Resolves a real (or fake, in tests) adapter for a phase cast provider; `null` if unconfigured. */
export type PhaseParticipantsPort = Readonly<{
  resolve(
    provider: PhaseDefinitionV1["cast"]["participants"][number]["provider"],
  ): ParticipantAdapter | null;
}>;

export type PhaseInputDocumentV1 = Readonly<{ path: string; content: string }>;

/** Read-only project content Phase Runner may fold into a participant's instruction as context. */
export type PhaseInputsReaderPort = Readonly<{
  /** Every text file under `docs/` in the project's enrolled mirror, bounded by the caller. */
  readDocsTree(projectId: ProjectId): readonly PhaseInputDocumentV1[];
  /** One repo-relative file's raw text, or `null` if absent — used to resolve an output's `schema`. */
  readFile(projectId: ProjectId, path: string): string | null;
}>;

export type PhaseRoomParticipantV1 = Readonly<{
  persona: RoomPersona;
  provider: RoomProvider;
  displayName: string;
}>;

/** Creates the persistent project room a `chat`-mode run is bound to. */
export type PhaseRoomPort = Readonly<{
  createPhaseRoom(
    input: Readonly<{
      roomId: RoomId;
      projectId: ProjectId;
      title: string;
      purpose: string;
      participants: readonly PhaseRoomParticipantV1[];
      now: IsoInstant;
    }>,
  ): void;
}>;

export type PhaseRunExecutionPorts = Readonly<{
  participants: PhaseParticipantsPort;
  inputs: PhaseInputsReaderPort;
  rooms: PhaseRoomPort;
  /** `ruleId -> statement`, resolved from the compiled policy source (the daemon's own port). */
  standardRuleStatements: ReadonlyMap<string, string>;
  /** Mints the persistent room's ID for a `chat`-mode run (daemon runtime ID factory). */
  mintRoomId(): RoomId;
  signal: AbortSignal;
}>;

/**
 * One dispatched contribution's provider + honest usage (Architecture decision 6/8, Wave 7): the
 * daemon-internal counterpart of `PhaseDefinitionV1["cast"].participants[].provider`, resolved to a
 * real `RoomProvider` at dispatch time. Never a wire shape -- `phase-run-command-runtime.ts` folds
 * these into `token_usage` rows (`source: "phase"`), resolving `providerFamily`/`model` from the
 * SAME participants config `ports.participants` was built from. Recorded for every contribution the
 * executor actually dispatched (`kind: "message"` or `"pass"`), even ones from a run that ultimately
 * failed -- an `error` contribution carries no usage at all (`ParticipantContributionResult`'s error
 * variant has no `usage` field) so it is never represented here.
 */
export type PhaseRunContributionUsageV1 = Readonly<{
  provider: RoomProvider;
  usage: ParticipantUsage;
}>;

export type PhaseRunExecutionOutcomeV1 =
  | Readonly<{ kind: "awaiting-human"; roomId: RoomId | null }>
  | Readonly<{
      kind: "succeeded";
      files: readonly PhaseOutputFileV1[];
      graderVerdict: PhaseRunGraderVerdictV1 | null;
      tokenUsage: PhaseRunTokenUsageV1;
      contributions: readonly PhaseRunContributionUsageV1[];
    }>
  | Readonly<{
      kind: "failed";
      outcome: Extract<PhaseRunOutcomeV1, { kind: "failed" }>;
      /** Populated only when outputs were produced before the failure (e.g. a grader rejection). */
      files: readonly PhaseOutputFileV1[];
      graderVerdict: PhaseRunGraderVerdictV1 | null;
      tokenUsage: PhaseRunTokenUsageV1;
      contributions: readonly PhaseRunContributionUsageV1[];
    }>;

// ---------------------------------------------------------------------------
// Instruction rendering
// ---------------------------------------------------------------------------

const DECLARED_BUT_UNFETCHED_INPUTS_V1: ReadonlySet<string> = new Set([
  "source-readonly",
  "evidence",
  "issues",
  "web",
]);

function renderInputsSection(
  phase: PhaseDefinitionV1,
  projectId: ProjectId,
  inputs: readonly string[],
  inputsPort: PhaseInputsReaderPort,
): string {
  const lines: string[] = [];
  if (inputs.includes("docs")) {
    const documents = inputsPort.readDocsTree(projectId);
    if (documents.length === 0) {
      lines.push("docs/: (empty — no documents in the project's docs/ tree yet)");
    } else {
      lines.push("docs/ (read-only):");
      for (const document of documents) {
        lines.push(`--- ${document.path} ---`);
        lines.push(document.content);
      }
    }
  }
  for (const kind of inputs) {
    if (DECLARED_BUT_UNFETCHED_INPUTS_V1.has(kind)) {
      lines.push(
        `${kind}: declared as an input but not fetched by this Phase Runner build; do not assume any ${kind} content beyond what is stated above.`,
      );
    }
  }
  return lines.join("\n");
}

function renderRulesSection(
  phase: PhaseDefinitionV1,
  standardRuleStatements: ReadonlyMap<string, string>,
): string {
  const lines: string[] = ["ENFORCED constraints (you must follow every one of these):"];
  if (phase.rules.standard.length === 0) {
    lines.push("(none declared)");
  } else {
    for (const ruleId of phase.rules.standard) {
      const statement = standardRuleStatements.get(ruleId);
      lines.push(
        `- [${ruleId}] ${statement ?? "(statement unavailable; treat the rule ID as binding)"}`,
      );
    }
  }
  if (phase.topicScope !== null || phase.rules.yours.length > 0) {
    lines.push("", "Guidance (not machine-enforced, but follow it):");
    // `topicScope` (Architecture decision 8) is prompted alongside `rules.yours`, never enforced:
    // it renders first so it reads as the scope statement it is, ahead of free-text operator rules.
    if (phase.topicScope !== null) lines.push(`- Topic scope: ${phase.topicScope}`);
    for (const rule of phase.rules.yours) lines.push(`- ${rule}`);
  }
  if (phase.rules.requiredOutput.length > 0) {
    lines.push("", "Your output must state:");
    for (const statement of phase.rules.requiredOutput) lines.push(`- ${statement}`);
  }
  return lines.join("\n");
}

const FILE_BLOCK_START = "===FILE:";
const FILE_BLOCK_END = "===END===";

function renderOutputsSection(phase: PhaseDefinitionV1): string {
  if (phase.outputs.length === 0) return "";
  if (phase.outputs.length === 1) {
    return `Produce the complete content for ${phase.outputs[0]?.path} as your entire response — no preamble, no code fences, just the file's content.`;
  }
  const lines = [
    "Produce every one of these files, each wrapped exactly like this (no other text outside the blocks):",
    `${FILE_BLOCK_START} <path>`,
    "<content>",
    FILE_BLOCK_END,
    "",
    "Required paths, in any order:",
  ];
  for (const output of phase.outputs) lines.push(`- ${output.path}`);
  return lines.join("\n");
}

/** `phase.prompt` (Architecture decision 8), PREPENDED as an "Operator briefing" section -- never a
 *  replacement for the synthesized instruction below it. `null` (the legacy/default) renders nothing. */
function renderOperatorBriefing(phase: PhaseDefinitionV1): string {
  if (phase.prompt === null) return "";
  return ["Operator briefing:", phase.prompt].join("\n");
}

export function buildPhaseInstructionV1(
  phase: PhaseDefinitionV1,
  projectId: ProjectId,
  inputs: readonly string[],
  ports: Pick<PhaseRunExecutionPorts, "inputs" | "standardRuleStatements">,
): string {
  return [
    renderOperatorBriefing(phase),
    `Phase: ${phase.name}`,
    `Purpose: ${phase.purpose}`,
    "",
    renderRulesSection(phase, ports.standardRuleStatements),
    "",
    renderOutputsSection(phase),
    "",
    "Inputs:",
    renderInputsSection(phase, projectId, inputs, ports.inputs),
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

function parseMultiFileResponse(
  text: string,
  declaredPaths: readonly string[],
): readonly PhaseOutputFileV1[] {
  const files: PhaseOutputFileV1[] = [];
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line !== undefined && line.startsWith(FILE_BLOCK_START)) {
      const path = line.slice(FILE_BLOCK_START.length).trim();
      const content: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== FILE_BLOCK_END) {
        content.push(lines[index] ?? "");
        index += 1;
      }
      files.push({ path, content: content.join("\n") });
    }
    index += 1;
  }
  const foundPaths = new Set(files.map((file) => file.path));
  const missing = declaredPaths.filter((path) => !foundPaths.has(path));
  const unexpected = [...foundPaths].filter((path) => !declaredPaths.includes(path));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new PhaseRunExecutionError(
      "output-parse-failed",
      `The response did not produce exactly the declared outputs (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}).`,
    );
  }
  return files;
}

function parseOutputResponse(phase: PhaseDefinitionV1, text: string): readonly PhaseOutputFileV1[] {
  if (phase.outputs.length === 0) return [];
  if (phase.outputs.length === 1) {
    const path = phase.outputs[0]?.path;
    if (path === undefined) return [];
    return [{ path, content: text }];
  }
  return parseMultiFileResponse(
    text,
    phase.outputs.map((output) => output.path),
  );
}

// `ajv`/`ajv-formats` ship CJS builds whose declared `export default` does not resolve cleanly
// through this repo's strict NodeNext module resolution (a well-known ajv+TypeScript friction
// point). `createRequire` sidesteps it entirely rather than fighting module-resolution edge cases;
// the two local types below cover only what this file actually calls.
type AjvValidationErrors = readonly Readonly<Record<string, unknown>>[] | null | undefined;
type AjvValidateFunction = ((data: unknown) => boolean) & { errors?: AjvValidationErrors };
type AjvInstance = Readonly<{
  compile(schema: unknown): AjvValidateFunction;
  errorsText(errors: AjvValidationErrors, options?: Readonly<{ separator?: string }>): string;
}>;
type Ajv2020Constructor = new (
  options: Readonly<{ allErrors: boolean; strict: boolean }>,
) => AjvInstance;

const nodeRequire = createRequire(import.meta.url);
const ajv2020Module = nodeRequire("ajv/dist/2020.js") as { default?: Ajv2020Constructor };
const Ajv2020: Ajv2020Constructor =
  ajv2020Module.default ?? (ajv2020Module as unknown as Ajv2020Constructor);
const addFormatsModule = nodeRequire("ajv-formats") as {
  default?: (instance: AjvInstance) => void;
};
const addFormats: (instance: AjvInstance) => void =
  addFormatsModule.default ?? (addFormatsModule as unknown as (instance: AjvInstance) => void);

const ajv: AjvInstance = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

/**
 * Fail-closed: an output with a declared `schema` must be valid JSON that validates against it, or
 * the run fails with `output-schema-invalid` before anything is committed. The schema itself is read
 * from the project's own mirror (`inputs.readFile`), never fabricated.
 */
function validateOutputSchemasV1(
  phase: PhaseDefinitionV1,
  files: readonly PhaseOutputFileV1[],
  projectId: ProjectId,
  inputsPort: PhaseInputsReaderPort,
): void {
  for (const output of phase.outputs) {
    if (output.schema === null) continue;
    const file = files.find((candidate) => candidate.path === output.path);
    if (file === undefined) continue;
    const schemaText = inputsPort.readFile(projectId, output.schema);
    if (schemaText === null) {
      throw new PhaseRunExecutionError(
        "output-schema-invalid",
        `Output ${output.path} declares schema ${output.schema}, which does not exist in the project.`,
      );
    }
    let schemaDocument: unknown;
    let instance: unknown;
    try {
      schemaDocument = JSON.parse(schemaText);
    } catch {
      throw new PhaseRunExecutionError(
        "output-schema-invalid",
        `Output ${output.path}'s declared schema ${output.schema} is not valid JSON.`,
      );
    }
    try {
      instance = JSON.parse(file.content);
    } catch {
      throw new PhaseRunExecutionError(
        "output-schema-invalid",
        `Output ${output.path} declares a schema but is not itself valid JSON.`,
      );
    }
    const validate = ajv.compile(schemaDocument as Record<string, unknown>);
    if (!validate(instance)) {
      const detail = ajv.errorsText(validate.errors, { separator: "; " });
      throw new PhaseRunExecutionError(
        "output-schema-invalid",
        `Output ${output.path} failed schema ${output.schema}: ${detail}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Grader
// ---------------------------------------------------------------------------

function parseGraderVerdict(text: string): PhaseRunGraderVerdictV1 {
  const lines = text.split("\n").map((line) => line.trim());
  const verdictLine = lines.find((line) => line.toUpperCase().startsWith("VERDICT:"));
  const verdictRaw = verdictLine?.slice("VERDICT:".length).trim().toLowerCase();
  if (verdictRaw !== "pass" && verdictRaw !== "changes-required") {
    throw new PhaseRunExecutionError(
      "grader-parse-failed",
      'The grader response did not start a line with "VERDICT: pass" or "VERDICT: changes-required".',
    );
  }
  const findings = lines
    .filter((line) => line.toUpperCase().startsWith("FINDING:"))
    .map((line) => line.slice("FINDING:".length).trim())
    .filter((finding) => finding.length > 0)
    .slice(0, 50);
  return { verdict: verdictRaw, findings };
}

function renderGraderInstruction(
  phase: PhaseDefinitionV1,
  files: readonly PhaseOutputFileV1[],
): string {
  const lines = [
    `You are grading the outputs of phase "${phase.name}" against its acceptance checks.`,
    "Acceptance checks:",
  ];
  if (phase.rules.acceptanceChecks.length === 0) {
    lines.push("(none declared — pass unless the output is empty or clearly wrong)");
  } else {
    for (const check of phase.rules.acceptanceChecks) lines.push(`- ${check}`);
  }
  lines.push("", "Produced outputs:");
  for (const file of files) {
    lines.push(`--- ${file.path} ---`, file.content);
  }
  lines.push(
    "",
    'Respond with a line "VERDICT: pass" or "VERDICT: changes-required", followed by zero or more lines "FINDING: <text>" explaining any problems.',
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Participant plumbing
// ---------------------------------------------------------------------------

function toRoomProvider(provider: PhaseParticipantV1["provider"]): RoomProvider {
  return RoomProviderSchema.parse(PhaseProviderSchema.parse(provider));
}

function toRoomPersona(persona: PhaseParticipantV1["persona"], fallback: string): RoomPersona {
  return RoomPersonaSchema.parse(persona === null ? fallback : PhasePersonaSchema.parse(persona));
}

async function contribute(
  adapter: ParticipantAdapter,
  persona: RoomPersona,
  instruction: string,
  transcript: readonly ParticipantContextMessage[],
  ports: PhaseRunExecutionPorts,
  networkEnabled: boolean,
): Promise<ParticipantContributionResult> {
  return adapter.contribute({
    persona,
    roomCharter: instruction,
    rollingSummary: "",
    personaCharter: "You are one participant contributing to this Factory phase.",
    transcript: transcript.slice(-MAX_PHASE_ROUND_MESSAGES_V1),
    networkEnabled,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS_V1,
    signal: ports.signal,
    reportWorkerPid: () => {
      // No orphan-sweep concern here: a phase.run command handler awaits its own participant calls
      // synchronously and is not restart-resumed, unlike the long-lived room subsystem.
    },
  });
}

function requireAdapter(
  ports: PhaseRunExecutionPorts,
  participant: PhaseParticipantV1,
): ParticipantAdapter {
  const adapter = ports.participants.resolve(participant.provider);
  if (adapter === null) {
    throw new PhaseRunExecutionError(
      "participant-unconfigured",
      `No participant adapter is configured for provider ${participant.provider}.`,
    );
  }
  return adapter;
}

function requireMessage(
  result: ParticipantContributionResult,
  persona: RoomPersona,
): Readonly<{ text: string; tokensUsed: number }> {
  if (result.kind === "error") {
    throw new PhaseRunExecutionError(
      "participant-error",
      `Participant ${persona} failed: ${result.code}.`,
    );
  }
  if (result.kind === "pass") {
    throw new PhaseRunExecutionError(
      "participant-error",
      `Participant ${persona} passed when a contribution was required.`,
    );
  }
  return { text: result.text, tokensUsed: result.usage.tokensUsed };
}

function inputsFor(
  phase: PhaseDefinitionV1,
  inputsOverride: readonly string[] | null,
): readonly string[] {
  return inputsOverride ?? phase.inputs;
}

/** Records one dispatched contribution's provider + usage for the honest token ledger (Wave 7):
 *  every `message`/`pass` result carries usage; an `error` result carries none at all and is never
 *  represented here (see `PhaseRunContributionUsageV1`'s own doc comment). Mutates `contributions`
 *  in place so it stays populated even when a later step throws (a `PhaseRunExecutionError` from
 *  `requireMessage`, for instance) -- `executePhaseRunV1`'s catch blocks can still read whatever was
 *  dispatched before the failure. */
function recordContribution(
  contributions: PhaseRunContributionUsageV1[],
  adapter: ParticipantAdapter,
  result: ParticipantContributionResult,
): void {
  if (result.kind === "error") return;
  contributions.push({ provider: adapter.provider, usage: result.usage });
}

/** Sums KNOWN reported usage only (Architecture decision 6/8): a contribution whose provider
 *  reported nothing (`usage.reported === null`) contributes zero here and is never treated as a
 *  fabricated zero spend -- `tokenBudget` enforcement is honest-over-known-usage, not exact. */
function knownReportedTokens(usage: ParticipantUsage): number {
  if (usage.reported === null) return 0;
  return (usage.reported.inputTokens ?? 0) + (usage.reported.outputTokens ?? 0);
}

// ---------------------------------------------------------------------------
// SOLO
// ---------------------------------------------------------------------------

async function runSoloMode(
  phase: PhaseDefinitionV1,
  projectId: ProjectId,
  inputsOverride: readonly string[] | null,
  ports: PhaseRunExecutionPorts,
  contributions: PhaseRunContributionUsageV1[],
): Promise<Readonly<{ files: readonly PhaseOutputFileV1[]; tokensUsed: number }>> {
  const participant = phase.cast.participants[0];
  if (participant === undefined) {
    throw new PhaseRunExecutionError(
      "participant-error",
      "Solo mode requires exactly one participant.",
    );
  }
  const adapter = requireAdapter(ports, participant);
  const persona = toRoomPersona(participant.persona, "solo-participant");
  const inputs = inputsFor(phase, inputsOverride);
  const instruction = buildPhaseInstructionV1(phase, projectId, inputs, ports);
  const result = await contribute(adapter, persona, instruction, [], ports, inputs.includes("web"));
  recordContribution(contributions, adapter, result);
  const { text, tokensUsed } = requireMessage(result, persona);
  return { files: parseOutputResponse(phase, text), tokensUsed };
}

// ---------------------------------------------------------------------------
// PANEL / DEBATE
// ---------------------------------------------------------------------------

type PanelParticipant = Readonly<{
  participant: PhaseParticipantV1;
  persona: RoomPersona;
  adapter: ParticipantAdapter;
}>;

function resolvePanelCast(
  phase: PhaseDefinitionV1,
  ports: PhaseRunExecutionPorts,
): readonly PanelParticipant[] {
  return phase.cast.participants.map((participant, index) => ({
    participant,
    persona: toRoomPersona(participant.persona, `panelist-${String(index)}`),
    adapter: requireAdapter(ports, participant),
  }));
}

/** Deterministic "value-gated speaking" stand-in: whoever spoke least recently speaks this round,
 *  among participants who have not yet hit `turnCap` (Architecture decision 8's
 *  `perParticipantTurnCap`, `null` when uncapped). `null` once every participant has hit the cap --
 *  a graceful end to the round loop, exactly like exhausting `maxRounds`, never a thrown error (the
 *  earlier "cast must be non-empty" check already guards the genuinely-empty-cast case, before this
 *  is ever called). */
function selectPanelSpeaker(
  cast: readonly PanelParticipant[],
  lastSpokeAtRound: ReadonlyMap<string, number>,
  turnsSpoken: ReadonlyMap<string, number>,
  turnCap: number | null,
): PanelParticipant | null {
  const eligible =
    turnCap === null
      ? cast
      : cast.filter((entry) => (turnsSpoken.get(entry.persona) ?? 0) < turnCap);
  let selected: PanelParticipant | undefined;
  let oldestRound = Number.POSITIVE_INFINITY;
  for (const entry of eligible) {
    const round = lastSpokeAtRound.get(entry.persona) ?? -1;
    if (round < oldestRound) {
      oldestRound = round;
      selected = entry;
    }
  }
  return selected ?? null;
}

async function runRoundBasedMode(
  phase: PhaseDefinitionV1,
  projectId: ProjectId,
  inputsOverride: readonly string[] | null,
  ports: PhaseRunExecutionPorts,
  roundBarrier: boolean,
  contributions: PhaseRunContributionUsageV1[],
): Promise<Readonly<{ files: readonly PhaseOutputFileV1[]; tokensUsed: number }>> {
  const cast = resolvePanelCast(phase, ports);
  const firstCastMember = cast[0];
  if (firstCastMember === undefined) {
    throw new PhaseRunExecutionError(
      "participant-error",
      `Mode ${phase.mode} requires at least one cast participant.`,
    );
  }
  const inputs = inputsFor(phase, inputsOverride);
  const instruction = buildPhaseInstructionV1(phase, projectId, inputs, ports);
  const networkEnabled = inputs.includes("web");
  const transcript: ParticipantContextMessage[] = [{ author: "phase", body: instruction }];
  const lastSpokeAtRound = new Map<string, number>();
  const turnsSpoken = new Map<string, number>();
  let tokensUsed = 0;
  let knownTokens = 0;
  let lastSpeaker: PanelParticipant | null = null;
  // Architecture decision 8: `turnPolicy.maxRounds` overrides `MAX_PHASE_ROUNDS_V1` when set;
  // legacy phases (`turnPolicy: null`) keep the exact default, byte-identical to before this wave.
  const maxRounds = phase.turnPolicy?.maxRounds ?? MAX_PHASE_ROUNDS_V1;
  const turnCap = phase.turnPolicy?.perParticipantTurnCap ?? null;
  const tokenBudget = phase.tokenBudget?.maxTotalTokens ?? null;

  let budgetExceeded = false;
  for (let round = 0; round < maxRounds && !budgetExceeded; round += 1) {
    const speakers: readonly PanelParticipant[] = roundBarrier
      ? cast.filter((entry) => turnCap === null || (turnsSpoken.get(entry.persona) ?? 0) < turnCap)
      : (() => {
          const speaker = selectPanelSpeaker(cast, lastSpokeAtRound, turnsSpoken, turnCap);
          return speaker === null ? [] : [speaker];
        })();
    // Every eligible speaker already hit `perParticipantTurnCap` -- nothing left to say this run,
    // the same graceful stop `!anyMessage` below applies once a round produces no messages.
    if (speakers.length === 0) break;
    let anyMessage = false;
    for (const speaker of speakers) {
      const result = await contribute(
        speaker.adapter,
        speaker.persona,
        instruction,
        transcript,
        ports,
        networkEnabled,
      );
      recordContribution(contributions, speaker.adapter, result);
      if (result.kind === "error") {
        throw new PhaseRunExecutionError(
          "participant-error",
          `Participant ${speaker.persona} failed: ${result.code}.`,
        );
      }
      tokensUsed += result.usage.tokensUsed;
      knownTokens += knownReportedTokens(result.usage);
      lastSpokeAtRound.set(speaker.persona, round);
      turnsSpoken.set(speaker.persona, (turnsSpoken.get(speaker.persona) ?? 0) + 1);
      if (result.kind === "message") {
        transcript.push({ author: speaker.persona, body: result.text });
        anyMessage = true;
        lastSpeaker = speaker;
      }
      // Architecture decision 6/8: abort the round loop once KNOWN reported usage exceeds the
      // declared budget. This is honest-over-known-usage only -- a contribution whose provider
      // reported nothing (`usage.reported === null`) never counts toward `knownTokens`, so a run
      // with any unreported contribution may keep going past its true (unknowable) total spend.
      // `PhaseRunOutcomeV1`'s "succeeded" variant carries no fields to note that partial-enforcement
      // caveat on the wire (Architecture decision 8 forbids inventing a new wire field for it), so
      // this comment is the record of the limitation; the abort itself is tested only over
      // contributions with fully known usage, where enforcement is exact.
      if (tokenBudget !== null && knownTokens > tokenBudget) {
        budgetExceeded = true;
        break;
      }
    }
    if (!anyMessage) break;
  }

  const coordinator = phase.cast.coordinator;
  const synthesizer: PanelParticipant =
    coordinator === null
      ? (lastSpeaker ?? firstCastMember)
      : (cast.find(
          (entry) =>
            entry.participant.provider === coordinator.provider &&
            entry.participant.persona === coordinator.persona,
        ) ?? {
          participant: {
            provider: coordinator.provider,
            persona: coordinator.persona,
            readOnly: true,
          },
          persona: toRoomPersona(coordinator.persona, "coordinator"),
          adapter: requireAdapter(ports, {
            provider: coordinator.provider,
            persona: coordinator.persona,
            readOnly: true,
          }),
        });

  const synthesisInstruction = [
    instruction,
    "",
    "The panel discussion above is complete. Synthesize the final result now.",
  ].join("\n");
  const synthesisResult = await contribute(
    synthesizer.adapter,
    synthesizer.persona,
    synthesisInstruction,
    transcript,
    ports,
    networkEnabled,
  );
  recordContribution(contributions, synthesizer.adapter, synthesisResult);
  const { text, tokensUsed: synthesisTokens } = requireMessage(
    synthesisResult,
    synthesizer.persona,
  );
  return { files: parseOutputResponse(phase, text), tokensUsed: tokensUsed + synthesisTokens };
}

// ---------------------------------------------------------------------------
// CHAT
// ---------------------------------------------------------------------------

/**
 * `null` cast (the seed preset's `ready`/`release` checkpoints: "a pure human decision, no agent
 * seats") is a bare human gate — no chat room is created at all, since `RoomCreateSpecV1` requires
 * at least one participant and a zero-participant room would have nothing to synthesize one for.
 * A non-empty cast gets a real, persistent Studio room via the injected `PhaseRoomPort`.
 */
function runChatMode(
  phase: PhaseDefinitionV1,
  phaseId: PhaseId,
  phaseRunId: PhaseRunId,
  projectId: ProjectId,
  now: IsoInstant,
  ports: PhaseRunExecutionPorts,
): RoomId | null {
  if (phase.cast.participants.length === 0) return null;
  const roomId = ports.mintRoomId();
  ports.rooms.createPhaseRoom({
    roomId,
    projectId,
    title: `${phase.name} (${phaseId})`,
    purpose: phase.purpose,
    participants: phase.cast.participants.map((participant, index) => ({
      persona: toRoomPersona(participant.persona, `participant-${String(index)}`),
      provider: toRoomProvider(participant.provider),
      displayName: participant.persona ?? participant.provider,
    })),
    now,
  });
  return roomId;
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------

export type ExecutePhaseRunInput = Readonly<{
  phase: unknown;
  phaseId: unknown;
  phaseRunId: unknown;
  projectId: unknown;
  inputsOverride: readonly string[] | null;
  now: unknown;
}>;

export async function executePhaseRunV1(
  input: ExecutePhaseRunInput,
  ports: PhaseRunExecutionPorts,
): Promise<PhaseRunExecutionOutcomeV1> {
  const phase = PhaseDefinitionV1Schema.parse(input.phase);
  const phaseId = phase.phaseId;
  const projectId = input.projectId as ProjectId;
  const phaseRunId = input.phaseRunId as PhaseRunId;
  const now = input.now as IsoInstant;

  if (phase.mode === "chat") {
    const roomId = runChatMode(phase, phaseId, phaseRunId, projectId, now, ports);
    return { kind: "awaiting-human", roomId };
  }

  // Shared, mutated-in-place across every mode and the grader below (Wave 7): survives a thrown
  // `PhaseRunExecutionError` so a run that failed partway through still reports every contribution
  // it actually dispatched before the failure, for the honest token ledger.
  const contributions: PhaseRunContributionUsageV1[] = [];

  let executed: Readonly<{ files: readonly PhaseOutputFileV1[]; tokensUsed: number }>;
  try {
    executed =
      phase.mode === "solo"
        ? await runSoloMode(phase, projectId, input.inputsOverride, ports, contributions)
        : await runRoundBasedMode(
            phase,
            projectId,
            input.inputsOverride,
            ports,
            phase.mode === "debate",
            contributions,
          );
  } catch (error) {
    if (error instanceof PhaseRunExecutionError) {
      return {
        kind: "failed",
        outcome: { kind: "failed", code: "participant-error", summary: error.message },
        files: [],
        graderVerdict: null,
        tokenUsage: { totalTokens: 0 },
        contributions,
      };
    }
    throw error;
  }

  try {
    validateOutputSchemasV1(phase, executed.files, projectId, ports.inputs);
  } catch (error) {
    if (error instanceof PhaseRunExecutionError) {
      return {
        kind: "failed",
        outcome: { kind: "failed", code: "output-schema-invalid", summary: error.message },
        files: executed.files,
        graderVerdict: null,
        tokenUsage: { totalTokens: executed.tokensUsed },
        contributions,
      };
    }
    throw error;
  }

  let graderVerdict: PhaseRunGraderVerdictV1 | null = null;
  let graderTokens = 0;
  if (phase.cast.grader !== null) {
    const grader = phase.cast.grader;
    const adapter = requireAdapter(ports, { ...grader, readOnly: true });
    const persona = toRoomPersona(grader.persona, "grader");
    const result = await contribute(
      adapter,
      persona,
      renderGraderInstruction(phase, executed.files),
      [],
      ports,
      false,
    );
    recordContribution(contributions, adapter, result);
    let graderText: string;
    try {
      const message = requireMessage(result, persona);
      graderText = message.text;
      graderTokens = message.tokensUsed;
    } catch (error) {
      if (error instanceof PhaseRunExecutionError) {
        return {
          kind: "failed",
          outcome: { kind: "failed", code: "participant-error", summary: error.message },
          files: executed.files,
          graderVerdict: null,
          tokenUsage: { totalTokens: executed.tokensUsed },
          contributions,
        };
      }
      throw error;
    }
    try {
      graderVerdict = parseGraderVerdict(graderText);
    } catch (error) {
      if (error instanceof PhaseRunExecutionError) {
        return {
          kind: "failed",
          outcome: { kind: "failed", code: "participant-error", summary: error.message },
          files: executed.files,
          graderVerdict: null,
          tokenUsage: { totalTokens: executed.tokensUsed + graderTokens },
          contributions,
        };
      }
      throw error;
    }
    if (graderVerdict.verdict === "changes-required") {
      return {
        kind: "failed",
        outcome: {
          kind: "failed",
          code: "grader-changes-required",
          summary: graderVerdict.findings[0] ?? "The grader requested changes.",
        },
        files: executed.files,
        graderVerdict,
        tokenUsage: { totalTokens: executed.tokensUsed + graderTokens },
        contributions,
      };
    }
  }

  return {
    kind: "succeeded",
    files: executed.files,
    graderVerdict,
    tokenUsage: { totalTokens: executed.tokensUsed + graderTokens },
    contributions,
  };
}
