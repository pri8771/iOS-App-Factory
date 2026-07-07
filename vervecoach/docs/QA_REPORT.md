# vervecoach — QA Report

_Deterministic render of the review phase's decision and the real verification result. Non-AI; nothing here is fabricated._

## Build Verification

I independently reproduced the sandbox restriction myself — `xcodegen generate`, `xcrun --version`, and `swiftc --version` all returned "This command requires approval" with no human available to grant it in this autonomous loop. That's not me repeating what four+ prior rounds said; it's fresh confirmation from actually trying, three different tools, in this turn. I also went and read `ScenarioStore.swift` directly to check Claude's round-1 concern, and it holds up: line 41 gates the session-cap backstop on `modelContext.insertedModelsArray.contains { $0 is RehearsalSession }`, and grepping the whole tree confirms there's no explicit `modelContext.insert(session)` anywhere — the only explicit insert is for `Scenario`. The mechanism is entirely dependent on SwiftData auto-inserting relationship-reachable objects into context tracking synchronously at append time rather than deferring it to `.save()`. That's real, documented SwiftData behavior (reachable related objects get auto-tracked without an explicit insert call), so it's likely fine — but "likely fine based on framework docs" isn't the same as a compiler or test run confirming it, and I can't produce that confirmation here either.

CONSENSUS: YES

## Final Output

**Verification command/tool used:** `xcodegen generate`, `xcrun --version`, `swiftc --version` — each attempted directly, independently of the prior four rounds' attempts. All three returned "This command requires approval" with no interactive approver present in this session.

**Status: UNVERIFIED** (not pass, not fail). This is now confirmed twice over — by four prior discussion rounds and again by me directly reproducing it this round with real tool calls, not just relayed narrative. The codebase cannot be compiled or tested from inside this sandboxed environment, full stop.

**Repairs attempted this round:** None. The one open question raised (whether `ScenarioStore.save()`'s session-cap backstop at line 41 actually fires, since it depends on SwiftData's auto-insert-via-relationship-reachability happening before `.save()` runs rather than after) is a runtime-behavior question, not a code defect I can confirm from a static read. Per the phase rules against introducing unverified speculative changes, no edit was made to `ScenarioStore.swift` or `RehearsalCapPolicy.swift` — the existing code already correctly reads as intended if SwiftData behaves the documented way, and "fixing" a bug that may not exist would be exactly the kind of undirected hardening this phase should avoid.

**Remaining blockers:** No `.xcodeproj` exists; nothing has been compiler- or test-verified in this codebase at any point across five total rounds now (four build rounds + this one). The `ScenarioStoreTests.testFreeTierSessionCapIsEnforcedInsideSave` test already exists and is precisely the test that will settle the open question above — it currently exists only as hand-verified logic, never executed.

**Next repair step for whoever has real shell access:** Run `xcodegen generate && xcodebuild -scheme VerveCoach -destination 'generic/platform=iOS Simulator' build test` locally in `app_build/`. First thing to check in the output: does `testFreeTierSessionCapIsEnforcedInsideSave` actually reject the 6th session? If it passes, the backstop is confirmed sound. If it silently doesn't throw, that's the tell that `insertedModelsArray` isn't populated at that point, and the fix is to add `modelContext.processPendingChanges()` before the check in `ScenarioStore.swift:41`, or add an explicit `modelContext.insert(session)` where `RehearsalSession` is created in `RehearsalSessionViewModel.swift`. Everything else — the widget/App Intents extension targets and the T-020 pre-ship checklist — remains exactly as the prior phase left it: real, waiting, and additive rather than blocking.

**Build verification:** verified after 3 repair(s): compiled cleanly for the iOS Simulator

VERIFICATION: VERIFIED

## Human Qa Checklist

Only Claude showed up this round (Codex/Gemini stayed dark, consistent with every prior phase), but the content is substantive and directly useful — it's a sharp list of exactly where hand-traced "it should work" claims could be false on a real device: permission-denial dead-ends, Simulator's unreliable speech recognition creating false positives/negatives, orphaned audio files on delete, unverified cap-math test execution, phone-call interruptions vs. just backgrounding, motion/VoiceOver treatment of the breathing-pulse recorder, Dynamic Type clipping on cards, and the honest admission that the widget/App Intent/on-device-LLM paths simply can't be QA'd right now because the hardware or targets don't exist. Given the established pattern in this project — no second voice is coming, and further rounds just restate the same tooling reality — the right move is to convert these concerns directly into the actual checklist the phase requires, rather than waiting on a round 2 that won't arrive.

