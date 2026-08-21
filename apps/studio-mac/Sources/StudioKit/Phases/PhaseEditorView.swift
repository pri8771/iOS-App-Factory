import SwiftUI

// MARK: - PhaseEditorView
//
// The center column of the PHASES tab: name/purpose, mode, cast (participants + coordinator + grader
// — enforced visually that grader != participants; the daemon enforces it too), inputs, rules (two
// visibly distinct kinds: standard = machine-enforced, yours = prompted-only), outputs, gates, budget.
// Save calls `phase.upsert` then `preset.upsert` (`PhasesModel.savePhase`). "Run on <project>" opens a
// project picker, then `phase.run`; the run-status strip below reflects the resulting `PhaseRun` state
// live, with gold Approve/Reject when it is `awaiting-human`.

public struct PhaseEditorDraft: Equatable {
    public var name: String
    public var purpose: String
    public var mode: PhaseMode
    public var participants: [PhaseParticipantDraft]
    public var coordinator: PhaseParticipantDraft?
    public var grader: PhaseParticipantDraft?
    public var inputs: Set<PhaseInputKind>
    public var standardRules: [String]
    public var yourRules: [String]
    public var requiredOutput: [String]
    public var acceptanceChecks: [String]
    public var outputs: [PhaseOutputDraft]
    public var gates: Set<TypedGateName>
    public var estimateMinutes: Int?
    public var timeoutSeconds: Int
    /// An operator briefing PREPENDED to the synthesized instruction — empty string means "unset"
    /// (`nil` on the wire), same convention `PhaseOutputDraft.schema` already uses.
    public var prompt: String
    public var topicScope: String
    /// `nil` = no custom turn policy (the daemon's own default of 6 rounds applies) — the stepper
    /// shows "default (6)" rather than inventing a number. Setting this is what makes
    /// `perParticipantTurnCap` meaningful; the wire's `turnPolicy` is one object requiring
    /// `maxRounds`, so a cap can never be sent while this is `nil`.
    public var maxRounds: Int?
    public var perParticipantTurnCap: Int?
    /// `nil` = no token cap for this phase's run.
    public var tokenBudgetMaxTotalTokens: Int?

    public init(from phase: PhaseDefinition) {
        name = phase.name
        purpose = phase.purpose
        mode = phase.mode
        participants = phase.cast.participants.map(PhaseParticipantDraft.init)
        coordinator = phase.cast.coordinator.map(PhaseParticipantDraft.init)
        grader = phase.cast.grader.map(PhaseParticipantDraft.init)
        inputs = Set(phase.inputs)
        standardRules = phase.rules.standard
        yourRules = phase.rules.yours
        requiredOutput = phase.rules.requiredOutput
        acceptanceChecks = phase.rules.acceptanceChecks
        outputs = phase.outputs.map(PhaseOutputDraft.init)
        gates = Set(phase.gates)
        estimateMinutes = phase.budget.estimateMinutes
        timeoutSeconds = phase.budget.timeoutSeconds
        prompt = phase.prompt ?? ""
        topicScope = phase.topicScope ?? ""
        maxRounds = phase.turnPolicy?.maxRounds
        perParticipantTurnCap = phase.turnPolicy?.perParticipantTurnCap
        tokenBudgetMaxTotalTokens = phase.tokenBudget?.maxTotalTokens
    }

    /// True when `grader` names one of `participants` by `(provider, persona)` — checked live so the
    /// editor never lets a Save round-trip fail on this rule alone.
    public var graderCollidesWithParticipant: Bool {
        guard let grader else { return false }
        return participants.contains { $0.provider == grader.provider && $0.persona == grader.persona }
    }

