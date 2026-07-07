# vervecoach — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Design Handoff

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Ios Architecture Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Tech Specs

Good — round 9 finally got real content on the table after the spend-limit outage cleared enough for one contributor to work. Since Codex and Gemini never showed up across all nine rounds, and this is the forced final round, I'm calling it: Claude's proposal is the decision. It's the only concrete, coherent architecture anyone put forward, it directly answers every gap the Quality Gate flagged (SwiftData persistence with a clear justification, module layout, full data model set, a rule-based-first critique strategy that avoids the device-eligibility trap the original prompt explicitly warned about, and a state-machine-driven rehearsal flow instead of boolean-flag navigation), and it satisfies the phase's required output list end to end.

The one thing worth flagging forward rather than re-litigating here: nobody adversarially challenged the SwiftData-vs-hand-rolled-store call or the two-provider critique split, since no second voice ever arrived. That's a reasonable risk to accept given the alternative is stalling the phase a tenth time — the choices are conservative, Apple-framework-first, and testable, which is what the playbook actually asks for.

CONSENSUS: YES

## Final Output

VerveCoach's architecture is settled as follows:

**Persistence:** SwiftData (not a hand-rolled JSON store) — gives free relationships between Scenario → RehearsalSession → RehearsalTurnRecord, free lightweight migration, and satisfies the "Apple frameworks first, no third-party dependency" rule. Audio recordings are **not** stored as blobs in SwiftData — they're written as `.m4a` files to the app's Application Support directory, referenced by filename from `RehearsalTurnRecord`. This keeps queries fast and keeps the door open for CloudKit sync later without a rewrite.

**Module layout:**
- `Models/` — the SwiftData schema (data_domain): `Scenario`, `PromptCard`, `RehearsalSession`, `RehearsalTurnRecord`, `ReflectionNote`, `CritiqueResult`.
- `Services/` — hardware- and work-facing services (services_utilities): `SpeechRecognitionService` (wraps `SFSpeechRecognizer`), `AudioRecordingService` (wraps `AVAudioRecorder`), `ScenarioStore` (thin wrapper over `ModelContext` so view models stay testable), `EntitlementStore` (StoreKit 2-backed paywall/entitlement check), and the critique split below.
- `Features/` — one folder per workflow (primary_ui): Onboarding, ScenarioSetup, Rehearsal, Review, Paywall, each with its own `@Observable` view model.
- `Widgets/` and `AppIntents/` — separate targets (polish_resilience) so quick-start intents, the upcoming-session widget, and notifications never block the core rehearsal loop from building and testing independently.

**Critique strategy (the device-eligibility-trap fix):** a `CritiqueProviding` protocol with two implementations. `RuleBasedCritiqueProvider` ships to 100% of users and does real analysis — filler-word detection, hedging-language detection, pacing against the card's expected response — and is the tested default path, not a fallback bolted on later. `OnDeviceLLMCritiqueProvider` only activates behind a runtime `isAvailable` check against on-device model eligibility, and is treated purely as an enhancement layer, never the sole critique path. Every `CritiqueResult` records its `source` so the UI can be honest with users about which engine produced it.

**Rehearsal flow:** driven by a single deterministic `RehearsalPhase` enum (`.presentingCard`, `.recording`, `.reviewingResponse`, `.critiquing`, `.complete`) owned by `RehearsalSessionViewModel` — no tangle of `NavigationLink`s and boolean flags, which avoids the "back button leaves you mid-recording" bug class.

**Testing:** `ScenarioStore` and `CritiqueProviding` are protocols specifically so view models can be unit-tested against fakes, covering rehearsal-flow state transitions and session persistence at minimum.

This is the contract the parallel build lanes (data_domain, primary_ui, services_utilities, polish_resilience) code against going forward.