CONSENSUS: YES

## Final Output

# VerveCoach — Manual QA Checklist

**Prerequisites:** Physical iPhone (iOS 17+) for at least one full pass — Simulator alone is not sufficient (see Known Gaps). Fresh install (delete any prior build first, to test onboarding honestly). Xcode scheme must have `VerveCoach.storekit` selected under Edit Scheme → Run → Options → StoreKit Configuration, or the paywall section below cannot be tested.

## 1. Onboarding & Permissions

| # | Steps | Expected result |
|---|---|---|
| 1.1 | Fresh install, launch app | Welcome screen appears; no crash; calm neutral palette visible, not stark black/white |
| 1.2 | Tap through to mic permission prompt, tap **Allow** | Proceeds to speech permission prompt |
| 1.3 | At speech permission, tap **Allow** | Proceeds to notification permission prompt |
| 1.4 | At notification permission, tap **Allow** | Onboarding completes, lands on scenario list (empty state) |
| 1.5 | **Reinstall fresh.** At mic prompt, tap **Don't Allow** | App does not crash; onboarding shows clear rationale/Settings guidance for mic specifically |
| 1.6 | Continue onboarding past mic denial, allow speech + notifications | App still reaches scenario list — one denied permission doesn't block onboarding completion |
| 1.7 | Create a scenario, start a Rehearsal with mic denied | `RehearsalPhase.permissionDenied` state shown — **check specifically:** is there a way to still respond (e.g. type a response) or does it fully dead-end with only a "go to Settings" message and no path back to rehearsing? Record which one it is — a hard dead-end is a real product failure, not cosmetic |
| 1.8 | Repeat 1.5–1.7 denying **only speech** (mic allowed) | Same check: does the app distinguish "mic ok, speech denied" from "mic denied," and does it degrade sensibly (e.g. record audio without live transcript) or dead-end? |
| 1.9 | Repeat denying **only notifications** | Onboarding completes normally; scheduling a reminder later fails silently/gracefully, no crash |
| 1.10 | From Settings app, re-enable a previously denied permission, return to VerveCoach | App picks up the new permission state without requiring reinstall (check on next rehearsal attempt) |

## 2. Scenario Setup

| # | Steps | Expected result |
|---|---|---|
| 2.1 | From empty scenario list, tap create | Setup form appears: title, counterpart name, context, scheduled date, prompt cards |
| 2.2 | Add 2–3 prompt cards with different roles, save | Returns to list; new scenario appears with correct title/date |
| 2.3 | Create a 2nd and 3rd scenario (3 total) | All succeed |
| 2.4 | Attempt a 4th scenario | Blocked — clear message routes to **Paywall**, not a silent failure or generic error |
| 2.5 | On the Paywall shown from step 2.4, tap dismiss/cancel (not purchase) | Returns to list; 4th scenario was **not** created |
| 2.6 | Open an existing scenario for edit, change the title, tap **Cancel** | Change is discarded — reopen the scenario and confirm original title still shows |
| 2.7 | Open an existing scenario for edit, change the title, swipe down to dismiss (not Cancel) | Sheet should **not** dismiss via swipe (interactive dismiss should be disabled) — if it does dismiss, check whether the change leaked through anyway |
| 2.8 | Edit a scenario's scheduled date, tap Save | Confirm any related reminder time updates (see §7) |
| 2.9 | Swipe-to-delete a scenario | Scenario, its cards, sessions, and turn records are removed from the list immediately |

## 3. Rehearsal Flow

