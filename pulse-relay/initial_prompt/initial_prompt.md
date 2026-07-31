Design and build a complex, production-shaped native iOS app that requires a
real server-side backend (not local-only, not a static/offline app) — pick a
genuinely creative, non-obvious idea that solves a real, specific pain point
well enough that it has a real shot at organic/viral growth. Do not default
to another todo-list, habit-tracker, journaling, or AI-wrapper app — those
categories are saturated and none of them are "unique." Think harder for an
underserved, emotionally sticky, inherently-social-or-real-time problem
where a mobile client + backend architecture is actually necessary (real-time
sync across users/devices, a shared/live data feed, matching or coordination
between people, server-side processing too heavy for on-device, etc.) — the
backend requirement should come from the idea being genuinely multi-user or
real-time, not be bolted on.

Requirements for the idea itself (spend real effort on this — the idea is
the deliverable, not just the code):
- Solves one specific, sharply-defined pain point for a specific audience
  (not "everyone"). Be able to state the pain point and audience in one
  sentence each.
- Has a natural viral/sharing loop baked into the core mechanic — not a
  bolted-on "invite friends" button, but something where using the app is
  inherently more valuable or fun with other people, or naturally produces
  something worth sharing outside the app.
- Genuinely requires a backend: real-time multiplayer/sync, a live shared
  feed, server-side matching/aggregation, push notifications driven by
  server-side events, or similar — justify the architecture choice.
- Is creative enough that a stranger hearing the one-line pitch would say
  "oh that's clever" rather than "isn't that just [existing app]?"

Technical scope:
- Native iOS client (SwiftUI).
- A real backend service (your choice of stack — pick something sensible
  and justify it) handling auth, data sync/storage, and whatever real-time
  or server-side logic the concept needs.
- Design the API contract, data model, and sync/real-time strategy properly
  before building — this is a "complicated app," not an MVP toy.
- Production-shaped: reasonable auth flow, error handling, loading/empty/
  offline states, and a coherent onboarding funnel a real user could follow.
- Visual design should be distinctive and match the concept — not generic
  default SwiftUI styling — but the primary bar for this app is the idea,
  the architecture, and it actually working end-to-end (client <-> backend).

Start by proposing and committing to the specific concept (pain point,
audience, viral loop, and why it needs a backend) before moving into specs
and build, and carry that concept consistently through naming, design, and
onboarding copy.

## Change requested
The app currently FAILS its release gate: UI crawl: declared user flow 'Cold start, sign in, create a pod' failed: step 2: expected ‘podOnboarding.createPodButton’ on screen (+7 more) — the app's ACTUAL interactive controls are: authGate.signInWithAppleButton, Sign in with Apple. The declared flow may name labels the build never used; make the app expose the exact control the flow taps (add the affordance / set its accessibilityIdentifier), rather than leaving the promised journey unreachable.. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Screen graph, per-screen screenshots, dead taps, and flow results are in docs/ui_crawl/ and docs/ui_crawl.json — open the failing screen's screenshot before fixing.