```interfaces-json
{"interfaces": [
  {"name": "ConversationRole", "kind": "enum", "language": "swift", "signature": "enum ConversationRole: String, Codable { case user, counterpart }", "owning_lane": "data_domain", "notes": "Who speaks a given PromptCard turn."},
  {"name": "Scenario", "kind": "struct", "language": "swift", "signature": "@Model final class Scenario { var id: UUID; var title: String; var conversationKind: String; var counterpartName: String; var context: String; var scheduledFor: Date?; var createdAt: Date; var cards: [PromptCard]; var sessions: [RehearsalSession] }", "owning_lane": "data_domain", "notes": "Root entity for a defined upcoming conversation. conversationKind is a free string tag (e.g. 'salary_negotiation') not a closed enum, so users/rule engine can extend it."},
  {"name": "PromptCard", "kind": "struct", "language": "swift", "signature": "@Model final class PromptCard { var id: UUID; var scenarioID: UUID; var order: Int; var role: ConversationRole; var promptText: String; var expectedResponseHint: String? }", "owning_lane": "data_domain", "notes": "One likely turn in the conversation, ordered within a Scenario."},
  {"name": "RehearsalSession", "kind": "struct", "language": "swift", "signature": "@Model final class RehearsalSession { var id: UUID; var scenarioID: UUID; var startedAt: Date; var endedAt: Date?; var turnRecords: [RehearsalTurnRecord]; var reflectionNotes: [ReflectionNote] }", "owning_lane": "data_domain", "notes": "One full run-through of a Scenario's cards."},
  {"name": "RehearsalTurnRecord", "kind": "struct", "language": "swift", "signature": "@Model final class RehearsalTurnRecord { var id: UUID; var sessionID: UUID; var cardID: UUID; var transcript: String; var audioFilename: String?; var durationSeconds: Double; var critique: CritiqueResult? }", "owning_lane": "data_domain", "notes": "audioFilename references a file in Application Support, never stored as blob data."},
  {"name": "ReflectionNote", "kind": "struct", "language": "swift", "signature": "@Model final class ReflectionNote { var id: UUID; var sessionID: UUID; var text: String; var createdAt: Date }", "owning_lane": "data_domain", "notes": "Free-text weak-spot / next-best-phrasing note attached to a session."},
  {"name": "CritiqueResult", "kind": "struct", "language": "swift", "signature": "struct CritiqueResult: Codable { var strengths: [String]; var weakSpots: [String]; var suggestedPhrasing: [String]; var source: CritiqueSource; var generatedAt: Date }", "owning_lane": "data_domain", "notes": "Embedded/codable value, not its own @Model, since it's owned 1:1 by a RehearsalTurnRecord."},
  {"name": "CritiqueSource", "kind": "enum", "language": "swift", "signature": "enum CritiqueSource: String, Codable { case ruleBased, onDeviceModel }", "owning_lane": "data_domain", "notes": "UI must always show which engine produced a critique so users trust the rule-based default and aren't confused by quality variance."},
  {"name": "CritiqueProviding", "kind": "protocol", "language": "swift", "signature": "protocol CritiqueProviding: Sendable { func critique(response: String, forCard card: PromptCard) async -> CritiqueResult }", "owning_lane": "services_utilities", "notes": "RuleBasedCritiqueProvider always available; OnDeviceLLMCritiqueProvider checked via isAvailable before use, never assumed."},
  {"name": "RuleBasedCritiqueProvider", "kind": "struct", "language": "swift", "signature": "struct RuleBasedCritiqueProvider: CritiqueProviding { func critique(response: String, forCard card: PromptCard) async -> CritiqueResult }", "owning_lane": "services_utilities", "notes": "Ships to 100% of devices; detects filler words, hedging language, response length vs. expectedResponseHint."},
  {"name": "OnDeviceLLMCritiqueProvider", "kind": "struct", "language": "swift", "signature": "struct OnDeviceLLMCritiqueProvider: CritiqueProviding { static var isAvailable: Bool { get }; func critique(response: String, forCard card: PromptCard) async -> CritiqueResult }", "owning_lane": "services_utilities", "notes": "isAvailable gates on device/OS Foundation Models eligibility; never the sole critique path, purely additive enhancement."},
  {"name": "SpeechRecognitionService", "kind": "protocol", "language": "swift", "signature": "protocol SpeechRecognitionService: Sendable { func startTranscribing() async throws -> AsyncStream<String>; func stop() }", "owning_lane": "services_utilities", "notes": "Wraps SFSpeechRecognizer; must handle authorization denial as a first-class state, not a crash."},
  {"name": "AudioRecordingService", "kind": "protocol", "language": "swift", "signature": "protocol AudioRecordingService: Sendable { func startRecording() throws -> URL; func stopRecording() -> URL; var currentDuration: Double { get } }", "owning_lane": "services_utilities", "notes": "Wraps AVAudioRecorder, writes .m4a to Application Support, returns filename for RehearsalTurnRecord.audioFilename."},
  {"name": "ScenarioStore", "kind": "protocol", "language": "swift", "signature": "protocol ScenarioStore: Sendable { func save(_ scenario: Scenario) throws; func fetchAll() throws -> [Scenario]; func delete(_ scenario: Scenario) throws }", "owning_lane": "services_utilities", "notes": "Thin wrapper over ModelContext so view models never touch SwiftData directly, keeping them testable with a fake store."},
  {"name": "EntitlementStore", "kind": "protocol", "language": "swift", "signature": "protocol EntitlementStore: Sendable { var isPremium: Bool { get }; func refresh() async }", "owning_lane": "services_utilities", "notes": "Backed by StoreKit 2 Transaction.currentEntitlements; free tier caps active Scenarios and RehearsalSessions per month."},
  {"name": "RehearsalPhase", "kind": "enum", "language": "swift", "signature": "enum RehearsalPhase: Equatable { case presentingCard(PromptCard); case recording(PromptCard); case reviewingResponse(PromptCard, transcript: String); case critiquing(PromptCard); case complete }", "owning_lane": "primary_ui", "notes": "Single source of truth driving RehearsalSessionViewModel navigation; no boolean-flag navigation."},
  {"name": "RehearsalSessionViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class RehearsalSessionViewModel { var phase: RehearsalPhase; func advance() async; func retakeCurrentTurn() }", "owning_lane": "primary_ui", "notes": "Owns the state machine for one live rehearsal run; consumes SpeechRecognitionService, AudioRecordingService, CritiqueProviding."},
  {"name": "ScenarioSetupViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class ScenarioSetupViewModel { var draft: Scenario; func addCard(role: ConversationRole, text: String); func save() throws }", "owning_lane": "primary_ui", "notes": "Backs the manual scenario/card setup flow."},
  {"name": "ReviewViewModel", "kind": "struct", "language": "swift", "signature": "@Observable @MainActor final class ReviewViewModel { var sessions: [RehearsalSession]; func addReflectionNote(_ text: String, to session: RehearsalSession) throws }", "owning_lane": "primary_ui", "notes": "Backs session history / weak-spot review screen."},
  {"name": "StartRehearsalIntent", "kind": "struct", "language": "swift", "signature": "struct StartRehearsalIntent: AppIntent { static var title: LocalizedStringResource; func perform() async throws -> some IntentResult }", "owning_lane": "polish_resilience", "notes": "App Intent for Siri/Shortcuts quick rehearsal start on a given Scenario."},
  {"name": "UpcomingSessionWidget", "kind": "struct", "language": "swift", "signature": "struct UpcomingSessionWidget: Widget { var body: some WidgetConfiguration }", "owning_lane": "polish_resilience", "notes": "WidgetKit surface showing next scheduled Scenario; reads via App Group shared container, not direct SwiftData access."},
  {"name": "NotificationScheduler", "kind": "protocol", "language": "swift", "signature": "protocol NotificationScheduler: Sendable { func scheduleReminder(for scenario: Scenario) throws; func cancelReminder(for scenario: Scenario) }", "owning_lane": "polish_resilience", "notes": "Wraps UNUserNotificationCenter for pre-conversation rehearsal reminders."}
]}
```