    public var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && !purpose.trimmingCharacters(in: .whitespaces).isEmpty
            && !graderCollidesWithParticipant
            && (mode != .solo || participants.count == 1)
            && participants.allSatisfy { $0.isValid }
            && outputs.allSatisfy { $0.isValid }
            && prompt.count <= maxPhasePromptLength
            && topicScope.count <= maxPhaseTopicScopeLength
    }

    /// Builds the wire draft, or `nil` if any free-text field fails the branded pattern (already
    /// prevented in the UI by `isValid`/per-row validity, but Save re-checks before sending).
    public func wireDraft(phaseId: PhaseId) -> PhaseDefinitionDraft? {
        guard let cast = wireCast() else { return nil }
        let wireOutputs = outputs.compactMap { $0.wireValue() }
        guard wireOutputs.count == outputs.count else { return nil }
        let wireTurnPolicy = maxRounds.map { PhaseTurnPolicy(maxRounds: $0, perParticipantTurnCap: perParticipantTurnCap) }
        let wireTokenBudget = tokenBudgetMaxTotalTokens.map { PhaseTokenBudget(maxTotalTokens: $0) }
        let trimmedPrompt = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTopicScope = topicScope.trimmingCharacters(in: .whitespacesAndNewlines)
        return PhaseDefinitionDraft(
            phaseId: phaseId, name: name, purpose: purpose, mode: mode, cast: cast,
            inputs: PhaseInputKind.allCases.filter { inputs.contains($0) },
            rules: PhaseRules(standard: standardRules, yours: yourRules, requiredOutput: requiredOutput,
                              acceptanceChecks: acceptanceChecks),
            outputs: wireOutputs, gates: TypedGateName.allCases.filter { gates.contains($0) },
            budget: PhaseBudget(estimateMinutes: estimateMinutes, timeoutSeconds: timeoutSeconds),
            prompt: trimmedPrompt.isEmpty ? nil : trimmedPrompt,
            topicScope: trimmedTopicScope.isEmpty ? nil : trimmedTopicScope,
            turnPolicy: wireTurnPolicy, tokenBudget: wireTokenBudget)
    }

    private func wireCast() -> PhaseCast? {
        var wireParticipants: [PhaseParticipant] = []
        for participant in participants {
            guard let value = participant.wireValue() else { return nil }
            wireParticipants.append(value)
        }
        let wireCoordinator = coordinator.flatMap { $0.wireRole() }
        let wireGrader = grader.flatMap { $0.wireRole() }
        if coordinator != nil, wireCoordinator == nil { return nil }
        if grader != nil, wireGrader == nil { return nil }
        return PhaseCast(participants: wireParticipants, coordinator: wireCoordinator, grader: wireGrader)
    }
}

/// One cast seat, edited as plain strings (`PhaseProvider`/`PhasePersona` are validated on save).
public struct PhaseParticipantDraft: Identifiable, Hashable {
    public let id = UUID()
    public var provider: String
    public var persona: String

    public init(provider: String, persona: String) {
        self.provider = provider
        self.persona = persona
    }

    public init(_ role: PhaseRoleRef) {
        provider = role.provider.rawValue
        persona = role.persona?.rawValue ?? ""
    }

    public init(_ participant: PhaseParticipant) {
        provider = participant.provider.rawValue
        persona = participant.persona?.rawValue ?? ""
    }

    public var isValid: Bool { PhaseProviderRule.isValid(provider) && (persona.isEmpty || PhasePersonaRule.isValid(persona)) }

    fileprivate func wireValue() -> PhaseParticipant? {
        guard let providerId = try? PhaseProvider(provider) else { return nil }
        let personaId: PhasePersona? = persona.isEmpty ? nil : try? PhasePersona(persona)
        if !persona.isEmpty, personaId == nil { return nil }
        return PhaseParticipant(provider: providerId, persona: personaId)
    }

    fileprivate func wireRole() -> PhaseRoleRef? {
        guard let providerId = try? PhaseProvider(provider) else { return nil }
        let personaId: PhasePersona? = persona.isEmpty ? nil : try? PhasePersona(persona)
        if !persona.isEmpty, personaId == nil { return nil }
        return PhaseRoleRef(provider: providerId, persona: personaId)
    }
}

public struct PhaseOutputDraft: Identifiable, Hashable {
    public let id = UUID()
    public var path: String
    public var schema: String

    public init(path: String = "docs/", schema: String = "") {
        self.path = path
        self.schema = schema
    }

    public init(_ output: PhaseOutput) {
        path = output.path.rawValue
        schema = output.schema ?? ""
    }

    public var isValid: Bool { PhaseOutputPathRule.isValid(path) }

    fileprivate func wireValue() -> PhaseOutput? {
        guard let outputPath = try? PhaseOutputPath(path) else { return nil }
        return PhaseOutput(path: outputPath, schema: schema.isEmpty ? nil : schema)
    }
}