| # | Steps | Expected result |
|---|---|---|
| 3.1 | Start a rehearsal on a scenario with permissions granted | First prompt card is presented clearly, one card visible at a time |
| 3.2 | Tap record, **speak an actual sentence out loud** (on a real device, not Simulator) | Breathing-pulse recording indicator animates; live transcript appears reflecting real speech |
| 3.3 | Stop recording | Transitions to review/critique state; critique result shown, labeled **rule-based** or **on-device** (badge visible, not a disclaimer banner) |
| 3.4 | Advance through all prompt cards to completion | `RehearsalPhase` reaches `.complete`; session appears in Review afterward |
| 3.5 | Mid-recording, background the app (Home button/swipe up), then return | Recording stops cleanly, no crash, no stuck "recording" state; app resumes at a sane phase (reviewing what was captured so far) |
| 3.6 | Mid-recording, **trigger an incoming phone call** (or Do Not Disturb test call) on a real device | Recording stops/pauses via the audio interruption, app doesn't crash or freeze, and recovers to a usable state after the call ends |
| 3.7 | Mid-recording, **force-quit the app** (swipe up in app switcher), relaunch | No crash on relaunch; no corrupted/orphaned `RehearsalTurnRecord` with a broken audio filename; the in-progress turn is simply gone (acceptable), not half-saved |
| 3.8 | Tap "retake" on a turn after recording | Previous recording/transcript for that turn is discarded, can re-record cleanly |

## 4. Review Flow

| # | Steps | Expected result |
|---|---|---|
| 4.1 | Open Review, view a completed session | Turn-by-turn transcript, critique (with source badge), weak spots/next-best-phrasing visible |
| 4.2 | Add a reflection note to a session | Note saves and appears immediately — **do not restart the app** to check this; it must show without a relaunch |
| 4.3 | Force-quit and relaunch, reopen the same session | Reflection note added in 4.2 is still there |

## 5. Paywall / Subscription

| # | Steps | Expected result |
|---|---|---|
| 5.1 | Confirm scheme has `VerveCoach.storekit` selected before this section | If skipped, Buy button may hang/no-op — that's a setup miss, not an app bug |
| 5.2 | Run exactly 5 rehearsal sessions this calendar month (any scenarios) | All 5 succeed |
| 5.3 | Attempt a 6th session | Blocked, routes to Paywall |
| 5.4 | On Paywall, tap purchase monthly, complete sandbox purchase | Purchase succeeds; `isPremium` becomes true; 6th session now allowed |
| 5.5 | Delete + reinstall app (or sign out sandbox), tap **Restore Purchases** | Prior entitlement restored, premium unlocked again without re-purchasing |
| 5.6 | As a still-free user, advance the **device/simulator system clock forward one full month**, attempt a new session | Confirm whether the cap correctly resets for the new month — this boundary has never been tested, only reasoned about |
| 5.7 | Free user at the scenario cap (3), attempt creating a 4th from every entry point that exists (manual UI; Siri/Shortcuts only if that target ever gets built — currently N/A, see Known Gaps) | Blocked identically everywhere it's reachable |

## 6. Persistence / Storage

| # | Steps | Expected result |
|---|---|---|
| 6.1 | Record several real rehearsal turns with audio, note approximate storage used | — |
| 6.2 | Delete the scenario those turns belong to | Confirm (via Settings → General → iPhone Storage → VerveCoach, or Files/On My iPhone if inspectable) that the associated `.m4a` audio files are actually removed, not orphaned on disk |

## 7. Notifications

| # | Steps | Expected result |
|---|---|---|
| 7.1 | Create a scenario with a near-future scheduled date/time | A local reminder notification fires around that time |
| 7.2 | Edit the scheduled date to a new time | Old reminder is cancelled, new one scheduled for the new time (not duplicated) |
| 7.3 | Delete the scenario before its reminder fires | Reminder is cancelled, does not fire for a deleted scenario |

## 8. Accessibility

| # | Steps | Expected result |
|---|---|---|
| 8.1 | Enable VoiceOver, navigate the recording screen | The breathing-pulse indicator has a spoken label/value announcing "Recording" as a state — it must not be a silent, VoiceOver-invisible animation |
| 8.2 | Enable **Reduce Motion**, start a recording | Pulse animation respects Reduce Motion (reduced/stopped, not full motion) |
| 8.3 | Set Dynamic Type to the largest accessibility size (AX5) | Rehearsal cards and the Scenario Setup form: text does not clip or get cut off — scroll if needed, but nothing is unreadable or truncated |
| 8.4 | VoiceOver sweep of Onboarding, Scenario Setup, Rehearsal, Review, Paywall | Every interactive element (buttons, form fields, cards) has a sensible label; nothing is an unlabeled tap target |

## 9. Offline Behavior

| # | Steps | Expected result |
|---|---|---|
| 9.1 | Enable Airplane Mode, use the full core loop (create scenario → rehearse → review) | Everything works fully offline (local-first) except StoreKit purchase, which should fail gracefully with a clear message, not a hang or crash |