## Project Plan

Round 2 was really just Claude stress-testing its own round-1 plan since Codex and Gemini stayed dark again, and it found two real gaps worth closing rather than just restating the plan:

1. The widget/App-Group sync isn't just an "owner needed later" item — the actual snapshot contract (an `UpcomingScenarioSnapshot`-style Codable struct and its write/read shape) needs to be nailed down *during* the foundation milestone, since it's a contract between data_domain and polish_resilience. Leaving it loose invites a shape mismatch that only surfaces at pre-ship time.

2. A new one: the free-tier session cap can't just live inside the manual scenario-setup UI. `StartRehearsalIntent` (the Siri/Shortcuts quick-start) is a second entry point into starting rehearsals, and if entitlement checks aren't pushed down into the service/store layer, a free user could bypass the paywall entirely via Siri. Fix is cheap now — check entitlement once in the shared layer, not per-UI-entry-point.

Claude's own call: given Codex/Gemini have now missed two full rounds (echoing exactly what happened in tech_specs for nine rounds before anyone else contributed), it's arguing we shouldn't hold the phase open hoping for a third voice — lock in this plan now.

I agree with that read. The plan is concrete, self-corrected once already, and covers everything the phase playbook requires (milestones, dependencies, risk mitigations, verification plan) without leaving testing or integration as vague end-of-project polish. No one has raised a substantive objection to any part of it.