public struct PhaseEditorView: View {
    public var phase: PhaseDefinition
    public var presetId: PhasePresetId
    public var knownProjects: [(id: ProjectID, name: String)]
    /// Instance keys sourced from `room.participants.list roomProviderKey` / `provider.list` (the
    /// same catalog `RoomsModel`/`SettingsModel` already load) — feeds the cast provider pickers.
    /// Empty means "no catalog available yet"; the cast rows fall back to free text, badged
    /// NOT YET SOURCED, rather than presenting a picker with nothing in it.
    public var providerCatalogKeys: [String]
    public var activeRun: PhaseRun?
    public var isSaving: Bool
    public var saveError: String?
    public var runLaunchError: String?
    public var decisionError: String?
    /// Move-left/move-right — v1 reorder (Architecture decision 15; drag is deferred). `false` for
    /// both at a not-yet-saved new-phase placeholder, which isn't part of any preset's `phases[]` yet.
    public var canMoveLeft: Bool
    public var canMoveRight: Bool
    public var onSave: (PhaseDefinitionDraft) async -> Void
    public var onRun: (ProjectID) async -> Void
    public var onApprove: (String?) async -> Void
    public var onReject: (String) async -> Void
    public var onMoveLeft: () async -> Void
    public var onMoveRight: () async -> Void

    @State private var draft: PhaseEditorDraft
    @State private var showingProjectPicker = false
    @State private var selectedProjectId: ProjectID?
    @State private var newStandardRule = ""
    @State private var newYourRule = ""
    @State private var rejectReason = ""