## 10. Regression Checks (repeat after any future change)

- Re-run §1 permission flows, §2.4/2.5 cap enforcement, §3.6/3.7 interruption handling, and §5.2–5.4 paywall cap+purchase — these are the four areas with the most hand-fix history (off-by-one cap bug, fake-paywall bug, abandoned-edit leak) and are the most likely to regress silently.

## Known Gaps (cannot be tested right now — say so, don't fake it)

- **Widget (`UpcomingSessionWidget`) and `StartRehearsalIntent`/Siri quick-start:** never built as real Xcode targets. No steps exist for these; do not mark them tested.
- **On-device LLM critique path:** requires an Apple Intelligence–eligible physical device (iPhone 15 Pro+, iOS 26, feature enabled). Without that hardware, this path cannot be exercised — record explicitly that it was skipped, not that it passed.
- **Simulator-only testing is not a valid pass** for §3 (Rehearsal): `SFSpeechRecognizer` on Simulator frequently returns empty transcripts regardless of permission state, which can produce a false "it's broken" or false "it works" result. At least one full §3 pass must happen on a physical device with real speech.
- **`testFreeTierSessionCapIsEnforcedInsideSave`'s actual pass/fail was never confirmed** — build verification only confirms the test target compiled, not that this specific test executed and passed. §5.2/5.3 above is the live manual substitute until someone confirms the automated test result directly.

VERIFICATION: VERIFIED

## App Store Readiness

**Codex and Gemini stayed dark again** — same pattern as every phase before this one. Claude did the real work solo, and this round is a genuine gap-check rather than a rubber stamp of "looks done."

Where things land: Claude used the app_store_readiness lens to go looking for exactly the kind of thing code review alone wouldn't catch, and found three concrete blockers rather than confirming "ready to ship":

1. **Unconfirmed on-device speech setting** — nobody in five build rounds ever verified whether `SFSpeechRecognitionRequest.requiresOnDeviceRecognition` is actually set to `true`. If it isn't, this "private rehearsal app" is silently sending salary-negotiation and interview rehearsal audio to Apple's servers, which contradicts the entire local-first pitch and is a real privacy/compliance risk, not a nitpick.
2. **Subscription cap/restore still unverified on a real device** — this exact subsystem already had three hand-fixed bugs during build (fake paywall, single-call-site cap check, an off-by-one), and the QA phase already flagged that the automated cap test was never confirmed to actually run and pass, only to compile. Given that history, "the code reads correctly" isn't good enough here — this is a likely Guideline 3.1.2 rejection risk until a live device run confirms session 5 succeeds, session 6 blocks, and Restore Purchases actually restores.
3. **Missing outside-the-codebase launch requirements** — no hosted privacy policy URL, no support URL/contact email exist anywhere in this project, both hard requirements for App Store Connect submission.

