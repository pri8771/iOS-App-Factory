import AppKit
import SwiftUI

// MARK: - SeedProjectSheet
//
// The from-scratch entry point: name + directory → `project.seed` (scaffolds, commits, converges
// enrollment, and registers the result into the Project Registry when that convergence carries zero
// rules.* blockers), then proposes a plan for it (`plan.propose`) with the seed's real
// `repositoryId` when `ProjectSeedResult.registered` is `true`. On the rare unregistered path
// (`registered == false`), this sheet still proposes the plan but honestly with `repositoryId: nil`
// — `plan.execute` will refuse to submit a task item until something sets one (`ProjectPlanEdit
// .setRepository`), a real, documented gap in this wire family, not a Studio omission.

public struct SeedProjectSheet: View {
    public var presets: [PhasePreset]
    public var isSeeding: Bool
    public var seedError: String?
    public var onSeed: (AbsolutePath, String) async -> ProjectSeedResult?
    public var onProposePlan: (ProjectPlanBrief, PhasePresetId, ProjectID?, RepositoryID?) async -> ProjectPlan?
    public var onDone: (ProjectPlan?) -> Void

    @State private var name = ""
    @State private var directory = (NSHomeDirectory() as NSString).appendingPathComponent("code/new-project")
    @State private var selectedPresetId: PhasePresetId?
    @State private var oneLiner = ""
    @State private var stage: Stage = .form
    @State private var errorText: String?

    private enum Stage { case form, seeding, proposing }

    public init(presets: [PhasePreset], isSeeding: Bool, seedError: String?,
               onSeed: @escaping (AbsolutePath, String) async -> ProjectSeedResult?,
               onProposePlan: @escaping (ProjectPlanBrief, PhasePresetId, ProjectID?, RepositoryID?) async -> ProjectPlan?,
               onDone: @escaping (ProjectPlan?) -> Void) {
        self.presets = presets
        self.isSeeding = isSeeding
        self.seedError = seedError
        self.onSeed = onSeed
        self.onProposePlan = onProposePlan
        self.onDone = onDone
        _selectedPresetId = State(initialValue: presets.first { $0.appliesTo?.contains(.ios) ?? true }?.presetId ?? presets.first?.presetId)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HUDLabel("seed new project")
            labeledField("name") { TextField("Workout Tracker", text: $name).textFieldStyle(.roundedBorder) }
            labeledField("one-liner") { TextField("A minimal iOS app for…", text: $oneLiner).textFieldStyle(.roundedBorder) }
            labeledField("directory") {
                HStack {
                    TextField("/Users/you/code/new-project", text: $directory).textFieldStyle(.roundedBorder)
                    Button("Choose…") { chooseDirectory() }
                }
            }
            if !presets.isEmpty {
                labeledField("preset") {
                    Picker("", selection: $selectedPresetId) {
                        ForEach(presets) { preset in Text(preset.name).tag(Optional(preset.presetId)) }
                    }.labelsHidden()
                }
            } else {
                Text("No presets loaded yet — the phase preset picks the plan's phases.")
                    .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
            }
            Text("If the seeded repository doesn't converge cleanly it won't be registered yet, and the proposed plan starts with no target repository set — plan.execute will hold on the first task until one is set.")
                .font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
                .fixedSize(horizontal: false, vertical: true)
            if let text = errorText ?? seedError {
                Text(text).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                HUDButton("Cancel", variant: .ghost) { onDone(nil) }
                Spacer()
                if stage != .form { ProgressView().controlSize(.small) }
                HUDButton(actionLabel, variant: .gold, action: { Task { await run() } })
                    .disabled(stage != .form || !isValid)
            }
        }
        .padding(HUDTheme.space.l)
        .frame(width: 460)
        .background(HUDTheme.plate)
    }

    private var actionLabel: String {
        switch stage {
        case .form: return "Seed + propose plan"
        case .seeding: return "Seeding…"
        case .proposing: return "Proposing plan…"
        }
    }

    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && AbsolutePathRule.isValid(directory)
            && selectedPresetId != nil
    }

    private func labeledField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .top, spacing: HUDTheme.space.s) {
            HUDLabel(title).frame(width: 80, alignment: .leading).padding(.top, 4)
            content()
        }
    }

    private func chooseDirectory() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"
        if panel.runModal() == .OK, let url = panel.url { directory = url.path }
    }

    private func run() async {
        guard let path = try? AbsolutePath(directory), let presetId = selectedPresetId else { return }
        errorText = nil
        stage = .seeding
        guard let seeded = await onSeed(path, name) else {
            stage = .form
            return
        }
        stage = .proposing
        let brief = ProjectPlanBrief(title: name, oneLiner: oneLiner.isEmpty ? "Seeded at \(seeded.repositoryRoot.rawValue)." : oneLiner,
                                     constraints: [])
        let plan = await onProposePlan(brief, presetId, seeded.registered ? seeded.projectId : nil,
                                       seeded.registered ? seeded.repositoryId : nil)
        stage = .form
        onDone(plan)
    }
}
