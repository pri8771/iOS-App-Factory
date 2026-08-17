import Foundation

// MARK: - Phase Presets (phase.ts, Studio Phase 4 — `preset.list`/`preset.upsert`/`phase.upsert`)
//
// Mirrors `packages/contracts/src/v1/phase.ts`. A `PhaseDefinition` is one editable step of work — a
// solo/panel/debate/chat collaboration among a bounded, always-read-only cast, constrained by
// machine-enforced `rules.standard[]` and prompted `rules.yours[]`, producing typed outputs written
// under `docs/`. A `PhasePreset` bundles an ordered list of phases. Nothing here executes a phase —
// that is `PhaseRun` (PhaseRun.swift).

/// `ProjectKindV1` (project.ts) — a preset's `appliesTo` scoping.
public enum ProjectKind: String, Hashable, Sendable, Codable, CaseIterable {
    case ios, web, service, library
}

public enum PhaseMode: String, Hashable, Sendable, Codable, CaseIterable {
    case solo, panel, debate, chat
}

public enum PhaseInputKind: String, Hashable, Sendable, Codable, CaseIterable {
    case docs
    case sourceReadonly = "source-readonly"
    case evidence, issues, web
}

/// One agent seat in a phase's cast. Always read-only: a Phase Preset is a planning/review surface
/// over `source-readonly` inputs, never a source-code writer. `readOnly` is always `true` on the
/// wire (`z.literal(true)`) but kept as a real stored field rather than a computed constant so a
/// round trip is byte-identical.
public struct PhaseParticipant: Hashable, Sendable, Codable {
    public var provider: PhaseProvider
    public var persona: PhasePersona?
    public var readOnly: Bool

    public init(provider: PhaseProvider, persona: PhasePersona?, readOnly: Bool = true) {
        self.provider = provider
        self.persona = persona
        self.readOnly = readOnly
    }

    private enum CodingKeys: String, CodingKey { case provider, persona, readOnly }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(provider, forKey: .provider)
        try c.encode(persona, forKey: .persona)
        try c.encode(true, forKey: .readOnly)
    }
}

/// Identifies a cast member by the same `(provider, persona)` pair a participant carries.
public struct PhaseRoleRef: Hashable, Sendable, Codable {
    public var provider: PhaseProvider
    public var persona: PhasePersona?

    public init(provider: PhaseProvider, persona: PhasePersona?) {
        self.provider = provider
        self.persona = persona
    }

    private enum CodingKeys: String, CodingKey { case provider, persona }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(provider, forKey: .provider)
        try c.encode(persona, forKey: .persona)
    }
}

public struct PhaseCast: Hashable, Sendable, Codable {
    public var participants: [PhaseParticipant]
    public var coordinator: PhaseRoleRef?
    public var grader: PhaseRoleRef?

    public init(participants: [PhaseParticipant], coordinator: PhaseRoleRef?, grader: PhaseRoleRef?) {
        self.participants = participants
        self.coordinator = coordinator
        self.grader = grader
    }

    private enum CodingKeys: String, CodingKey { case participants, coordinator, grader }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(participants, forKey: .participants)
        try c.encode(coordinator, forKey: .coordinator)
        try c.encode(grader, forKey: .grader)
    }

    /// True when `grader` names one of `participants` by `(provider, persona)` — the daemon rejects
    /// this shape too, but the editor checks it live so the UI never lets a Save round-trip fail.
    public var graderCollidesWithParticipant: Bool {
        guard let grader else { return false }
        return participants.contains { $0.provider == grader.provider && $0.persona == grader.persona }
    }
}

/// `ruleId`s in `standard[]` reference the compiled policy source, machine-enforced; `yours[]` is
/// free-text, only ever prompted to the cast, never enforced.
public struct PhaseRules: Hashable, Sendable, Codable {
    public var standard: [String]
    public var yours: [String]
    public var requiredOutput: [String]
    public var acceptanceChecks: [String]

    public init(standard: [String], yours: [String], requiredOutput: [String], acceptanceChecks: [String]) {
        self.standard = standard
        self.yours = yours
        self.requiredOutput = requiredOutput
        self.acceptanceChecks = acceptanceChecks
    }
}

