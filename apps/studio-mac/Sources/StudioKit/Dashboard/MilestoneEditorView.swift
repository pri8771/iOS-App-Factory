import SwiftUI

// MARK: - MilestoneEditorView
//
// A minimal sheet from project detail: create or edit one milestone and `project.milestone.upsert`
// it. `targetDate` is a plain toggle + date picker — off is "won't guess" (`targetDate: nil`, a
// first-class, honest value the daemon never fills in for you), not a default date.

public struct MilestoneEditorView: View {
    public var projectId: ProjectID
    public var existing: ProjectMilestone?
    public var onSave: (ProjectMilestoneDraft, Int?) async -> Result<ProjectMilestoneUpsertResult, AssistantBackendError>
    public var onDone: (ProjectMilestoneUpsertResult?) -> Void

    @State private var phase: String
    @State private var kind: ProjectMilestoneKind
    @State private var label: String
    @State private var hasTargetDate: Bool
    @State private var targetDate: Date
    @State private var owner: ProjectMilestoneOwner
    @State private var status: ProjectMilestoneStatus
    @State private var isSaving = false
    @State private var errorText: String?

    public init(projectId: ProjectID, existing: ProjectMilestone? = nil,
                onSave: @escaping (ProjectMilestoneDraft, Int?) async -> Result<ProjectMilestoneUpsertResult, AssistantBackendError>,
                onDone: @escaping (ProjectMilestoneUpsertResult?) -> Void) {
        self.projectId = projectId
        self.existing = existing
        self.onSave = onSave
        self.onDone = onDone
        _phase = State(initialValue: existing?.phase.rawValue ?? "")
        _kind = State(initialValue: existing?.kind ?? .stage)
        _label = State(initialValue: existing?.label ?? "")
        _hasTargetDate = State(initialValue: existing?.targetDate != nil)
        _targetDate = State(initialValue: existing?.targetDate?.dayStamp?.date ?? Date())
        _owner = State(initialValue: existing?.owner ?? .machine)
        _status = State(initialValue: existing?.status ?? .planned)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.m) {
            HStack {
                Text(existing == nil ? "New milestone" : "Edit milestone")
                    .font(HUDTypography.displaySubheading).foregroundStyle(HUDTheme.ink)
                Spacer()
                ProvenanceBadge(.staticValue("not yet saved"), compact: true)
            }
            form
            if let errorText {
                Text(errorText).font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Spacer()
                HUDButton("Cancel", variant: .ghost) { onDone(nil) }
                HUDButton(isSaving ? "Saving…" : "Save", variant: .gold) { save() }
                    .disabled(isSaving || !isValid)
            }
        }
        .padding(HUDTheme.space.l)
        .frame(width: 440)
    }

    private var isValid: Bool {
        StableKeyRule.isValid(phase) && !label.trimmingCharacters(in: .whitespaces).isEmpty && label.count <= 200
    }

    @ViewBuilder
    private var form: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            labeledField("phase") {
                TextField("beta", text: $phase).textFieldStyle(.roundedBorder)
            }
            if !phase.isEmpty, !StableKeyRule.isValid(phase) {
                Text("lowercase letters, digits, hyphens; must start with a letter").font(HUDTypography.caption).foregroundStyle(HUDTheme.alert)
            }
            labeledField("kind") {
                Picker("", selection: $kind) {
                    ForEach(ProjectMilestoneKind.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }.labelsHidden().pickerStyle(.segmented)
            }
            labeledField("label") {
                TextField("Beta review", text: $label).textFieldStyle(.roundedBorder)
            }
            labeledField("owner") {
                Picker("", selection: $owner) {
                    ForEach(ProjectMilestoneOwner.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }.labelsHidden().pickerStyle(.segmented)
            }
            labeledField("status") {
                Picker("", selection: $status) {
                    ForEach(ProjectMilestoneStatus.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }.labelsHidden()
            }
            labeledField("target date") {
                VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
                    Toggle(isOn: $hasTargetDate) { EmptyView() }.labelsHidden().toggleStyle(.switch)
                    if hasTargetDate {
                        DatePicker("", selection: $targetDate, displayedComponents: .date).labelsHidden()
                    } else {
                        Text("won't guess — no target date").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    }
                }
            }
        }
    }

    private func labeledField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .top, spacing: HUDTheme.space.s) {
            HUDLabel(title).frame(width: 92, alignment: .leading).padding(.top, 4)
            content()
        }
    }

    private func save() {
        guard let phaseKey = try? StableKey(phase) else {
            errorText = "phase must be a stable key (lowercase letters, digits, hyphens)"
            return
        }
        let milestoneId = existing?.milestoneId ?? MilestoneID.generate()
        let date = hasTargetDate ? CalendarDate(unchecked: Self.dateFormatter.string(from: targetDate)) : nil
        let draft = ProjectMilestoneDraft(milestoneId: milestoneId, projectId: projectId, phase: phaseKey, kind: kind,
                                          label: label, targetDate: date, dependsOn: existing?.dependsOn ?? [],
                                          owner: owner, status: status, evidenceDigest: existing?.evidenceDigest)
        isSaving = true
        errorText = nil
        Task {
            let result = await onSave(draft, existing?.revision)
            isSaving = false
            switch result {
            case .success(let value): onDone(value)
            case .failure(let error): errorText = error.description
            }
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
