---
id: DOC-BUGS
canonicalFor: known-defects
status: active
lastVerified: 2026-08-06
readWhen:
  - fixing a bug
  - checking known defects before claiming a feature is done
related:
  - ../quality/feature-contracts
  - RISKS.md
supersedes: []
---

# Bugs

Open product/engineering gaps tracked for launch. Pre-existing relative to App Factory onboarding (2026-07-16).

| ID | Severity | Area | Summary | Status | Evidence |
|----|----------|------|---------|--------|----------|
| B6 | high | Content | ~~Seed mantra set not human-signed off~~ | **resolved 2026-07-26** | Bundled spiritual seed content removed; neutral Counting + private custom labels remain |
| B-SIGN | high | Release | ~~Current release candidate could not reach App Store Connect~~ | **resolved for manual release 2026-08-06; automation deferred** | Build 2 uploaded through Xcode Organizer; `ASC_KEY_CONTENT` is required only for future unattended GitHub deployment |
| B-URL | high | Release | ~~Planned privacy and support URLs were not live~~ | **resolved 2026-07-29** | `/apps/mala/privacy/` and `/apps/mala/support/` both returned HTTP 200 with the public support email |
| B-A11Y | medium | Accessibility | VoiceOver is coded but VoiceOver support is out of scope by product decision (2026-08-14) — not a launch requirement for any version. Dynamic Type remains implemented and smoke-tested and is the app's accessibility baseline. | closed — out of scope | `Japa/Design/Theme.swift`; `JapaUITests.testPrimaryFlowAtAccessibilityTextSize`; MALA-7 |
| B-HAPT | medium | Haptics | Physical iPhone 16 Pro Max validation passed; automated tick-vs-completion spy coverage remains absent | partial | Device evidence 2026-07-18; FEAT-001 verification gap |
| B-DOC | low | Docs | ~~`README.md` and `docs/PROJECT_DOCUMENTATION.md` test counts outdated vs source~~ | **resolved 2026-07-17** | Corrected to 46+7=53 in README.md, docs/PROJECT_DOCUMENTATION.md, and LAUNCH_READINESS.md; confirmed by a passing `xcodebuild test` run |
| B-CI | medium | CI | ~~No GitHub Actions workflows~~ | **resolved 2026-07-17** | `.github/workflows/ios-ci.yml` added: XcodeGen, Release build, full tests |
| B-HIT | high | Practice UI | ~~On the 6.9-inch layout, the full-screen counting gesture could intercept History/Settings taps~~ | **resolved 2026-07-27** | Practice gesture excludes the top and bottom control bands; history UI flow passes on iPhone 17 Pro Max |
| B-HISTORY-TIME | low | History UI | ~~Sessions under one minute displayed seconds only instead of a consistent minutes-and-seconds duration~~ | **resolved 2026-07-28** | History now always uses `Xm Ys`; unit coverage verifies `0m 9s` and `2m 5s` |
| B-SESSION-DURATION | high | Practice/history | ~~Session duration used wall-clock time from the original controller start, including background/terminated gaps; “New round” also retained the prior round's start time~~ | **resolved 2026-07-28** | Foreground-active duration is persisted separately, lifecycle transitions pause/resume timing, every new round resets its timing origin, and legacy resumable snapshots preserve bead count without importing unknowable wall-clock duration |

## Closed relative to original launch blockers

Original B1–B5 / B8 (no app / no engine / no haptics / no privacy / no persistence) are **resolved in code**. B-DOC (stale test counts) and B-CI resolved 2026-07-17. Treat remaining items above as launch gates, not missing scaffolding.