/// A typed output artifact this phase writes. `path` is always repo-relative under `docs/`.
/// `schema` is repo-relative to the JSON Schema this output must validate against, when one
/// applies — a plain bounded string on the wire (no path-shape refinement).
public struct PhaseOutput: Hashable, Sendable, Codable {
    public var path: PhaseOutputPath
    public var schema: String?

    public init(path: PhaseOutputPath, schema: String?) {
        self.path = path
        self.schema = schema
    }

    private enum CodingKeys: String, CodingKey { case path, schema }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(path, forKey: .path)
        try c.encode(schema, forKey: .schema)
    }
}

public struct PhaseBudget: Hashable, Sendable, Codable {
    public var estimateMinutes: Int?
    public var timeoutSeconds: Int

    public init(estimateMinutes: Int?, timeoutSeconds: Int) {
        self.estimateMinutes = estimateMinutes
        self.timeoutSeconds = timeoutSeconds
    }

    private enum CodingKeys: String, CodingKey { case estimateMinutes, timeoutSeconds }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(estimateMinutes, forKey: .estimateMinutes)
        try c.encode(timeoutSeconds, forKey: .timeoutSeconds)
    }
}

/// The editable content of a phase, independent of its revision history — what `phase.upsert` sends
/// and what a `PhaseDefinition`'s durable record embeds verbatim.
public struct PhaseDefinitionDraft: Hashable, Sendable, Codable {
    public var phaseId: PhaseId
    public var name: String
    public var purpose: String
    public var mode: PhaseMode
    public var cast: PhaseCast
    public var inputs: [PhaseInputKind]
    public var rules: PhaseRules
    public var outputs: [PhaseOutput]
    /// Typed lifecycle gates (`TypedGateName`) this phase's completion is evidence for, if any.
    public var gates: [TypedGateName]
    public var budget: PhaseBudget

    public init(phaseId: PhaseId, name: String, purpose: String, mode: PhaseMode, cast: PhaseCast,
                inputs: [PhaseInputKind], rules: PhaseRules, outputs: [PhaseOutput], gates: [TypedGateName],
                budget: PhaseBudget) {
        self.phaseId = phaseId
        self.name = name
        self.purpose = purpose
        self.mode = mode
        self.cast = cast
        self.inputs = inputs
        self.rules = rules
        self.outputs = outputs
        self.gates = gates
        self.budget = budget
    }
}

/// The durable, revisioned phase definition. `revision` starts at 0 on creation and advances by
/// exactly one per accepted upsert.
public struct PhaseDefinition: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var phaseId: PhaseId
    public var name: String
    public var purpose: String
    public var mode: PhaseMode
    public var cast: PhaseCast
    public var inputs: [PhaseInputKind]
    public var rules: PhaseRules
    public var outputs: [PhaseOutput]
    public var gates: [TypedGateName]
    public var budget: PhaseBudget
    public var revision: Int
    public var createdAt: IsoInstant
    public var updatedAt: IsoInstant

    public var id: PhaseId { phaseId }

    public var draft: PhaseDefinitionDraft {
        PhaseDefinitionDraft(phaseId: phaseId, name: name, purpose: purpose, mode: mode, cast: cast, inputs: inputs,
                             rules: rules, outputs: outputs, gates: gates, budget: budget)
    }

    public init(phaseId: PhaseId, name: String, purpose: String, mode: PhaseMode, cast: PhaseCast,
                inputs: [PhaseInputKind], rules: PhaseRules, outputs: [PhaseOutput], gates: [TypedGateName],
                budget: PhaseBudget, revision: Int, createdAt: IsoInstant, updatedAt: IsoInstant) {
        self.phaseId = phaseId
        self.name = name
        self.purpose = purpose
        self.mode = mode
        self.cast = cast
        self.inputs = inputs
        self.rules = rules
        self.outputs = outputs
        self.gates = gates
        self.budget = budget
        self.revision = revision
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    /// A concise cast summary for the presets list — e.g. "1 model", "3 models · panel", "◆ gate · you".
    public var castSummary: String {
        if !gates.isEmpty, cast.participants.isEmpty { return "◆ gate · you" }
        let count = cast.participants.count
        let noun = count == 1 ? "model" : "models"
        if mode == .solo { return "\(count) \(noun)" }
        return "\(count) \(noun) · \(mode.rawValue)"
    }
}

