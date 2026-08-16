import StudioKit
import SwiftUI

// MARK: - Studio app
//
// One window. Everything visible lives in StudioKit (previewable, snapshot-tested); this target only
// locates the daemon from the environment, owns the store, and starts the refresh loop.
//
//   APP_FACTORY_SOCKET=/tmp/af-ui/runtime/daemon.sock \
//   APP_FACTORY_AUTH_FILE=/tmp/af-ui/etc/auth.token swift run Studio
//
// `APP_FACTORY_RUNTIME_DIR` (socket = <dir>/daemon.sock) and `APP_FACTORY_AUTH_TOKEN` are also
// honoured. With neither set the shell runs honestly offline: fixture timeline, "—" everywhere else.

@main
struct StudioApp: App {
    @State private var store = StudioStore.fromEnvironment()

    var body: some Scene {
        WindowGroup("Studio") {
            StudioRootView()
                .environment(store)
                .frame(minWidth: 1180, minHeight: 760)
                .background(HUDTheme.void)
                .task {
                    await store.connect()
                    store.startRefreshLoop()
                }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1440, height: 920)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Reconnect to Daemon") { Task { await store.connect() } }
                    .keyboardShortcut("r", modifiers: [.command, .shift])
            }
        }
    }
}
