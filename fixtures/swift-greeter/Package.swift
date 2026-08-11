// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "SwiftGreeterFixture",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "Greeter", targets: ["Greeter"]),
    ],
    targets: [
        .target(name: "Greeter"),
        .testTarget(name: "GreeterTests", dependencies: ["Greeter"]),
    ]
)