/// Create-or-update intent — the `phase.upsert` payload. `expectedRevision: nil` creates the phase
/// (fails if it already exists); a number is compare-and-set.
public struct PhaseDefinitionUpsert: Hashable, Sendable, Codable {
    public var phase: PhaseDefinitionDraft
    public var expectedRevision: Int?

    public init(phase: PhaseDefinitionDraft, expectedRevision: Int?) {
        self.phase = phase
        self.expectedRevision = expectedRevision
    }

    private enum CodingKeys: String, CodingKey { case phase, expectedRevision }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(phase, forKey: .phase)
        try c.encode(expectedRevision, forKey: .expectedRevision)
    }
}

public struct PhasePresetDraft: Hashable, Sendable, Codable {
    public var presetId: PhasePresetId
    public var name: String
    /// Ordered; the sequence a Studio operator runs the preset's phases in.
    public var phases: [PhaseDefinition]
    /// `nil` applies to every project kind; otherwise the preset is scoped to the listed kinds.
    public var appliesTo: [ProjectKind]?

    public init(presetId: PhasePresetId, name: String, phases: [PhaseDefinition], appliesTo: [ProjectKind]?) {
        self.presetId = presetId
        self.name = name
        self.phases = phases
        self.appliesTo = appliesTo
    }

    private enum CodingKeys: String, CodingKey { case presetId, name, phases, appliesTo }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(presetId, forKey: .presetId)
        try c.encode(name, forKey: .name)
        try c.encode(phases, forKey: .phases)
        try c.encode(appliesTo, forKey: .appliesTo)
    }
}

/// The durable, revisioned phase preset. Mirrors `PhaseDefinition`'s draft/durable split.
public struct PhasePreset: Hashable, Sendable, Codable, Identifiable {
    public var schemaVersion: SchemaVersion1 = .init()
    public var presetId: PhasePresetId
    public var name: String
    public var phases: [PhaseDefinition]
    public var appliesTo: [ProjectKind]?
    public var revision: Int
    public var createdAt: IsoInstant
    public var updatedAt: IsoInstant

    public var id: PhasePresetId { presetId }

    public var draft: PhasePresetDraft {
        PhasePresetDraft(presetId: presetId, name: name, phases: phases, appliesTo: appliesTo)
    }

    public init(presetId: PhasePresetId, name: String, phases: [PhaseDefinition], appliesTo: [ProjectKind]?,
                revision: Int, createdAt: IsoInstant, updatedAt: IsoInstant) {
        self.presetId = presetId
        self.name = name
        self.phases = phases
        self.appliesTo = appliesTo
        self.revision = revision
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, presetId, name, phases, appliesTo, revision, createdAt, updatedAt
    }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(presetId, forKey: .presetId)
        try c.encode(name, forKey: .name)
        try c.encode(phases, forKey: .phases)
        try c.encode(appliesTo, forKey: .appliesTo)
        try c.encode(revision, forKey: .revision)
        try c.encode(createdAt, forKey: .createdAt)
        try c.encode(updatedAt, forKey: .updatedAt)
    }
}

/// Create-or-update intent — the `preset.upsert` payload.
public struct PhasePresetUpsert: Hashable, Sendable, Codable {
    public var preset: PhasePresetDraft
    public var expectedRevision: Int?

    public init(preset: PhasePresetDraft, expectedRevision: Int?) {
        self.preset = preset
        self.expectedRevision = expectedRevision
    }

    private enum CodingKeys: String, CodingKey { case preset, expectedRevision }

    public func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(preset, forKey: .preset)
        try c.encode(expectedRevision, forKey: .expectedRevision)
    }
}

// MARK: Command results

public struct PresetListResult: Hashable, Sendable, Codable {
    public var presets: [PhasePreset]
    public init(presets: [PhasePreset]) { self.presets = presets }
}

public struct PresetUpsertResult: Hashable, Sendable, Codable {
    public var preset: PhasePreset
    public var created: Bool
    public init(preset: PhasePreset, created: Bool) {
        self.preset = preset
        self.created = created
    }
}

public struct PhaseUpsertResult: Hashable, Sendable, Codable {
    public var phase: PhaseDefinition
    public var created: Bool
    public init(phase: PhaseDefinition, created: Bool) {
        self.phase = phase
        self.created = created
    }
}
