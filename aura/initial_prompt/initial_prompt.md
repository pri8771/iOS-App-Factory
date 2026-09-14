Build a visually stunning, fully offline iOS app called "Aura" — a
daily generative "vibe card." Native Apple stack only: SwiftUI +
SwiftData, Core Image / Metal (CIFilter compositions or a custom
Metal shader) for procedural generative art, Swift Charts for the
recap view, StoreKit 2 for local in-app purchases (no backend needed —
App Store handles receipts/entitlements locally). No accounts, no
network, no third-party SDKs — everything on-device, forever. Follow
the ios-app-factory-rules.

CONCEPT: once a day, the user answers 2-3 quick prompts (a mood
picker, one or two tap-to-select word/emoji chips, optionally the
on-device time of day). From that input plus a per-day deterministic
seed, generate a unique abstract generative-art "Aura" card — think
painterly gradient blooms, particle fields, or flow-field line art,
NOT a literal illustration — paired with a short generated caption
built from a curated local phrase bank (never a hallucinated/unsafe
LLM call — this is deterministic, on-device, and instant). The card
must look genuinely beautiful: this is the single most important
requirement in this build. If the generative output looks like
placeholder gradients or a design-101 exercise, the build has failed
its actual goal even if it compiles and passes gates.

CORE FEATURES (favor complete over broad):
1. Daily check-in flow: fast (under 10 seconds), delightful, satisfying
   micro-interactions (haptics, spring animations) on every tap. Once
   completed, locked until the next calendar day (device local time
   zone) — handle timezone travel and DST without allowing two cards
   the "same day" or skipping a day.
2. Generative card engine: a real, documented deterministic algorithm
   mapping (date seed + mood + chips) -> a reproducible but visually
   varied composition (palette, shape field, motion-blur/particle
   density). Same inputs on the same day always render the same card;
   different days must feel meaningfully different from each other,
   not like the same template recolored. This is the technical heart
   of the app — treat it with the same rigor as an algorithm module,
   not incidental UI.
3. Collection & streaks: a scrollable archive/grid of past cards
   (like a photo grid), a streak counter, and a "your Aura over time"
   trend view (mood distribution via Swift Charts).
4. Monthly/seasonal "Wrapped": after each calendar month, generate a
   shareable recap — a short animated sequence or a single composite
   poster of that month's dominant palette/mood story (Spotify-Wrapped
   style). This is a primary viral surface — must render as a
   beautiful, portrait (9:16) export.
5. Share export: every single card AND the monthly Wrapped must export
   as a high-resolution image (and ideally a short looping video/Live
   Photo-style clip of the generative animation) sized correctly for
   Instagram/TikTok Stories (1080x1920), via the native share sheet.
   A small, tasteful, dismissible-only-via-purchase watermark on free
   exports is the monetization hook (see below) — it must never be so
   intrusive it kills the shareability that drives virality.
6. Monetization (StoreKit 2, local only): one non-consumable "Aura+"
   unlock via native IAP removing the export watermark and unlocking
   extra palette themes + the ability to regenerate a card once per
   day if unsatisfied (free tier: no regeneration). Handle purchase,
   restore purchases, and the Simulator's inability to complete real
   StoreKit transactions honestly — use a local StoreKit configuration
   file for Simulator testing and say so explicitly, don't fake a
   purchase succeeding without going through StoreKit's real API.
7. Widget: home-screen widget showing today's card once generated, or
   an inviting "your Aura is waiting" state before check-in.
8. Notifications (local only, opt-in): a gentle daily reminder if the
   user hasn't checked in yet, respecting Focus/Do Not Disturb norms
   and permission denial gracefully.

PRIORITIES, in order: (a) the generative art must be genuinely
beautiful and varied — treat this as a design/craft problem, iterate
on the actual visual output, not just "does it render"; (b) the
deterministic seeding algorithm must be correct and tested (same
inputs -> same card, always); (c) the share-export pipeline must
produce real, correctly-sized, good-looking image/video files, not a
plain screenshot of the UI. Seed a "demo history" toggle with 30+ days
of varied past cards so the archive/Wrapped/trend screens are never
empty on first review. Provide a clear way to run it in the iOS
Simulator via Xcode, and honestly flag anything StoreKit-transaction-
related that cannot be fully verified without a real device/sandbox
account.

## Change requested
The app currently FAILS its release gate: design lint: 2 design/dependency lint error(s) — e.g. inline_color at Rendering/AuraRenderer.swift:372 (hardcoded color — use a DesignSystem token). Full list in docs/design_lint.json. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Full findings with file:line are in docs/design_lint.json — fix EVERY error entry.
