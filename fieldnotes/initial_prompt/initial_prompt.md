Build a polished, fully offline-first iOS voice-journaling app called
"Fieldnotes". Native Apple stack only: SwiftUI + SwiftData, AVFoundation
for recording, Speech framework for on-device transcription, Natural­
Language framework for on-device tagging/sentiment, PencilKit for sketch
annotations. No backend, no accounts, no network dependency for any core
feature — everything must work in airplane mode. Follow the
ios-app-factory-rules. If a requested capability needs something this
project genuinely cannot provide (a special Apple entitlement, a paid
developer account feature, server-side ML), do NOT fake or stub it —
record it as an explicit gap with what it would actually take.

Core features (complete over broad — ship fewer things fully working):

1. Voice entries: record audio journal entries with a live waveform
   view while recording. Recording must survive being interrupted by a
   phone call, Siri, or the app being backgrounded, and must resume
   or cleanly finalize the entry rather than corrupt/lose it — get
   AVAudioSession category/interruption handling genuinely right, this
   is the hardest technical part of the app.
2. On-device transcription: transcribe each recording using Speech
   framework (on-device recognition only — reject/flag if only
   server-based recognition is available for a locale). Transcript is
   editable after the fact; edits must not desync from the audio
   timeline (tapping a transcript sentence seeks the audio to that
   point).
3. Auto-tagging & mood: run NaturalLanguage tokenization/sentiment on
   each transcript to suggest tags and a mood score. Suggestions are
   editable/dismissible — never silently apply an AI guess as fact.
4. Sketch annotations: attach PencilKit sketches to any entry (finger
   or Pencil), stored alongside the audio/transcript.
5. Bi-directional linking: entries can @-mention/link other entries;
   each entry shows a "linked from" backlinks section computed live
   from the local store (no manual backlink maintenance) — same
   integrity discipline as a graph/notes app: linking, unlinking, and
   deleting an entry must never leave a dangling or duplicate backlink.
6. Search: full-text search across transcripts AND tags/mood, with
   results ranked by a real relevance score you define and document
   (not just substring match order).
7. HealthKit correlation (read-only, explicit permission): show each
   entry's mood alongside that day's HealthKit sleep/activity summary
   if authorized, and degrade to "not connected" honestly if denied —
   never block core journaling on this permission.
8. Home-screen widget + Live Activity: widget shows the latest entry's
   mood/snippet; a Live Activity shows elapsed time and live waveform
   while actively recording, ending cleanly when the recording stops
   or the app is killed mid-recording (no orphaned Live Activity).
9. Share Extension (separate target): accept shared text or a photo
   from other apps and create a new Fieldnotes entry from it.
10. App Intents: "Start a voice entry" and "Search my journal" exposed
    to Shortcuts/Siri.
11. CarPlay: a minimal CarPlay scene for hands-free start/stop
    recording while driving. This requires Apple's CarPlay audio-app
    entitlement, which a personal free developer account cannot
    obtain — if that's confirmed true in this environment, build the
    CarPlay scene code path correctly but record in Gaps that it
    cannot actually run/ship without that entitlement, rather than
    silently omitting the feature or pretending it works.

Priorities, in order: (a) audio-session interruption correctness — a
lost or corrupted recording is the worst possible failure, (b) backlink
graph integrity, (c) honest degradation of every permission-gated
feature (Speech, HealthKit, CarPlay). Use Decimal/Int for anything
numeric that isn't inherently floating (durations in seconds as
TimeInterval is fine; don't invent unnecessary Decimal use here — this
app's money-precision lesson from prior apps doesn't apply, there's no
currency). Seed a "demo entries" toggle in Settings with realistic
sample entries, transcripts, tags, and backlinks so no screen is empty
on first review. Provide a clear way to run it in the iOS Simulator via
Xcode, and call out anywhere CarPlay/HealthKit/Speech behave differently
in Simulator vs. a real device.

## Change requested
The app currently FAILS its release gate: UI crawl: declared user flow 'enable_demo_data' failed: step 4: expected ‘Morning walk by the harbor’ on screen (+6 more) — the app's ACTUAL interactive controls are: record.recordButton, Start recording, Recording, tap to stop, Recording saved, Timeline, Search, Settings, timeline.recordButton, Record a new voice entry, Your journal is quiet, Record your first voice entry — Fieldnotes transcribes and tags it on-device, automatically.. The declared flow may name labels the build never used; make the app expose the exact control the flow taps (add the affordance / set its accessibilityIdentifier), rather than leaving the promised journey unreachable.. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Screen graph, per-screen screenshots, dead taps, and flow results are in docs/ui_crawl/ and docs/ui_crawl.json — open the failing screen's screenshot before fixing.
