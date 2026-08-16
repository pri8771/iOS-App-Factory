import AppKit
import SnapshotTesting
import SwiftUI
import XCTest

/// Renders a SwiftUI view through an offscreen `NSHostingView` at 1x in both appearances and asserts
/// against the committed PNGs (see docs/architecture/0001, decision 3). Shared by every snapshot suite.
@MainActor
func assertHUD<V: View>(_ view: V, size: CGSize, named name: String,
                        file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
    for (appearance, suffix) in [(NSAppearance.Name.darkAqua, "dark"), (.aqua, "light")] {
        let host = NSHostingView(rootView: view.frame(width: size.width, height: size.height))
        host.appearance = NSAppearance(named: appearance)
        host.frame = CGRect(origin: .zero, size: size)
        let window = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = host
        window.appearance = host.appearance
        host.layoutSubtreeIfNeeded()
        assertSnapshot(of: host, as: .image(precision: 0.995, perceptualPrecision: 0.98),
                       named: "\(name)-\(suffix)", file: file, testName: testName, line: line)
    }
}
