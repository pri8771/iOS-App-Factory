import SwiftUI

// MARK: - ReleaseRailView
//
// Studio Phase 6 step B: the release rail. One row per app as App Store Connect names it, straight
// off `release.projection` — the newest persisted observation of Apple's builds and store versions
// projected onto the single 8-stage release state machine (`ReleaseStage`, ADR 0003). Surfaced, not
// duplicated: the stage cell prints exactly the daemon's `projectedStage`/`projectionBasis`; the rail
// never infers a stage or a date of its own.
//
// Provenance is printed in the header the way every instrument prints it: `live · release.projection`
// with the observation's own `observedAt` when an observation exists, `not yet sourced` (with the
// daemon's reason) when none does. The "Observe" control is machine-cyan — the human initiates a
// machine read; nothing here awaits the human, so nothing here is gold.

/// Everything the rail renders, as a pure value so it previews and snapshots without a store.
public struct ReleaseRailState: Hashable, Sendable {
    public var projection: ReleaseProjection?
    /// Last `release.projection` / `release.observe` error, if any (already stringified by the store).
    public var error: String?
    public var isObserving: Bool
    /// Optional Session-2 protected-release operator truth (offline/fake path only).
    public var protectedRelease: ProtectedReleaseOperatorSnapshot?

    public init(
        projection: ReleaseProjection?,
        error: String? = nil,
        isObserving: Bool = false,
        protectedRelease: ProtectedReleaseOperatorSnapshot? = nil
    ) {
        self.projection = projection
        self.error = error
        self.isObserving = isObserving
        self.protectedRelease = protectedRelease
    }

    /// Where the rows came from: live when an observation exists, else not yet sourced.
    public var provenance: Provenance {
        guard let projection, projection.latest != nil else { return .notYetSourced }
        return .live("release.projection")
    }

    public var canObserve: Bool { projection?.observer.configured ?? false }
}

public struct ReleaseRailView: View {
    public var state: ReleaseRailState
    /// Present when the shell can dispatch `release.observe`; the button is disabled (not hidden) when
    /// the daemon has no observer configured, so the reason stays visible.
    public var onObserve: (() -> Void)?

