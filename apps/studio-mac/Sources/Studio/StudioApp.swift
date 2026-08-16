import Observation
import StudioKit
import SwiftUI

// MARK: - Studio app shell (phase 1)
//
// One window: a connection panel (doctor), the live attempt list, and the design-system gallery.
// The daemon is located from `APP_FACTORY_SOCKET` / `APP_FACTORY_RUNTIME_DIR`; the token from
// `APP_FACTORY_AUTH_TOKEN` / `APP_FACTORY_AUTH_FILE`. When neither is set the shell still runs, honestly
// offline.

@main
struct StudioApp: App {
    @State private var session = StudioSession()

    var body: some Scene {
        WindowGroup("Studio") {
            StudioRootView()
                .environment(session)
                .frame(minWidth: 960, minHeight: 640)
                .background(HUDTheme.void)
                .task { await session.connect() }
        }
        .windowStyle(.hiddenTitleBar)
    }
}

@Observable
@MainActor
final class StudioSession {
    enum Link: Equatable {
        case unconfigured
        case connecting
        case connected(DoctorResult)
        case offline(String)
    }

    private(set) var link: Link = .unconfigured
    private(set) var socketPath: String?
    private(set) var attempts: [AttemptListItem] = []
    private(set) var attemptsError: String?
    private var client: DaemonClient?

    func connect() async {
        let environment = ProcessInfo.processInfo.environment
        guard let path = DaemonLocator.socketPath(environment: environment) else {
            link = .unconfigured
            return
        }
        socketPath = path
        do {
            let token = try AuthorizationToken.resolve(environment: environment)
            let client = try DaemonClient(configuration: .init(socketPath: path, authorization: token))
            self.client = client
            link = .connecting
            let doctor = try await client.doctor()
            link = .connected(doctor)
            await refreshAttempts()
        } catch let error as DaemonClientError {
            link = .offline(error.description)
        } catch {
            link = .offline(String(describing: error))
        }
    }

    func refreshAttempts() async {
        guard let client else { return }
        do {
            let page = try await client.listAttempts(AttemptListQuery(scope: .all, limit: 50))
            attempts = page.attempts
            attemptsError = nil
        } catch {
            attemptsError = String(describing: error)
        }
    }
}

struct StudioRootView: View {
    @Environment(StudioSession.self) private var session

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HUDTheme.space.m) {
                header
                HStack(alignment: .top, spacing: HUDTheme.space.m) {
                    connectionPanel
                    attemptsPanel
                }
                HUDGallery()
                    .hudPanel("design system", padding: 0)
            }
            .padding(HUDTheme.space.l)
        }
        .background(HUDTheme.void)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Studio").font(HUDTypography.displayTitle).foregroundStyle(HUDTheme.ink)
            HUDLabel("app factory")
            Spacer()
            statusPill
        }
    }

    @ViewBuilder
    private var statusPill: some View {
        switch session.link {
        case .unconfigured: StatusPill(.unknown, label: "no daemon configured")
        case .connecting: StatusPill(.running, label: "connecting")
        case .connected(let doctor): StatusPill(.connected, label: "daemon \(doctor.daemonVersion)")
        case .offline: StatusPill(.disconnected)
        }
    }

    private var connectionPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.s) {
            HUDReadout("socket", value: session.socketPath)
            switch session.link {
            case .connected(let doctor):
                HStack(spacing: HUDTheme.space.l) {
                    HUDReadout("readiness", value: doctor.readiness.rawValue,
                               role: doctor.readiness == .ready ? .ok : .alert)
                    HUDReadout("protocol", value: "v\(doctor.protocolVersion)")
                    HUDReadout("started", value: doctor.startedAt.rawValue)
                }
                if !doctor.issues.isEmpty {
                    ForEach(doctor.issues, id: \.self) { issue in
                        Text(issue).font(HUDTypography.callout).foregroundStyle(HUDTheme.alert)
                    }
                }
            case .offline(let reason):
                Text(reason).font(HUDTypography.callout).foregroundStyle(HUDTheme.alert)
                    .fixedSize(horizontal: false, vertical: true)
            case .unconfigured:
                Text("Set APP_FACTORY_SOCKET (or APP_FACTORY_RUNTIME_DIR) and APP_FACTORY_AUTH_TOKEN (or APP_FACTORY_AUTH_FILE).")
                    .font(HUDTypography.callout).foregroundStyle(HUDTheme.soft)
                    .fixedSize(horizontal: false, vertical: true)
            case .connecting:
                Text("Connecting…").font(HUDTypography.callout).foregroundStyle(HUDTheme.soft)
            }
            HUDButton("Reconnect", systemImage: "arrow.clockwise", variant: .arc) {
                Task { await session.connect() }
            }
        }
        .frame(maxWidth: 360, alignment: .leading)
        .hudPanel("daemon")
    }

    private var attemptsPanel: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if session.attempts.isEmpty {
                Text(session.attemptsError ?? "—")
                    .font(HUDTypography.monoValue)
                    .foregroundStyle(session.attemptsError == nil ? HUDTheme.mute : HUDTheme.alert)
            }
            ForEach(session.attempts) { item in
                HStack(spacing: HUDTheme.space.s) {
                    StatusPill(pillKind(for: item.attempt.state))
                    Text(item.title).font(HUDTypography.bodyStrong).foregroundStyle(HUDTheme.ink).lineLimit(1)
                    Spacer()
                    Text(item.attempt.attemptId.rawValue.prefix(8))
                        .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
                    Text(item.attempt.updatedAt.rawValue)
                        .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.soft)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .hudPanel("attempts")
    }

    private func pillKind(for state: AttemptState) -> HUDStatusKind {
        switch state {
        case .queued: return .queued
        case .running: return .running
        case .paused: return .paused
        case .blocked: return .blocked
        case .succeeded: return .succeeded
        case .failed: return .failed
        case .cancelled: return .cancelled
        }
    }
}