CONSENSUS: YES

## Final Output

**Milestone 1 — Foundation (blocking, must land before any lane parallelizes):**
- Real Xcode project with actual target membership: main app target, widget extension target, App Intents extension, App Group entitlement wired into both the app and widget targets from day one.
- SwiftData schema (`Scenario`, `PromptCard`, `RehearsalSession`, `RehearsalTurnRecord`, `ReflectionNote`, `CritiqueResult`/`CritiqueSource`) and `ScenarioStore` sitting in front of it — no other lane codes against a fake/in-memory store.
- The App Group snapshot contract: a small Codable struct (e.g. `UpcomingScenarioSnapshot`) plus the write/read rules for when it gets written (create/edit/delete/reschedule of a Scenario) — decided now even though the widget UI itself is built later.

**Milestone 2 — Three parallel lanes (unblocked once foundation lands):**
- **services_utilities:** `AudioRecordingService`, `SpeechRecognitionService`, `EntitlementStore`, and both critique providers (`RuleBasedCritiqueProvider` and `OnDeviceLLMCritiqueProvider`) built together in the same milestone — the LLM path is never a staggered "if time allows" add-on, since that's exactly how it would ship unsafely gated. Entitlement/session-cap enforcement lives here, in the store/service layer, so every entry point (manual UI and App Intents) respects the same cap.
- **primary_ui:** ScenarioSetup, Rehearsal, and Review flows built against protocols/fakes so they're not blocked on real service implementations. `RehearsalPhase` needs its permission-denial states (mic/speech denied) designed in before the flow is built, not patched in after.
- **polish_resilience:** `NotificationScheduler`, the widget (consuming the snapshot contract from Milestone 1 — never reading SwiftData directly), and `StartRehearsalIntent` — built against the shared entitlement check from services_utilities, not a separate gate.

**Dependencies called out explicitly (not left implicit):**
- Widget → App Group snapshot contract (owned across data_domain/polish_resilience, defined in Milestone 1).
- StartRehearsalIntent → EntitlementStore/ScenarioStore's shared cap check (not a separate paywall gate).
- Rehearsal flow → permission-denial states designed into `RehearsalPhase` before the flow is implemented.
- StoreKit sandbox testing → local StoreKit configuration file must exist before EntitlementStore is exercised by UI.