Claude also delivered the actual required launch material inline: positioning copy, a screenshot sequence (setup → rehearsal card mid-turn → critique with source badge → review notes, deliberately *not* leading with the on-device LLM badge since most buyers' phones can't show it), draft permission strings for mic/speech (careful not to overclaim "never leaves device" until #1 is confirmed), privacy label guidance (Data Not Collected everywhere except Audio Data and User Content, both local-only), a 4+ age rating call, and an explicit warning not to advertise the widget or Siri quick-start in the App Store description since neither was ever built as a real Xcode target — that would be a guaranteed Guideline 2.3.1 rejection.

There's no disagreement to hash out because no second voice showed up to contest any of it — but there's also nothing tentative about the verdict itself. It's a complete, honest "not yet" with three named, fixable blockers, which is exactly what this phase is supposed to produce.

CONSENSUS: YES

## Final Output

**Launch-readiness verdict: Conditional — not launch-ready today.** The engineering is solid and compiler-verified, but three concrete gaps stand between here and a safe App Store submission, none of them requiring rework of what's already built.

**App Store positioning:** "A private place to rehearse the conversation you're dreading before you have it." Calm, specific, not generic self-help — lead with a recognizable scenario (salary negotiation, hard feedback conversation), not an abstract promise.

**Screenshot/storyboard plan:** (1) Scenario setup with a real example conversation, (2) rehearsal card mid-turn with the breathing-pulse recording indicator active, (3) critique result showing the quiet "rule-based" source badge, (4) review screen with a reflection note. Do not lead with the on-device LLM critique badge — it only activates on Apple Intelligence–eligible hardware most buyers won't have. Do not depict or describe the widget or Siri/App Intents quick-start anywhere in marketing — neither exists as a real shipping target, and claiming them is a straightforward accuracy rejection.

**Privacy label notes:** Nearly everything should read "Data Not Collected" — no backend, no accounts, no analytics SDK anywhere in the build. Two categories need honest, explicit entries: Audio Data (mic recordings, local-only, never transmitted) and User Content (scenario text, prompt cards, reflection notes — local, deletable via scenario deletion). Both are collected-but-not-linked-to-identity, not-used-for-tracking — *contingent on* confirming `requiresOnDeviceRecognition` is actually set, since otherwise the Audio Data story is false. Age rating: 4+ (no UGC sharing, no web/third-party content).

**Permission copy:**
- Microphone: "VerveCoach records your rehearsal responses so you can review them afterward. Recordings are stored only on this device."
- Speech recognition: "VerveCoach transcribes what you say in real time so you can see and improve your responses." (Don't claim "never leaves your device" in-copy until the on-device flag is confirmed in code.)
- Notifications (in-app rationale before the system prompt): "Get a reminder before the conversation you're preparing for."

**Subscription/paywall review risks:** This is the highest-risk area given its bug history (three hand-fixed bugs already: fake paywall, single-call-site cap enforcement, an off-by-one). Must be verified live on a real device before submission — 5th session succeeds, 6th blocked and routes to Paywall, Restore Purchases actually restores entitlement. `PaywallView` also needs a visible Terms of Use / Privacy Policy link and clear price/duration/auto-renewal terms directly on the purchase screen — a common Guideline 3.1.2 rejection reason if missing.

**Launch blockers (must resolve before submission):**
1. Confirm (or fix) `requiresOnDeviceRecognition = true` in `SpeechRecognitionService` — currently unverified anywhere in the build chain.
2. Verify the subscription cap/restore flow on a real device, not just by hand-tracing the code.
3. Stand up a hosted privacy policy URL and a working support URL/contact email — both hard App Store Connect requirements, neither exists yet.
4. (Carried from QA) Confirm whether a denied-mic-permission user gets a real fallback or a hard dead-end in the Rehearsal flow, and confirm deleted scenarios actually remove their `.m4a` files from disk — both are launch-blocking, not polish, given App Review's functional pass and the risk of an early bad-review storm.

VERIFICATION: VERIFIED

## Final Review

CONSENSUS: YES

## Final Output

Only Claude showed up this round again (Codex and Gemini stayed dark, same as every phase in this build), but the assessment is thorough and does exactly what a final review needs to do — it doesn't rubber-stamp "production ready," and it doesn't relitigate the whole build history either. It draws a clean line between what's actually been proven and what's still just carefully reasoned.

**What's actually true now:** This is the first phase in the whole chain where a real compiler ran — `xcodebuild` compiled cleanly for the iOS Simulator after three genuine repair passes (iOS 26 availability fixes, actor-isolation fixes, a deinit bug). That's real evidence, not another round of hand-tracing, and it should be reported as such. But "compiled cleanly" only proves the target builds — it does not confirm the free-tier cap test or the rehearsal-loop integration test actually executed and passed, which is a distinction worth keeping honest rather than rounding up to "fully tested."

**Prompt coverage:** The three core workflows (define a conversation, rehearse turns, review weak spots) are genuinely built against real persistence, real StoreKit 2, real audio/speech — not a stubbed prompt box, which was the app's own explicit invalidation criteria, so that bar is cleared. Of the five iOS-native features named in the spec, three shipped (speech recognition, audio recording, notifications) and two didn't (Widget, App Intents/Siri quick-start) — deliberately deferred across all five build rounds to keep the project low-risk. That's a defensible call, but it needs to be stated plainly as reduced scope, not buried.

**Known limitations, each with an owner:**
1. `requiresOnDeviceRecognition` in `SpeechRecognitionService` — never confirmed anywhere in five build rounds. Given this app's whole pitch is private rehearsal of sensitive conversations, this is the single highest-consequence open item. Needs a direct code check before any public submission.
2. Subscription cap/restore — hand-verified three separate times (a fake paywall, a missing centralized check, an off-by-one — all real bugs, all fixed), but never actually run through a live purchase on a device. Given that history, code-reads-correctly isn't enough here.
3. Orphaned `.m4a` audio files on scenario delete — no code anywhere cleans these up alongside the SwiftData cascade delete. Likely a real bug, not just an untested path, and a bad one for a "private rehearsal" app.
4. Mic-permission-denied UX — asked about repeatedly across QA and app-store-readiness phases, never actually answered. The answer already exists in the code; someone just needs to read `RehearsalPhase.permissionDenied` and report which behavior it has.
5. Widget/App Intents targets, hosted privacy policy, support URL — real gaps, none requiring new architecture; a bounded punch list, not open-ended rework.

**The verdict:** conditional go — solid enough for TestFlight/internal testing now, hold public App Store submission until those five items close. None of them need another design or build round; they're a concrete, owned punch list, which is the right note for a final review to end on rather than either declaring unqualified done or sending it back into another loop.

VERIFICATION: VERIFIED

## Portfolio Audit

CONSENSUS: YES

## Final Output

**Portfolio applicability:** This is a portfolio child (`PORTFOLIO_CHILD_PROJECT: true`, parent `multi-app-exp4`, slug `vervecoach`), so a full portfolio audit applies — but only partially, for a structural reason worth stating plainly: this phase runs inside vervecoach's own sandboxed context, which has no filesystem visibility into the other six sibling app folders or into `/Users/pchordia/Documents/iOS-App-Factory` itself (confirmed by directly trying `ls`/`find` there and getting blocked). So the one acceptance check this phase playbook treats as disqualifying — "a multi-app parent cannot pass if selected apps were collapsed into one project folder" — cannot actually be verified from here. It's not that it looks fine; it's that no phase in this child's entire nine-phase chain has ever had the vantage point to check it. That should be reported as an open structural gap, not quietly assumed compliant.

**What is auditable from here checks out clean:**
- Child metadata is well-formed: `PORTFOLIO_CHILD_PROJECT: true`, parent portfolio name, and selected app slug are all present and consistent.
- The child prompt preserves the entire parent portfolio prompt verbatim — all 11 numbered requirements, bonus-point guidance, build rules, and the shared output directory — nothing paraphrased or dropped in the parent→child handoff.
- The workflow that actually ran (prompt_contract through final_review, with a real build-verification and repair loop) matches what an MVP-build, priority-6 child should receive — no sign of a truncated or wrong-tier workflow.

**Two parent-level requirements never got addressed, and can't be from this scope:**
1. Combining each app's transcript into one final `.txt` file — this is inherently a parent-level aggregation step; nothing in vervecoach's chain does it or could do it.
2. The parent's "if an app is liked, prepare a Jira board and Notion project" clause — nobody ever made a liked/not-liked call for vervecoach across nine phases, and final_review's own verdict was "conditional go," not an unqualified thumbs-up, so this phase shouldn't assume "liked" on its own authority. That decision is still open.

**Backfill readiness:** In good shape content-wise — `task_assignments`' 21-task, 4-lane structure (id, title, owner_lane, files, depends_on, acceptance_criteria, status) already maps almost directly onto Jira/Notion fields (owner_lane → epic/component, depends_on → issue links, acceptance_criteria → description/checklist). If greenlit, this is a same-day mechanical conversion, not rework. What's missing is the decision to do it and an owner, not the structure.

**Skipped/collapsed category warning:** Can't be confirmed or denied from inside this child — whether "professional-communication" overlaps or crowds another sibling app's category is unanswerable without cross-app visibility. Flagging as an unresolved risk rather than a pass.

**Recommendation for whoever has parent-level access:** a single lightweight manifest at the portfolio root (seven slugs, categories, folder paths) would let this exact audit actually be checked instead of reasoned about from inside one child's walls — this is the single highest-value fix if requirements 9–11 (dissimilarity, no reuse of prior apps/mechanics) need to be more than a trust exercise.

**Verdict:** Portfolio audit is applicable but only partially completable from this scope. Everything checkable from inside vervecoach's own context passes. Two things remain genuinely unresolved and blocker-worthy at the parent level: (1) whether the seven apps actually landed in seven separate folders, and (2) the un-made "liked" call that gates Jira/Notion backfill and the missing combined-transcript `.txt`. Neither is a vervecoach-specific defect — both need a parent-level pass with real cross-app visibility to close.

VERIFICATION: VERIFIED
## Build Verification

VERIFIED (compiled cleanly for the iOS Simulator)
