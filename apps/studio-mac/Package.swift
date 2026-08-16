// swift-tools-version: 6.0
// Studio — the native macOS front end for the App Factory daemon.
//
// Targets:
//   StudioKit       design system (HUD), daemon client, protocol models — testable, no app state
//   Studio          the executable app shell
//   StudioKitTests  unit + snapshot + (skippable) daemon integration tests
//
// Third-party dependencies are limited to the three approved packages below; everything else is
// first-party (SwiftUI, Charts, Network.framework, Observation, CryptoKit).
import PackageDescription

let package = Package(
    name: "studio-mac",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "StudioKit", targets: ["StudioKit"]),
        .executable(name: "Studio", targets: ["Studio"]),
    ],
    dependencies: [
        .package(url: "https://github.com/gonzalezreal/swift-markdown-ui", exact: "2.4.1"),
        .package(url: "https://github.com/raspu/Highlightr", exact: "2.2.1"),
        .package(url: "https://github.com/pointfreeco/swift-snapshot-testing", exact: "1.18.4"),
    ],
    targets: [
        .target(
            name: "StudioKit",
            dependencies: [
                .product(name: "MarkdownUI", package: "swift-markdown-ui"),
                .product(name: "Highlightr", package: "Highlightr"),
            ],
            path: "Sources/StudioKit",
            resources: [.copy("Resources/timeline-fixture.json")],
            swiftSettings: [
                .enableUpcomingFeature("ExistentialAny"),
            ]
        ),
        .executableTarget(
            name: "Studio",
            dependencies: ["StudioKit"],
            path: "Sources/Studio",
            swiftSettings: [
                .enableUpcomingFeature("ExistentialAny"),
            ]
        ),
        .testTarget(
            name: "StudioKitTests",
            dependencies: [
                "StudioKit",
                .product(name: "SnapshotTesting", package: "swift-snapshot-testing"),
            ],
            path: "Tests/StudioKitTests",
            exclude: ["__Snapshots__"],
            resources: [.copy("Fixtures")]
        ),
    ],
    swiftLanguageModes: [.v6]
)