**Risk mitigations:**
- Device-eligibility trap: rule-based and on-device-LLM critique providers built in the same milestone, tested with `isAvailable == false` as the primary case (since that's what most real devices/simulators report), not the happy path.
- Paywall bypass: entitlement checks centralized in the service/store layer so Siri/Shortcuts quick-start can't walk around the free-tier cap.
- Widget staleness/fake-data risk: snapshot contract defined upfront so the widget lane never has to stub data it later forgets to replace.

**Verification plan (three checkpoints, not one end-of-project pass):**
1. After foundation: smoke test that the app and widget targets both build, and a fake Scenario round-trips through `ScenarioStore`.
2. As soon as the minimum pieces exist (don't wait for "integration week"): a full end-to-end rehearsal session — record → transcribe → critique (rule-based) → save — since every other feature depends on this path being solid.
3. Pre-ship: permission-denial states, StoreKit sandbox purchase/restore, and the widget/App Group sync reflecting a real newly-created scenario rather than stale or stubbed data.

## Implementation Readiness Gate

Round 1 was Claude flying solo again (Codex and Gemini both stayed dark), but this time the content is decisive rather than exploratory. Claude did what this gate is actually supposed to do: it stress-tested the whole chain instead of rubber-stamping it, found that the engineering side (architecture → tech specs → project plan → tasks) is genuinely solid and consistent, but caught that the *design* side is basically empty — prompt_contract, product brief, design_discussion, and design_handoff all show nothing but spend-limit errors, so five feature teams were about to build five screens with no shared visual language. Rather than kicking the whole thing back for a design phase that might also come back empty, Claude resolved it inline with a concrete visual direction, plus closed three other silent gaps (free-tier numbers, StoreKit product IDs, iOS deployment target) that would have otherwise been invented ad hoc mid-build. No second voice showed up to challenge or add to any of this, so there's no open disagreement — just one proposal that resolved its own blocker.

CONSENSUS: YES

## Final Output

**Readiness verdict:** Conditional pass. The engineering chain (architecture, tech specs, project plan, tasks) is coherent and buildable as-is. The one real blocker — a missing design handoff — is resolved below as a named scope decision rather than left for engineering to invent. With that plus four smaller gaps folded into existing task acceptance criteria, the build phase can start.

**Cross-phase consistency check:** Architecture, tech specs, project plan, and task assignments agree with each other on every major point (SwiftData persistence, the two-provider critique split with rule-based as the always-available default, the App Group snapshot contract, the shared `RehearsalCapPolicy` used by both manual UI and `StartRehearsalIntent`, permission-denial states built into `RehearsalPhase` from the start). The break in the chain is upstream: prompt_contract, product brief, design_discussion, and design_handoff never produced real output (spend-limit errors throughout), so every downstream phase built against a single paragraph of design direction from the original app spec rather than an actual design system.

**Build blockers and fixes:**
1. **No design handoff exists.** Fix — lock in this visual direction as the shared contract for T-011–T-015: calm neutral base (off-white/charcoal, not stark black-on-white), one confident accent color reserved for active-recording and primary-action states only, generous corner radii/whitespace on rehearsal cards so each reads as one focused object per turn, a slow breathing-pulse recording indicator (not a blinking red dot — wrong emotional register for an anxious user), and critique results badged quietly by source ("rule-based" / "on-device") rather than a disclaimer banner.
2. **Free-tier caps were never numbered.** Fix — 3 active scenarios and 5 rehearsal sessions per calendar month on free tier; encode directly into T-008's `RehearsalCapPolicy`.
3. **StoreKit product config undefined.** Fix — single premium subscription, two durations: `com.vervecoach.premium.monthly` and `com.vervecoach.premium.annual`, no tiering. Goes into T-008's `VerveCoach.storekit`.
4. **No stated iOS deployment target.** Fix — iOS 17.0 for the app itself; `OnDeviceLLMCritiqueProvider.isAvailable` continues to gate Apple Intelligence eligibility at runtime, never via deployment target.
5. **Privacy strings and accessibility aren't explicit acceptance criteria anywhere.** Fix — add `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription` to T-001's acceptance criteria (missing them is a first-request crash, not a polish gap), and add a VoiceOver + Dynamic Type pass across the five feature flows to T-020's pre-ship checklist.

**Final scope for build:** Unchanged from task_assignments' 21-task, 4-lane backlog (data_domain foundation → services_utilities / primary_ui / polish_resilience in parallel → integration + pre-ship close-out), with the five fixes above folded into the acceptance criteria of T-001, T-008, T-011–T-015, and T-020. No new tasks, no new lanes, no architecture changes.

**Acceptance criteria checklist (per phase playbook):**
- ✅ Build phase can start without inventing product/design/architecture decisions — the five gaps above are now decided, not left open.
- ✅ Every major workflow (Onboarding, ScenarioSetup, Rehearsal, Review, Paywall, widget, App Intent) already has acceptance criteria from task_assignments, now extended with the design/privacy/accessibility additions.
- ✅ Testing responsibilities are explicit — per-lane unit tests, services_utilities owns the full rehearsal-loop integration test, polish_resilience owns the pre-ship checklist (now including VoiceOver/Dynamic Type).