    public init(state: ReleaseRailState, onObserve: (() -> Void)? = nil) {
        self.state = state
        self.onObserve = onObserve
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            header
            if let latest = state.projection?.latest {
                if latest.apps.isObserved {
                    if latest.appObservations.isEmpty {
                        note("App Store Connect listed no apps for this key.")
                    } else {
                        rows(latest.appObservations)
                    }
                } else {
                    note("apps read \(latest.apps.problemLabel ?? latest.apps.kind.rawValue)"
                         + (latest.apps.detail.map { " — \($0)" } ?? ""), role: .alert)
                }
            } else if let projection = state.projection {
                note(projection.observer.configured
                     ? "No App Store Connect observation has been taken on this runtime yet."
                     : (projection.observer.unavailableReason ?? "release observer not configured"))
            } else {
                note("—")
            }
            if let error = state.error {
                note(error, role: .alert)
            }
            if let protectedRelease = state.protectedRelease {
                protectedReleasePanel(protectedRelease)
            }
        }
    }

    @ViewBuilder
    private func protectedReleasePanel(_ snapshot: ProtectedReleaseOperatorSnapshot) -> some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xxs) {
            Text("PROTECTED RELEASE (OFFLINE)")
                .font(HUDTypography.monoLabel)
                .tracking(HUDTypography.labelTracking)
                .foregroundStyle(HUDTheme.faint)
            Text("stage \(snapshot.stage.label) · rev \(snapshot.revision) · \(snapshot.effectTruth.label)")
                .font(HUDTypography.monoValue)
                .foregroundStyle(HUDTheme.ink)
            Text(snapshot.transportProtocol)
                .font(HUDTypography.monoLabel)
                .foregroundStyle(HUDTheme.mute)
            if snapshot.realTransportEnabled {
                note("real Apple transport unexpectedly enabled", role: .alert)
            } else {
                note("real Apple transport disabled; fake/offline path only")
            }
            if !snapshot.safeActions.isEmpty {
                Text(snapshot.safeActions.joined(separator: " · "))
                    .font(HUDTypography.caption)
                    .foregroundStyle(HUDTheme.mute)
            }
        }
        .padding(.top, HUDTheme.space.xs)
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: HUDTheme.space.s) {
            ProvenanceBadge(state.provenance, compact: true)
            if let latest = state.projection?.latest {
                Text("observed \(latest.observedAt.rawValue) · \(latest.requestCount) GET\(latest.requestCount == 1 ? "" : "s") · key \(latest.source.keyId)")
                    .font(HUDTypography.monoLabel)
                    .foregroundStyle(HUDTheme.mute)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            if let projection = state.projection, projection.observationCount > 1 {
                Text("\(projection.observationCount) observations")
                    .font(HUDTypography.caption)
                    .foregroundStyle(HUDTheme.faint)
            }
            Spacer(minLength: HUDTheme.space.s)
            if let onObserve {
                HUDButton(state.isObserving ? "Observing…" : "Observe App Store Connect",
                          systemImage: "arrow.triangle.2.circlepath", variant: .arc, compact: true,
                          action: onObserve)
                    .disabled(!state.canObserve || state.isObserving)
                    .help(state.canObserve
                          ? "Take a fresh, read-only App Store Connect observation through the daemon."
                          : (state.projection?.observer.unavailableReason ?? "release observer not configured"))
            }
        }
    }

    // MARK: Rows

    private func rows(_ entries: [AscAppReleaseObservation]) -> some View {
        VStack(spacing: 0) {
            columnHeader
            ForEach(entries) { entry in
                row(entry)
                if entry.id != entries.last?.id {
                    Rectangle().fill(HUDTheme.hairline).frame(height: 1)
                }
            }
        }
    }

    private var columnHeader: some View {
        HStack(spacing: HUDTheme.space.s) {
            columnLabel("app").frame(width: 200, alignment: .leading)
            columnLabel("latest build").frame(width: 190, alignment: .leading)
            columnLabel("store version").frame(width: 170, alignment: .leading)
            columnLabel("projected stage").frame(minWidth: 150, alignment: .leading)
            Spacer(minLength: 0)
        }
        .padding(.bottom, HUDTheme.space.xxs)
    }

    private func columnLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(HUDTypography.monoLabel)
            .tracking(HUDTypography.labelTracking)
            .foregroundStyle(HUDTheme.faint)
    }

    private func row(_ entry: AscAppReleaseObservation) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: HUDTheme.space.s) {
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.app.name).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink)
                Text(entry.app.bundleId).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.mute)
                    .lineLimit(1).truncationMode(.middle)
            }
            .frame(width: 200, alignment: .leading)

            buildCell(entry).frame(width: 190, alignment: .leading)
            versionCell(entry).frame(width: 170, alignment: .leading)
            stageCell(entry).frame(minWidth: 150, alignment: .leading)
            Spacer(minLength: 0)
        }
        .padding(.vertical, HUDTheme.space.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel(entry))
    }

    @ViewBuilder
    private func buildCell(_ entry: AscAppReleaseObservation) -> some View {
        if let problem = entry.builds.problemLabel {
            problemText(problem)
        } else if let build = entry.projection?.latestBuild {
            VStack(alignment: .leading, spacing: 1) {
                Text(build.versionLabel).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.ink)
                Text([build.processingState.rawValue, build.internalBuildState, build.expired ? "EXPIRED" : nil]
                        .compactMap { $0 }.joined(separator: " · "))
                    .font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.mute)
                if let uploaded = build.uploadedDate {
                    Text("uploaded \(Self.shortInstant(uploaded))").font(HUDTypography.caption).foregroundStyle(HUDTheme.faint)
                        .lineLimit(1)
                }
            }
        } else {
            Text("no build").font(HUDTypography.callout).foregroundStyle(HUDTheme.mute)
        }
    }

    @ViewBuilder
    private func versionCell(_ entry: AscAppReleaseObservation) -> some View {
        if let problem = entry.appStoreVersions.problemLabel {
            problemText(problem)
        } else if let version = entry.projection?.latestAppStoreVersion {
            VStack(alignment: .leading, spacing: 1) {
                Text(version.versionString).font(HUDTypography.monoValue).foregroundStyle(HUDTheme.ink)
                Text(version.stateLabel ?? "—").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.mute)
            }
        } else {
            Text("no store version").font(HUDTypography.callout).foregroundStyle(HUDTheme.mute)
        }
    }

    @ViewBuilder
    private func stageCell(_ entry: AscAppReleaseObservation) -> some View {
        if let projection = entry.projection {
            VStack(alignment: .leading, spacing: 2) {
                if let stage = projection.projectedStage {
                    stageChip(stage)
                } else {
                    Text("—").font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                }
                Text(projection.projectionBasis.label).font(HUDTypography.caption).foregroundStyle(HUDTheme.mute)
            }
        } else {
            // Apple answered at least one read with a refusal or an ambiguity: no stage is claimed.
            Text("won't guess").font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.alert)
                .padding(.horizontal, HUDTheme.space.xs).padding(.vertical, 2)
                .overlay(
                    RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous)
                        .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .foregroundStyle(HUDTheme.alert.opacity(0.7))
                )
        }
    }

    private func stageChip(_ stage: ReleaseStage) -> some View {
        Text(stage.label.uppercased())
            .font(HUDTypography.monoLabel)
            .tracking(HUDTypography.labelTracking)
            .foregroundStyle(HUDTheme.arc)
            .padding(.horizontal, HUDTheme.space.xs).padding(.vertical, 2)
            .background(
                RoundedRectangle(cornerRadius: HUDTheme.radius.pill, style: .continuous)
                    .fill(HUDTheme.arc.opacity(0.12))
            )
            .overlay(
                RoundedRectangle(cornerRadius: HUDTheme.radius.pill, style: .continuous)
                    .stroke(HUDTheme.arc.opacity(0.28), lineWidth: 1)
            )
    }

    /// "2026-08-13 18:02Z" — Apple's instant to the minute, never re-zoned (the rail prints wire truth).
    static func shortInstant(_ instant: IsoInstant) -> String {
        let raw = instant.rawValue
        guard raw.count >= 16 else { return raw }
        return raw.prefix(16).replacingOccurrences(of: "T", with: " ") + "Z"
    }

    private func problemText(_ text: String) -> some View {
        Text(text).font(HUDTypography.monoLabel).foregroundStyle(HUDTheme.alert)
    }

    private func note(_ text: String, role: HUDRole = .neutral) -> some View {
        Text(text)
            .font(HUDTypography.callout)
            .foregroundStyle(role == .alert ? HUDTheme.alert : HUDTheme.mute)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func accessibilityLabel(_ entry: AscAppReleaseObservation) -> String {
        var parts = [entry.app.name]
        if let build = entry.projection?.latestBuild { parts.append("build \(build.versionLabel)") }
        if let stage = entry.projection?.projectedStage { parts.append("stage \(stage.label)") }
        if let basis = entry.projection?.projectionBasis { parts.append(basis.label) }
        return parts.joined(separator: ", ")
    }
}

#Preview("Release rail — empty, observer not configured") {
    ReleaseRailView(state: ReleaseRailState(projection: nil), onObserve: {})
        .padding()
        .frame(width: 900)
        .background(HUDTheme.void)
        .preferredColorScheme(.dark)
}
