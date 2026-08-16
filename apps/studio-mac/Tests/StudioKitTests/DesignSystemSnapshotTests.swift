import AppKit
import SnapshotTesting
@testable import StudioKit
import SwiftUI
import XCTest

/// Reference images for the HUD components in both appearances. Rendered through an offscreen
/// NSHostingView at 1x so the PNGs are stable across Retina/non-Retina test hosts.
@MainActor
final class DesignSystemSnapshotTests: XCTestCase {

    private func assertHUD<V: View>(_ view: V, size: CGSize, named name: String,
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

    func testGallery() {
        assertHUD(HUDGallery(), size: CGSize(width: 900, height: 620), named: "gallery")
    }

    func testRadialGauge() {
        assertHUD(HStack(spacing: 16) {
            RadialGauge(value: 0.62, label: "portfolio", caption: "5 / 8").frame(width: 96)
            RadialGauge(value: nil, label: "coverage").frame(width: 96)
            RadialGauge(value: 1, label: "done", role: .ok).frame(width: 96)
            RadialGauge(value: 0.35, label: "planned", planned: true).frame(width: 96)
        }.padding(16).background(HUDTheme.void), size: CGSize(width: 480, height: 160), named: "radial-gauge")
    }

    func testPhaseRing() {
        assertHUD(HStack(spacing: 16) {
            PhaseRing(phases: [
                .init("explore", .done), .init("plan", .done), .init("build", .active),
                .init("qa", .planned), .init("testflight", .gate), .init("release", .planned),
            ], center: "3/6").frame(width: 84, height: 84)
            PhaseRing(phases: [
                .init("explore", .done), .init("plan", .done), .init("build", .done),
                .init("qa", .unknown), .init("testflight", .unknown), .init("release", .unknown),
            ], center: "?").frame(width: 84, height: 84)
        }.padding(16).background(HUDTheme.void), size: CGSize(width: 240, height: 120), named: "phase-ring")
    }

    func testDiamondGate() {
        assertHUD(HStack(spacing: 16) {
            DiamondGate(state: .waiting, size: 14)
            DiamondGate(state: .cleared, size: 14)
            DiamondGate(state: .declined, size: 14)
        }.padding(16).background(HUDTheme.void), size: CGSize(width: 160, height: 64), named: "diamond-gate")
    }

    func testStatusPill() {
        assertHUD(VStack(alignment: .leading, spacing: 8) {
            ForEach(HUDStatusKind.allCases, id: \.self) { StatusPill($0) }
            StatusPill(.running, label: "running 02:14")
        }.padding(16).background(HUDTheme.void), size: CGSize(width: 220, height: 340), named: "status-pill")
    }

    func testHUDButton() {
        assertHUD(HStack(spacing: 8) {
            HUDButton("Approve", systemImage: "diamond.fill", variant: .gold) {}
            HUDButton("Run", systemImage: "play.fill", variant: .arc) {}
            HUDButton("Inspect", variant: .solid) {}
            HUDButton("Dismiss", variant: .ghost) {}
            HUDButton("Off", variant: .gold) {}.disabled(true)
        }.padding(16).background(HUDTheme.void), size: CGSize(width: 480, height: 64), named: "hud-button")
    }

    func testHUDPanelAndTypography() {
        assertHUD(VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Studio").font(HUDTypography.displayTitle).foregroundStyle(HUDTheme.ink)
                Text("The machine speaks in cyan. Gold waits on you.").hudBody()
                HStack(spacing: 24) {
                    HUDReadout("daemon", value: "0.1.0")
                    HUDReadout("coverage", value: nil)
                    HUDReadout("gate", value: "1 waiting", role: .human)
                }
            }.hudPanel("machine panel")
            Text("Approve TestFlight upload").hudBody().hudPanel("gate", role: .human)
            Text("Verification failed").hudBody().hudPanel("alert", role: .alert)
        }.padding(16).background(HUDTheme.void), size: CGSize(width: 420, height: 320), named: "hud-panel")
    }
}
