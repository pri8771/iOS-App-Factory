Build a polished, fully offline iOS spaced-repetition flashcard app called "Recall". Native Apple stack ONLY: SwiftUI + SwiftData for persistence, Swift Charts for stats. No backend, no accounts, no third-party SDKs, no network of any kind — the app must work in airplane mode forever, all data on-device. Follow the ios-app-factory-rules. Runnable in the iOS Simulator via Xcode; provide clear run instructions.

HARD RULE ON GAPS: Anything that would need infrastructure this project cannot provide (cloud sync, shared/community decks, a deck marketplace) must NOT be faked or stubbed. Record each honestly as a gap with a short note on what building it for real would take. Do not add placeholder UI that pretends these work.

CORE FEATURES (favor complete over broad):
1. Decks & cards: create/edit/archive decks; cards have a front, back, and optional note. Card editing must be fast and keyboard-friendly.
2. Spaced-repetition scheduling: implement the SM-2 algorithm (ease factor, interval, repetition count) with Again/Hard/Good/Easy grading. THIS IS THE HEART OF THE APP. Implement it as its own standalone, pure, tested module — provably right, not plausibly right. Unit tests MUST cover: first reviews, lapses resetting the interval, ease-factor floors, and day-boundary handling in the device's local time zone (a "day" is a calendar day).
3. Review session: shows due cards for a chosen deck (or all decks); front → tap to reveal → grade. Session summary at end (cards reviewed, again-rate, time spent). Must handle interruption gracefully — quitting mid-session loses nothing.
4. Stats: per-deck and overall — due-forecast bar chart for next 30 days, daily review-count history, and retention rate (% graded Good/Easy). Handle empty and sparse data gracefully.
5. Deck import/export: export any deck to CSV; import cards from a two-column CSV (front, back) with a preview step and per-row error reporting — never silently drop a row.
6. Review reminders: one optional LOCAL notification per day ("You have N cards due") at a user-chosen time; respect permission denial gracefully. No push, no server.

PRIORITIES (in order): (1) SM-2 module correctness above all — proven via its tests; (2) review-flow speed; (3) honest empty states. Include a "demo data" toggle in Settings that seeds two decks with a realistic review history so stats screens are never empty on first look.

## Change requested
The app currently FAILS its release gate: UI crawl: declared user flow 'Enable demo data and review all decks' failed: step 1: no tappable element ‘rootTab.settingsTab’ (+5 more) — the app's ACTUAL interactive controls are: Decks. The declared flow may name labels the build never used; make the app expose the exact control the flow taps (add the affordance / set its accessibilityIdentifier), rather than leaving the promised journey unreachable.. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Screen graph, per-screen screenshots, dead taps, and flow results are in docs/ui_crawl/ and docs/ui_crawl.json — open the failing screen's screenshot before fixing.