    public init(phase: PhaseDefinition, presetId: PhasePresetId, knownProjects: [(id: ProjectID, name: String)],
               providerCatalogKeys: [String] = [], activeRun: PhaseRun?, isSaving: Bool, saveError: String?,
               runLaunchError: String?, decisionError: String?, canMoveLeft: Bool = false, canMoveRight: Bool = false,
               onSave: @escaping (PhaseDefinitionDraft) async -> Void, onRun: @escaping (ProjectID) async -> Void,
               onApprove: @escaping (String?) async -> Void, onReject: @escaping (String) async -> Void,
               onMoveLeft: @escaping () async -> Void = {}, onMoveRight: @escaping () async -> Void = {}) {
        self.phase = phase
        self.presetId = presetId
        self.knownProjects = knownProjects
        self.providerCatalogKeys = providerCatalogKeys
        self.activeRun = activeRun
        self.isSaving = isSaving
        self.saveError = saveError
        self.runLaunchError = runLaunchError
        self.decisionError = decisionError
        self.canMoveLeft = canMoveLeft
        self.canMoveRight = canMoveRight
        self.onSave = onSave
        self.onRun = onRun
        self.onApprove = onApprove
        self.onReject = onReject
        self.onMoveLeft = onMoveLeft
        self.onMoveRight = onMoveRight
        _draft = State(initialValue: PhaseEditorDraft(from: phase))
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.m) {
                header
                nameAndPurpose
                modeSection
                castSection
                promptSection
                topicScopeSection
                turnPolicySection
                inputsSection
                rulesSection
                outputsSection
                gatesSection
                budgetSection
                actionRow
                if let activeRun {
                    PhaseRunStatusStrip(run: activeRun, decisionError: decisionError, rejectReason: $rejectReason,
                                       onApprove: onApprove, onReject: onReject)
                }
            }
            .padding(HUDTheme.space.l)
        }
        .id(phase.phaseId.rawValue)
        .onChange(of: phase) { _, newValue in draft = PhaseEditorDraft(from: newValue) }
        .sheet(isPresented: $showingProjectPicker) {
            projectPickerSheet
        }
    }

    // MARK: Sections

    private var header: some View {
        HStack {
            Text(phase.name.isEmpty ? "Untitled stage" : phase.name).font(HUDTypography.displayHeading).foregroundStyle(HUDTheme.ink)
            HUDLabel(phase.phaseId.rawValue)
            HStack(spacing: 2) {
                Button { Task { await onMoveLeft() } } label: { Image(systemName: "chevron.left.circle") }
                    .buttonStyle(.plain).disabled(!canMoveLeft)
                    .help("Move this stage earlier")
                Button { Task { await onMoveRight() } } label: { Image(systemName: "chevron.right.circle") }
                    .buttonStyle(.plain).disabled(!canMoveRight)
                    .help("Move this stage later")
            }
            .foregroundStyle(HUDTheme.mute)
            Spacer()
            ProvenanceBadge(.live("preset.list"), compact: true)
        }
    }

    private var nameAndPurpose: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            labeledField("name") { TextField("Phase name", text: $draft.name).textFieldStyle(.roundedBorder) }
            labeledField("purpose") {
                TextField("What this phase produces and why", text: $draft.purpose, axis: .vertical)
                    .textFieldStyle(.roundedBorder).lineLimit(2...4)
            }
        }
    }

    private var modeSection: some View {
        labeledField("mode") {
            Picker("", selection: $draft.mode) {
                ForEach(PhaseMode.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }.labelsHidden().pickerStyle(.segmented).frame(maxWidth: 320)
        }
    }

    private var castSection: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack(spacing: HUDTheme.space.xs) {
                HUDLabel("cast")
                if draft.graderCollidesWithParticipant {
                    StatusPill(.failed, label: "grader must differ from participants")
                }
            }
            ForEach($draft.participants) { $participant in
                castRow(role: "participant", provider: $participant.provider, persona: $participant.persona) {
                    draft.participants.removeAll { $0.id == participant.id }
                }
            }
            HUDButton("Add participant", systemImage: "plus", variant: .ghost, compact: true) {
                draft.participants.append(PhaseParticipantDraft(provider: "", persona: ""))
            }
            optionalRoleRow(title: "coordinator", role: $draft.coordinator)
            optionalRoleRow(title: "grader", role: $draft.grader)
        }
        .padding(HUDTheme.space.s)
        .hudPanel()
    }

    private func castRow(role: String, provider: Binding<String>, persona: Binding<String>, onRemove: @escaping () -> Void) -> some View {
        HStack(spacing: HUDTheme.space.xs) {
            providerField(provider)
            TextField("persona (optional)", text: persona).textFieldStyle(.roundedBorder).frame(width: 150)
            Button(action: onRemove) { Image(systemName: "xmark.circle.fill") }
                .buttonStyle(.plain).foregroundStyle(HUDTheme.mute)
        }
    }

    private func optionalRoleRow(title: String, role: Binding<PhaseParticipantDraft?>) -> some View {
        HStack(spacing: HUDTheme.space.xs) {
            Toggle(isOn: Binding(get: { role.wrappedValue != nil }, set: { role.wrappedValue = $0 ? PhaseParticipantDraft(provider: "", persona: "") : nil })) {
                HUDLabel(title)
            }.toggleStyle(.switch).labelsHidden()
            HUDLabel(title)
            if role.wrappedValue != nil {
                providerField(Binding(get: { role.wrappedValue?.provider ?? "" }, set: { role.wrappedValue?.provider = $0 }))
                TextField("persona (optional)", text: Binding(get: { role.wrappedValue?.persona ?? "" }, set: { role.wrappedValue?.persona = $0 }))
                    .textFieldStyle(.roundedBorder).frame(width: 150)
            }
        }
    }

    /// A cast seat's model binding: a menu fed by `providerCatalogKeys` (Architecture decision 8 —
    /// "model binding = instance keys") when the catalog has anything to offer, falling back to free
    /// text badged NOT YET SOURCED when it doesn't (an empty catalog is never silently treated as "no
    /// providers exist"). The current value is always kept selectable even if it has since fallen out
    /// of the catalog, so an existing phase never shows a blank picker for a provider it already names.
    private func providerField(_ provider: Binding<String>) -> some View {
        Group {
            if providerCatalogKeys.isEmpty {
                HStack(spacing: 4) {
                    TextField("provider", text: provider).textFieldStyle(.roundedBorder).frame(width: 110)
                    ProvenanceBadge(.notYetSourced, compact: true)
                }
            } else {
                let options = providerCatalogKeys.contains(provider.wrappedValue) || provider.wrappedValue.isEmpty
                    ? providerCatalogKeys : [provider.wrappedValue] + providerCatalogKeys
                Picker("", selection: provider) {
                    Text("choose…").tag("")
                    ForEach(options, id: \.self) { key in Text(key).tag(key) }
                }.labelsHidden().frame(width: 150)
            }
        }
    }

    // MARK: Prompt / topic scope / turn policy (Wave-1 PhaseDefinition fields, Architecture decision 8)

    private var promptSection: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HUDLabel("operator briefing — prepended to the synthesized instruction")
            TextEditor(text: $draft.prompt)
                .font(HUDTypography.monoValue)
                .frame(minHeight: 70, maxHeight: 140)
                .padding(4)
                .background(RoundedRectangle(cornerRadius: 4).fill(HUDTheme.hull))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(HUDTheme.hairline, lineWidth: 1))
            if draft.prompt.count > maxPhasePromptLength {
                Text("briefing exceeds \(maxPhasePromptLength) characters").font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
            }
        }
    }

    private var topicScopeSection: some View {
        labeledField("topic scope") {
            TextField("Free-text scope prompted to the cast (optional)", text: $draft.topicScope, axis: .vertical)
                .textFieldStyle(.roundedBorder).lineLimit(1...3)
        }
    }

    private var turnPolicySection: some View {
        HStack(spacing: HUDTheme.space.l) {
            labeledField("max rounds") {
                HStack {
                    Toggle(isOn: Binding(get: { draft.maxRounds != nil }, set: { on in
                        draft.maxRounds = on ? 6 : nil
                        if !on { draft.perParticipantTurnCap = nil }
                    })) { EmptyView() }.toggleStyle(.switch).labelsHidden()
                    if let rounds = draft.maxRounds {
                        Stepper(value: Binding(get: { rounds }, set: { draft.maxRounds = $0 }), in: 1...maxPhaseTurnPolicyRounds) {
                            Text("\(rounds)").font(HUDTypography.monoValue)
                        }
                    } else {
                        Text("default (6)").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    }
                }
            }
            labeledField("per-participant cap") {
                HStack {
                    Toggle(isOn: Binding(get: { draft.perParticipantTurnCap != nil }, set: { draft.perParticipantTurnCap = $0 ? 1 : nil })) {
                        EmptyView()
                    }.toggleStyle(.switch).labelsHidden().disabled(draft.maxRounds == nil)
                    if let cap = draft.perParticipantTurnCap {
                        Stepper(value: Binding(get: { cap }, set: { draft.perParticipantTurnCap = $0 }), in: 1...maxPhaseTurnPolicyRounds) {
                            Text("\(cap)").font(HUDTypography.monoValue)
                        }
                    } else {
                        Text("unbounded").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    }
                }
            }
        }
    }

    private var inputsSection: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HUDLabel("inputs")
            HStack(spacing: HUDTheme.space.xs) {
                ForEach(PhaseInputKind.allCases, id: \.self) { kind in
                    chipToggle(kind.rawValue, isOn: draft.inputs.contains(kind)) {
                        if draft.inputs.contains(kind) { draft.inputs.remove(kind) } else { draft.inputs.insert(kind) }
                    }
                }
            }
        }
    }

    private var rulesSection: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            HUDLabel("rules")
            ruleListEditor(title: "standard", badge: "enforced", role: .machine, items: $draft.standardRules,
                          newValue: $newStandardRule, placeholder: "rule.some.id")
            ruleListEditor(title: "yours", badge: "prompted", role: .neutral, items: $draft.yourRules,
                          newValue: $newYourRule, placeholder: "Free-text operator rule")
            simpleListEditor(title: "required output", items: $draft.requiredOutput)
            simpleListEditor(title: "acceptance checks", items: $draft.acceptanceChecks)
        }
        .padding(HUDTheme.space.s)
        .hudPanel()
    }

    private func ruleListEditor(title: String, badge: String, role: HUDRole, items: Binding<[String]>,
                                newValue: Binding<String>, placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HStack(spacing: HUDTheme.space.xxs) {
                HUDLabel(title)
                Text(badge).font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                    .foregroundStyle(role.color).padding(.horizontal, 5).padding(.vertical, 1)
                    .background(Capsule().fill(role.fill)).overlay(Capsule().stroke(role.stroke, lineWidth: 1))
            }
            ForEach(Array(items.wrappedValue.enumerated()), id: \.offset) { index, value in
                HStack {
                    Text(value).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.ink)
                    Spacer()
                    Button { items.wrappedValue.remove(at: index) } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(HUDTheme.mute)
                }
            }
            HStack {
                TextField(placeholder, text: newValue).textFieldStyle(.roundedBorder)
                HUDButton("Add", variant: .ghost, compact: true) {
                    let trimmed = newValue.wrappedValue.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty, !items.wrappedValue.contains(trimmed) else { return }
                    items.wrappedValue.append(trimmed)
                    newValue.wrappedValue = ""
                }.disabled(newValue.wrappedValue.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func simpleListEditor(title: String, items: Binding<[String]>) -> some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            HUDLabel(title)
            ForEach(Array(items.wrappedValue.enumerated()), id: \.offset) { index, value in
                HStack {
                    Text(value).font(HUDTypography.caption).foregroundStyle(HUDTheme.soft)
                    Spacer()
                    Button { items.wrappedValue.remove(at: index) } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(HUDTheme.mute)
                }
            }
            HUDButton("Add", systemImage: "plus", variant: .ghost, compact: true) {
                items.wrappedValue.append("")
            }
        }
    }

    private var outputsSection: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HUDLabel("outputs")
            ForEach($draft.outputs) { $output in
                HStack(spacing: HUDTheme.space.xs) {
                    TextField("docs/…", text: $output.path).textFieldStyle(.roundedBorder)
                    TextField("schema path (optional)", text: $output.schema).textFieldStyle(.roundedBorder)
                    Button { draft.outputs.removeAll { $0.id == output.id } } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(HUDTheme.mute)
                }
                if !output.isValid {
                    Text("output path must be repo-relative under docs/").font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                }
            }
            HUDButton("Add output", systemImage: "plus", variant: .ghost, compact: true) {
                draft.outputs.append(PhaseOutputDraft())
            }
        }
    }

    private var gatesSection: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HUDLabel("gates")
            HStack(spacing: HUDTheme.space.xs) {
                ForEach(TypedGateName.allCases, id: \.self) { gate in
                    chipToggle(gate.rawValue, isOn: draft.gates.contains(gate), role: .human) {
                        if draft.gates.contains(gate) { draft.gates.remove(gate) } else { draft.gates.insert(gate) }
                    }
                }
            }
        }
    }

    private var budgetSection: some View {
        HStack(spacing: HUDTheme.space.l) {
            labeledField("estimate (min)") {
                HStack {
                    Toggle(isOn: Binding(get: { draft.estimateMinutes != nil }, set: { draft.estimateMinutes = $0 ? 30 : nil })) {
                        EmptyView()
                    }.toggleStyle(.switch).labelsHidden()
                    if let minutes = draft.estimateMinutes {
                        Stepper(value: Binding(get: { minutes }, set: { draft.estimateMinutes = $0 }), in: 1...1_440) {
                            Text("\(minutes)").font(HUDTypography.monoValue)
                        }
                    } else {
                        Text("won't guess").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    }
                }
            }
            labeledField("timeout (sec)") {
                Stepper(value: $draft.timeoutSeconds, in: 60...86_400, step: 60) {
                    Text("\(draft.timeoutSeconds)").font(HUDTypography.monoValue)
                }
            }
            labeledField("token budget") {
                HStack {
                    Toggle(isOn: Binding(get: { draft.tokenBudgetMaxTotalTokens != nil },
                                         set: { draft.tokenBudgetMaxTotalTokens = $0 ? 10_000 : nil })) {
                        EmptyView()
                    }.toggleStyle(.switch).labelsHidden()
                    if let tokens = draft.tokenBudgetMaxTotalTokens {
                        TextField("max total tokens", value: Binding(get: { tokens }, set: { draft.tokenBudgetMaxTotalTokens = max(1, $0) }),
                                  format: .number)
                            .textFieldStyle(.roundedBorder).frame(width: 100)
                    } else {
                        Text("unbounded").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    }
                }
            }
        }
    }

    private var actionRow: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if let saveError {
                Text(saveError).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
            }
            if let runLaunchError {
                Text(runLaunchError).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
            }
            HStack {
                if !draft.isValid {
                    Text("fix the fields above before saving").font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                }
                Spacer()
                if isSaving { ProgressView().controlSize(.small) }
                HUDButton(isSaving ? "Saving…" : "Save", variant: .gold) {
                    guard let wire = draft.wireDraft(phaseId: phase.phaseId) else { return }
                    Task { await onSave(wire) }
                }.disabled(isSaving || !draft.isValid)
                HUDButton("Run on…", systemImage: "play.fill", variant: .arc) {
                    showingProjectPicker = true
                }.disabled(knownProjects.isEmpty)
            }
        }
    }

    private var projectPickerSheet: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HUDLabel("run \(phase.name) on")
            Picker("Project", selection: $selectedProjectId) {
                Text("Choose a project").tag(ProjectID?.none)
                ForEach(knownProjects, id: \.id) { project in Text(project.name).tag(Optional(project.id)) }
            }.labelsHidden()
            HStack {
                HUDButton("Cancel", variant: .ghost) { showingProjectPicker = false }
                Spacer()
                HUDButton("Run", variant: .arc) {
                    guard let selectedProjectId else { return }
                    showingProjectPicker = false
                    Task { await onRun(selectedProjectId) }
                }.disabled(selectedProjectId == nil)
            }
        }
        .padding(HUDTheme.space.l)
        .frame(width: 380)
        .background(HUDTheme.plate)
    }

    // MARK: Small helpers

    private func labeledField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .top, spacing: HUDTheme.space.s) {
            HUDLabel(title).frame(width: 110, alignment: .leading).padding(.top, 4)
            content()
        }
    }

    private func chipToggle(_ label: String, isOn: Bool, role: HUDRole = .machine, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(HUDTypography.monoLabel).textCase(.uppercase).tracking(1.0)
                .foregroundStyle(isOn ? role.color : HUDTheme.mute)
                .padding(.horizontal, HUDTheme.space.xs).padding(.vertical, 4)
                .background(Capsule().fill(isOn ? role.fill : Color.clear))
                .overlay(Capsule().stroke(isOn ? role.stroke : HUDTheme.hairline, lineWidth: 1))
        }.buttonStyle(.plain)
    }
}

