# AuraFit local enrollment / Mac capability evidence (OR-24)

- Observed at UTC: 2026-09-08T14:14:37Z
- Source checkout (read-only): /Users/pchordia/Documents/wip_apps/ios_apps/aurafit
- Branch: release/1.0-3-full-free
- HEAD: 1b717b921a52b4612005eb102b5ac18a69b04993
- Tree: e50c36da7a1ebcf1ecaf5c4f880394568b2c72f8
- Porcelain empty: 0

## Instruction / enrollment file map

- present: AGENTS.md sha256=39753e29387f98dd3bee3dbf1f4c6f8f6cf2f7dd08087d85559be0829f6350dd
- present: .factory/AGENTS.factory.md sha256=dbf4b1b92f85bd1654006f8dca6c20de6064795ff464c4b31485de7dc1539c18
- present: .factory/project-context.json sha256=8c3ef83a99895f832e93742cf864612a6247a7610d59f12a8dabb35aa9b887f5
- present: .factory/standard-lock.json sha256=289e32eef8c4bd576dc918784ddf79b6bad2f882d9d97aabd5ad67e1de277eb1
- present: .factory/library-catalog.json sha256=31f756b36585e0bb3967547986d18c02c6eb1ed9f4707d8d9cc2d3f0e8a56684
- present: .factory/repository-map.json sha256=db4d7f236f9f062d50a0c66efeef31d23d66b36bbc693da0b2189ebe3c27b384
- present: quality/quality-manifest.json sha256=1e32fea92ba887348e84ac8a718b518b103b36d2462873282bd52a7789310dbb

## Xcode project identity (read-only)

```
Command line invocation:
    /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -list -project /Users/pchordia/Documents/wip_apps/ios_apps/aurafit/AuraFit.xcodeproj

Information about project "AuraFit":
    Targets:
        AuraFit
        AuraFitTests
        AuraFitUITests

    Build Configurations:
        Debug
        Release

    If no build configuration is specified and -scheme is not passed then "Release" is used.

    Schemes:
        AuraFit

```

- Bundle ID (from pbxproj PRODUCT_BUNDLE_IDENTIFIER lines): com.pchordia.aurafit
- Scheme: AuraFit
- Tracked archive configuration (accepted decision): Release

## Mac / toolchain (read-only)

- hostname: Apple-M5-Pro-87
- macOS: 26.6.2 (25G83)
- xcodebuild: Xcode 26.6 Build version 17F113
- xcode-select path: /Applications/Xcode.app/Contents/Developer
- Available simulators include AuraFitAgentDevice: 1

## Explicit unknowns (Apple / account / device — blockers, not confirmed)

- signing identities: unknown (Keychain not inspected)
- Developer Program membership/roles/agreements: unknown
- App Store Connect app record / Internal TestFlight group: unknown
- build allocation / next free build number: unknown
- physical device slot acceptance: unknown

## Enrollment change

- AuraFit product worktree not created; no AuraFit files modified.
- Factory-side local proof fixture added under fixtures/aurafit-local-proof/ (OR-22).
- Hindsight was not accessed.
