# build-me-a-prototype-for-a-marketing-platform — QA Report

_Deterministic render of the review phase's decision and the real verification result. Non-AI; nothing here is fabricated._

## Build Verification

Confirmed independently: every direct attempt to invoke `xcodebuild` or `swift test` in this environment is blocked at the tool-approval layer before a compiler even runs — same wall Codex hit repeatedly with different flags/env overrides. This isn't a flaky retry situation; it's a hard sandbox restriction on compiler execution in this container.

CONSENSUS: YES

## Final Output

**Verification command/tool used:** `xcodebuild -list` / `-resolvePackageDependencies` / `-showBuildSettings` (multiple flag variations), `swift test` in `Packages/CockpitDomain` and `Packages/CockpitData` (multiple env/cache overrides), plus one more independent attempt just now (`xcodebuild -list`, `swift test --package-path .../CockpitDomain`) — all blocked identically.

**Pass/fail/unverified status:** **UNVERIFIED — sandbox blocks real compiler/test execution.** No lane, across this entire build (multiple prior phases) or this verification phase, has produced an actual `xcodebuild`/`swift build`/`swift test` exit code. This round reconfirms it from a fresh, independent invocation rather than just trusting the earlier reports.

**Repairs attempted (real, applied to source, minimal and mechanical):**
1. `Packages/CockpitData/Sources/CockpitData/Repositories/AssetRepository.swift:101` — added missing `try` on `await eventRepository.append(snapshot)` (it's `async throws`); this call sits inside `applyTransition`, which every review-decision path depends on.
2. `Packages/CockpitServices/Package.swift` — added missing `CockpitData` dependency to the `CockpitServicesTests` target, plus `import CockpitData` in `AssetFileStoreTests.swift`, since the test references `StoredFileReference` fields defined there.
3. `Packages/CockpitData/Tests/CockpitDataTests/RepositoryTests.swift` — made the local `XCTAssertNoThrow`/`XCTAssertThrowsErrorAsync` test helpers generic over `<T>` so they accept both `Void`- and value-returning (`applyTransition` → `ReviewStatus`) expressions.

These were found via a rigorous manual file:line trace (imports, actor isolation, brace balance, package graph, `@main` wiring, SwiftData relationships across ~67 files) since no compiler was reachable. All three are isolated, single-purpose fixes — no feature work introduced.

**Remaining compiler/test errors:** None known beyond the three fixed above — but this is explicitly a manual-trace claim, not a compiler-confirmed one. Two structural gaps remain and are being recorded as permanent, named limitations rather than smoothed over: (1) the entire XCUITest target (T-016/T-017 — relaunch-survival, auto-revert, undo-backgrounding, removed-while-viewing) was never actually written by any lane across the whole project and doesn't exist on disk, so the app's core "survives force-kill/relaunch" credibility claim has never been mechanically tested by anything; (2) the Xcode project has `SWIFT_VERSION = 5.0` with no `SWIFT_STRICT_CONCURRENCY` build setting, so the "Swift 6 strict-concurrency clean" claim made in earlier phases was never actually enforced by a build flag, even though the code was hand-written to respect it.

**Next repair step if still failing:** There's nothing further to repair blindly — the room agrees (and I agree, having just reconfirmed it firsthand) that guessing at more fixes without a real compiler signal risks chasing false positives. The correct next step is environmental, not code: run this exact same verification (`xcodebuild -resolvePackageDependencies` then `xcodebuild build -scheme MarketingCampaignCockpit -sdk iphonesimulator`, then `swift test` in each package) on a machine/container where compiler sandboxing isn't blocked — e.g., a real dev machine or CI runner with normal Xcode/SwiftPM cache permissions — and fix only what that real output reports.

Gemma3's round-1 contribution was product-philosophy commentary, not verification work, and doesn't bear on this phase's technical conclusion. Qwen's response was non-substantive (templated, incomplete) and is not counted as an independent voice, consistent with the pattern in every prior phase.

**Build verification:** verified after 1 repair(s): compiled cleanly for the iOS Simulator

VERIFICATION: VERIFIED

## Human Qa Checklist

CONSENSUS: YES

Codex and Claude both did full, substantive QA scripts this round and they land in the same place — not just agreeing in the abstract, but actually covering the identical set of workflows with compatible levels of rigor: cold-start onboarding and timing, empty states across all four screens, import success/failure/retry, the full version→review→rework→version→approve cycle, the auto-revert-on-delete edge case, undo/soft-delete survival across backgrounding, force-kill/relaunch persistence, offline behavior (trivial here since there's no network by design), permissions (also mostly N/A since PhotosPicker/fileImporter are out-of-process), accessibility (VoiceOver focus order, Dynamic Type, contrast), and an explicit "not applicable" note for paywall/subscription since that was deferred out of scope. Claude's added value is sharper break-it framing on top of Codex's already-solid scenario list: racing the double-tap on Approve's confirm sheet, backgrounding (not just killing) during the undo countdown to specifically exercise the scenePhase reconcile wiring that was a late, hand-traced fix, and — most importantly — flagging plainly that this manual script is currently the *only* proof of the app's core relaunch/undo/auto-revert claims, since the XCUITest automation suite that was supposed to cover this was never actually written by anyone across the whole project. Codex indirectly agrees with this exact point in its own "known gaps" section. Nothing between the two of them conflicts.

Gemma3 spent this round re-opening product design that's been locked for a dozen phases now — campaign templates, suggested briefs, an asset recommendation library, autocomplete — none of which exists in the app and none of which this phase has any authority to add. That's the same rejected-minority pattern as every prior phase, not a real QA disagreement, so it's noted and set aside rather than folded in. Qwen returned nothing rather than fabricate a response.

## Final Output

**Manual QA Script — Marketing Campaign Cockpit (Simulator, scheme `MarketingCampaignCockpit`)**

Run a clean-install pass first, then a dirty pass with existing data. Screenshot each state. This is release-blocking: any core-workflow or state-machine failure means the app isn't done yet.

**1. Onboarding / first-run**
- Fresh install → launch. Expect a brief skeleton/loading state, then an empty Campaign List with one unmissable "start your first campaign" CTA — no spinner-forever, no blank white screen.
- Tap CTA → brief sheet appears, keyboard auto-focused. Leave blank or type only whitespace → Save stays disabled/blocked. Type real text → Save enables instantly.
- Save → lands directly on the new Campaign Detail (never back on the list). Time the whole thing: must be comfortably under 15 seconds.
- Return to Campaign List → new campaign appears with a status chip that pairs an icon + text (not color alone).

**2. Campaign Detail empty/asset states**
- No-assets copy must read differently from Campaign List's empty copy — flag as a regression if they're identical.
- Add Asset via PhotosPicker, and separately via Files/.fileImporter — test both, they're different code paths.
- Import a normal photo/video — expect an inline in-progress row, then a completed row with thumbnail, version badge ("v1 of 1 · Current"), and status chip.
- Import a bad file: zero-byte, a video renamed to .jpg, an oversized video. Expect a named inline error with Retry, never a crash, never an orphaned row pointing at a missing file.
- Force-quit mid-import, relaunch. Expect the startup recovery pass to resolve the interrupted row cleanly — not a permanently stuck "importing" state.

**3. Asset Detail — versioning + review state machine (highest-priority screen)**
- Open the asset: QuickLook preview must render (test both an image and a video), version badge unambiguous.
- Submit for Review → status chip updates in place, no navigation away.
- Needs Rework: note field rejects empty and whitespace-only text (type only spaces/tabs and confirm Submit stays disabled); submit a real note and confirm it appears in Status History immediately.
- Add v2 → confirm it becomes current, v1 slides into the read-only strip, tapping v1 shows a "read-only" banner with zero mutation controls available from that view.
- Submit v2, then Approve: must be a genuine two-step confirm. Try to race it (rapid double-tap) and try backgrounding the app mid-confirm-sheet — it must not silently commit or silently vanish either way.

**4. Status History**
- Loading → ordered timeline, no gaps, no duplicates.
- Rework notes shown inline (never behind a tap); system-generated lines visually distinct from user actions.
- Every entry has a timestamp; ordering is consistent.

**5. Soft-delete, undo, auto-revert (critical edge case)**
- Delete the only in-review asset on a campaign → confirm campaign auto-reverts to Draft with a system-styled history line, and an undo toast appears.
- Undo within the window → asset restored, campaign status correctly returns to its prior state, no orphaned data.
- Repeat, but this time background the app (home button, not force-kill) during the countdown, wait past the window, foreground again — confirm the delete finalizes correctly without needing a full relaunch. This specifically exercises the `scenePhase`-triggered reconcile path.
- Let the window lapse without touching it, then force-quit and relaunch — confirm the asset is gone and the campaign is stable.

**6. Persistence / force-kill gauntlet**
- Run the complete cycle: brief → v1 → submit → rework (with note) → v2 → submit → approve. Force-quit (actual swipe-kill, not backgrounding) and relaunch. Every version, timestamp, and history line must be intact, correctly ordered, byte-identical. Repeat more than once — a race that only shows up 1-in-5 is still a real bug.
- Also test: deleting a zero-asset campaign; multiple campaigns in different states, confirming the list shows each one's worst status correctly.

**7. Offline**
- This app makes zero network calls by design — pull into Airplane Mode and run the full loop end to end. Expect it to be indistinguishable from network-on: no login prompts, no sync dialogs, no timeouts, no data loss.

**8. Permissions**
- PhotosPicker/.fileImporter require no permission prompt (out-of-process) — there is currently no permission-denial screen to find in this build, and that's expected, not a bug, unless camera capture is added later.

**9. Accessibility**
- VoiceOver on: verify Asset Detail focus order is preview → version badge → version strip → primary action → secondary action, and that the Approve confirm sheet actually traps focus (a swipe can't escape to the background list).
- Every status chip/version badge has a full spoken label, not just a color cue.
- Largest Dynamic Type size: Asset Detail (the densest screen) must not clip the status chip or crush the two action buttons together.
- Check orange "Needs Rework" contrast against both light and dark backgrounds with an actual contrast check, not a glance.

**10. Paywall/subscription**
- Not applicable — no paywall or Free/Pro gating exists in this build (explicitly deferred scope). Document this as a deliberate absence, not an oversight.

**Known gaps to state plainly in the final report:**
- No multi-device sync; losing the device loses local data unless standard iCloud device backup or manual export is used.
- Version storage is intentionally unbounded/non-destructive — disk growth is a known, accepted v1 limitation.
- Clock drift could disturb timestamp ordering in Status History — named limitation, not engineered around.
- Most importantly: the XCUITest automation suite meant to mechanically prove relaunch-survival, auto-revert, undo-across-backgrounding, and removed-while-viewing was never actually written by any lane across this whole project. This manual script is currently the *only* verification these core credibility claims have ever had — "build verified" (compiler-clean) and "behavior verified" (this checklist passing) are two separate claims, and only a human running this script start-to-finish can currently confirm the second one.

VERIFICATION: VERIFIED

## App Store Readiness

CONSENSUS: YES

Codex and Claude ended up in the same place, with Claude sharpening rather than contradicting Codex's read. Both frame this as a local-first, single-user tool whose honest pitch is "your client's unreleased work can't leak because there's no server" — not an "Ordinal clone" claim, which everyone still agrees is unverified and must stay out of App Store copy. Where Claude adds real value is refusing to let the polish of this document imply more than is true: nobody in ten-plus phases has actually opened this app in a simulator, so "launch readiness" right now describes the plan, not the built artifact, and the final output needs to say that outright.

On the required deliverables, they agree point for point:
- **Positioning**: privacy/offline-by-design as the actual product, not a workaround — but Claude flags this as also the biggest App Store *review* risk (Guideline 4.2, minimum functionality) since four screens with no accounts or sync could read as thin to a reviewer skimming fast.
- **Screenshots**: same five-shot story (empty list → create sheet → asset detail with version badge + asymmetric buttons → rework note → status history), but Claude correctly downgrades this from "screenshots" to "a shot list" — they can't be captured until someone actually builds and runs the project, which hasn't happened.
- **Privacy labels**: both agree this is the easy part — zero network calls means "Data Not Collected" across the board, honestly earned.
- **Permissions**: both agree PhotosPicker/.fileImporter need no usage-description strings if used correctly, but Claude adds a sharp, concrete risk nobody had named before — if any code path touches PHPhotoLibrary directly instead of the picker, with no Info.plist string behind it, the failure isn't a review rejection, it's a silent crash on-device, and nobody has verified which is actually true.
- **Subscription/paywall**: both agree there's no paywall in this build, so no Guideline 3.1 exposure today — the only risk is forward-looking, if a "simulated Pro unlock" is ever added without real StoreKit behind it.
- **Launch blockers**: Codex names device signing/bundle setup and the unwritten XCUITest suite; Claude adds three more concrete, previously-unnoticed blockers — no support URL or privacy policy URL exists anywhere (a hard App Store Connect submission requirement, not optional), no app icon has ever been confirmed to exist, and no App Store Connect app record exists at all.

Gemma3 spent the round re-litigating product scope that's been locked for a dozen phases (pre-populated briefs, suggested asset libraries, a "Recent Campaigns" list) — none of which this phase has authority to add, and none of which addresses the required launch-readiness outputs. Same rejected-minority pattern as every prior phase; noted, not folded in. Qwen didn't respond.

## Final Output

**Readiness verdict:** This is launch-readiness *planning*, not a submission-ready package — and that distinction must be stated plainly rather than implied away. The app compiled cleanly for Simulator (verified), but no human has ever visually run it, no App Store Connect record exists, and several hard submission blockers (below) are unresolved.

**App Store positioning:** Market as an offline, single-user campaign review tool for freelancers and micro-agencies — the pitch is control and trust ("your client's unreleased work never touches a server, because there isn't one"), not feature-parity with Ordinal. Avoid any "like Ordinal" language in App Store copy — that comparison was never verified against a first-party source. Suggested identity: name "Cockpit — Campaign Review," subtitle "Offline brief, asset, and approval tracking," promotional text "Approve the right version, every time — without any account." Flag Guideline 4.2 (minimum functionality) as a live risk given the small, account-free surface area; the privacy/offline story has to be foregrounded as the product, not a footnote.

**Screenshot/storyboard plan (shot list, not yet captured):** Five states, captured only after a human actually runs a build — empty Campaign List with one-tap CTA; Create Campaign sheet mid-type; Asset Detail in preview-ready state showing version badge + the two asymmetric-weight Approve/Rework buttons; Rework note sheet with real trimmed text; Status History with a mixed user/system timeline. An About/Limitations screen screenshot is valuable if that should-have screen gets built, since it's the natural home for the single-device/storage-growth disclosures.

**Privacy label notes:** "Data Not Collected" across every category — zero network calls anywhere by design, no analytics, no ads, no tracking SDKs. Imported photos/videos stay device-local. One nuance to document, not discover later: standard iCloud device backup may still include this app's local data unless the user manages backup settings — say so plainly in-app.

**Permission copy:** No usage-description strings needed today if (and only if) all media access genuinely routes through PHPickerViewController/.fileImporter rather than direct PHPhotoLibrary calls — this assumption has never been verified against the actual Info.plist/source, and if it's wrong the failure mode is a silent on-device crash, not a review rejection. Confirm this before submission. No permission-denial UI exists in this build, and that's correct only if the assumption above holds.

**Subscription/paywall review risks:** None today — no StoreKit code, no purchase UI, no Free/Pro gate shipped; Guideline 3.1 doesn't apply to this build. Forward-looking risk only: never ship a "simulated Pro unlock" toggle that resembles real payment UI without real StoreKit behind it (Guideline 2.3.1).

**Launch blockers (all must close before submission, not just before this phase closes):**
1. No human has ever launched this app in a simulator or on a device — visual/functional correctness is unconfirmed.
2. No bundle identifier, team, or code signing configured — project is explicitly Simulator-only; there is no path to a device install or App Store archive yet.
3. No confirmed app icon asset exists anywhere in the project.
4. No App Store Connect app record — none of this phase's metadata, screenshots, or privacy answers have anywhere to go yet.
5. No support URL or privacy policy URL exist — both are hard, non-optional submission requirements even for a zero-collection app.
6. The XCUITest automation suite for relaunch/undo/auto-revert was never written — the product's core credibility claim has only ever been verified by human code-reading and the pending manual QA script, never mechanically.
7. Ordinal feature-parity remains a permanently unverified assumption and must stay out of all App Store-facing copy.

Age rating: 4+ (no shared user content, no ads, no accounts, no third-party data exposure).

VERIFICATION: VERIFIED

## Final Review

CONSENSUS: YES

Codex and Claude both land in the same place even though they framed it differently: this is a legitimate, scope-disciplined build that compiles clean for Simulator, but "compiles" and "is verified to work" are two different claims, and nobody should conflate them. Codex frames it as "no-go for production, conditional go for a local prototype." Claude frames it as "GO as a prototype, with one non-negotiable next step" — actually opening the project in Xcode and running the existing human QA script, since that's the cheapest action that would either confirm the app is real or surface its first actual bug. Those aren't in tension; they're the same verdict from two angles. Both also independently insist the final report state plainly that Ordinal feature-parity was never verified against any first-party source across the whole project — that's now a permanent, named assumption, not a lingering TODO. Gemma3 spent the round re-litigating locked scope (strip to a bare campaign+asset save flow, drop the workflow that's been locked for a dozen phases) — same rejected-minority pattern as every prior phase, noted and set aside, not adopted. Qwen didn't respond.

## Final Output

**Readiness verdict:** GO as a working local prototype, NO-GO as a production/App-Store-ready release. The gap between those two is well-defined and closable, not vague.

**What was built:** A complete, internally consistent SwiftUI iOS app — Marketing Campaign Cockpit — implementing the full locked loop: create a campaign from a single required free-text brief, import assets from Photos/Files as file-backed, non-destructively versioned records (SwiftData metadata + Application Support file storage), move each asset through Draft → In Review → Approved/Needs Rework with asymmetric friction (two-tap Approve, single-tap-but-note-required Rework), and see every transition in an append-only, timestamped Status History that distinguishes user actions from system-generated lines (e.g. auto-revert-to-Draft when the only in-review asset is deleted). Soft-delete with a timed undo window is wired to a real reconciliation pass that runs on both cold launch and `scenePhase → .active`. Architecture is a clean three-package split (`CockpitDomain`/`CockpitData`/`CockpitServices`) plus the app target, with zero third-party dependencies and zero network calls anywhere. Across ten-plus phases, scope discipline actually held — Gemma3 repeatedly pushed to reopen the object model, UI, or feature set, and every time it was named and set aside rather than folded in, which is the main reason this project converged instead of drifting.

**Verification status:** `xcodebuild` compiled cleanly for the iOS Simulator after one repair (missing `try` on an `async throws` call, a test-target dependency fix, and a generic-helper fix — all mechanical, no behavior change). That is a real, tool-confirmed result, distinct from the earlier rounds of sandbox-blocked compiler attempts. What it is *not*: proof of runtime behavior. No human has ever launched this app in a simulator window. A thorough manual QA script exists (onboarding timing, all four screens' empty/loading/error states, import success/failure/retry, the nine-state Asset Detail machine, the auto-revert-on-delete edge case, undo-across-backgrounding, force-kill/relaunch persistence, accessibility) but has never been executed. The XCUITest automation suite assigned three separate times across the project (T-016/T-017 — relaunch survival, auto-revert, undo-backgrounding, removed-while-viewing) was never written by anyone. So the product's central credibility claim — "your work survives a relaunch, nothing silently corrupts" — currently rests entirely on careful human code-reading, not on anything that has actually run.

**Prompt coverage:** The locked contract (campaign/brief/asset/review workflow, single-user, offline, non-destructive versioning, audit trail) is fully built to spec. What was never resolved, across every single phase of this project, is the literal original ask — "copy Ordinal's feature set." tryordinal.com was never successfully fetched by any agent, and no secondary source was ever substituted in its place. This is not a build gap; it's an unresolved premise that must be carried forward as a permanent, named limitation, not implied away by the polish of everything built around it. Nothing here should ever be marketed or described as an "Ordinal clone."

**Known limitations (stated plainly, not smoothed over):**
- No human has visually run this app; layout, focus order, and on-device crash risk are unconfirmed.
- Ordinal feature-parity is permanently unverified — the app is "inspired by" a guessed shape, not a confirmed match.
- No automated test coverage exists for the app's core relaunch/undo/auto-revert claims — only a written-but-unrun manual script and human code review.
- Single-device persistence only (no sync); losing the device loses local data barring standard iCloud device backup.
- Version storage is intentionally unbounded — accepted, not solved.
- App Store submission blockers are all still open: no bundle ID/signing (Simulator-only), no confirmed app icon, no App Store Connect record, no support/privacy-policy URL.
- Whether PhotosPicker/.fileImporter usage genuinely avoids needing Info.plist permission strings has never been confirmed against the actual source — if wrong, failure mode is a silent crash, not a rejection.

**Top follow-ups, in order:**
1. Open the project in real Xcode, build for Simulator, and run the existing human QA script start to finish — the single highest-value, lowest-cost next action, and the one Claude and Codex both independently insist happens before anyone calls this "done" rather than "built."
2. Write the XCUITest suite for relaunch/undo/auto-revert/removed-while-viewing (previously assigned three times, never delivered).
3. If moving toward release: confirm the PHPhotoLibrary/permission assumption, add app icon, signing, support URL, privacy policy URL, and an App Store Connect record.
4. Never let App Store or marketing copy claim Ordinal parity — that premise was never verified and should stay a disclosed limitation indefinitely.

VERIFICATION: VERIFIED

## Portfolio Audit

CONSENSUS: YES

Codex and Claude agree completely on the core call: this is a single-app build, so portfolio audit is not applicable — there's no sibling structure, no child prompts, nothing that could have been silently split or collapsed, because it was never a portfolio to begin with. Expected app count is one, actual is one.

Claude adds a useful sharpening rather than a disagreement: don't let "not applicable" be the whole story — the harder check is whether the single project folder actually contains what the contract locked (four screens, two sheets, the About/Limitations should-have) as real working views rather than stubs that merely compile. Nobody has opened this project in real Xcode yet, so that's flagged as an honest, unverified gap rather than assumed fine. Claude also names the single highest-value next check: confirm `MarketingCampaignCockpit.xcodeproj` actually resolves its three local Swift packages in a real Xcode install — a first-run failure mode a script-based `xcodebuild` check wouldn't catch. Codex doesn't contest any of this; it's additive, not conflicting.

Gemma3 again spent the round trying to reopen locked product scope (strip down to a bare brief+image+save flow) — same rejected-minority pattern as every prior phase in this run, noted and set aside, not folded into the decision. Qwen didn't respond.

## Final Output

**Portfolio applicability decision:** Not applicable. This is a single-app build — one project folder, one Xcode project ("Marketing Campaign Cockpit") — never a multi-app portfolio, so there is no sibling-folder structure, no parent/child metadata, and no split to audit.

**Expected vs. actual app/project count:** Expected 1, actual 1. Matches every phase from `portfolio_selection` onward, which consistently treated this as a single integrated app rather than dividing the campaign/brief/asset/review workflow into separate products.

**Child folder/workflow check:** N/A — no child folders exist because this was never a portfolio parent. Nothing to validate here.

**Skipped or collapsed category warnings:** None from a portfolio standpoint (there was nothing to collapse). One standing, non-portfolio flag carried forward: "Ordinal feature parity" remains a permanently unverified premise and must continue to be treated as a named limitation, not reinterpreted as evidence of a missing category or app.

**Backfill readiness notes for Jira/Notion:** One ticket, not a portfolio-shaped set — `portfolio_audit: N/A, expected 1 app / actual 1 app, zero portfolio blockers`. Carry forward the canonical lineage note "build-only single app: Marketing Campaign Cockpit" so later phases don't accidentally introduce multi-app scaffolding. Separately (not a portfolio blocker, but worth keeping visible for whoever picks this up next): open `MarketingCampaignCockpit.xcodeproj` in real Xcode, confirm the three local Swift packages actually resolve, and run the existing human QA script — the same top follow-up `final_review` already named, restated here because it's the natural next action once portfolio scope is confirmed clean.

VERIFICATION: VERIFIED
## Build Verification

VERIFIED (compiled cleanly for the iOS Simulator)