/// The `PhaseRunV1` state pill shared by the editor's run strip and the recent-runs panel.
@MainActor
func phaseRunStatusPill(for state: PhaseRunState) -> StatusPill {
    switch state {
    case .queued: return StatusPill(.queued)
    case .running: return StatusPill(.running)
    case .awaitingHuman: return StatusPill(.blocked)
    case .succeeded: return StatusPill(.succeeded)
    case .failed: return StatusPill(.failed)
    case .cancelled: return StatusPill(.cancelled)
    }
}

// MARK: - PhaseRunStatusStrip
//
// A standalone strip reflecting one `PhaseRun`'s live state: queued/running/succeeded/failed/
// cancelled render as a plain machine-cyan panel; `awaiting-human` renders gold with Approve/Reject
// (a reason is required to reject, optional to approve). Extracted from `PhaseEditorView` so it is
// independently previewable/snapshottable and reusable wherever a run's live state needs showing.
public struct PhaseRunStatusStrip: View {
    public var run: PhaseRun
    public var decisionError: String?
    @Binding public var rejectReason: String
    public var onApprove: (String?) async -> Void
    public var onReject: (String) async -> Void

    public init(run: PhaseRun, decisionError: String?, rejectReason: Binding<String>,
               onApprove: @escaping (String?) async -> Void, onReject: @escaping (String) async -> Void) {
        self.run = run
        self.decisionError = decisionError
        self._rejectReason = rejectReason
        self.onApprove = onApprove
        self.onReject = onReject
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            HStack(spacing: HUDTheme.space.xs) {
                HUDLabel("run")
                phaseRunStatusPill(for: run.state)
                ProvenanceBadge(.live("phase.status"), compact: true)
            }
            if let decisionError {
                Text(decisionError).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
            }
            if run.isAwaitingHuman {
                HStack {
                    TextField("Reason (required to reject)", text: $rejectReason).textFieldStyle(.roundedBorder)
                    HUDButton("Approve", variant: .gold) { Task { await onApprove(rejectReason.isEmpty ? nil : rejectReason) } }
                    HUDButton("Reject", variant: .gold) { Task { await onReject(rejectReason) } }
                        .disabled(rejectReason.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            if let verdict = run.graderVerdict {
                HStack(spacing: HUDTheme.space.xxs) {
                    HUDLabel("grader")
                    Text(verdict.verdict.rawValue).font(HUDTypography.monoValue)
                        .foregroundStyle(verdict.verdict == .pass ? HUDTheme.ok : HUDTheme.alert)
                }
            }
            ForEach(run.outputs) { output in
                Text(output.path.rawValue).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.soft)
            }
        }
        .padding(HUDTheme.space.s)
        .hudPanel(role: run.isAwaitingHuman ? .human : .machine)
    }
}
