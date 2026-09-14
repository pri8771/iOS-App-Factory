Build a native iOS Solitaire (Klondike) game — SwiftUI, 100% local, zero
network calls, zero sign-in/accounts/analytics/telemetry of any kind. No
backend. All state (stats, settings, saved game) persists on-device only.

THE CENTRAL CONSTRAINT — READ THIS FIRST: this must be a real, fully
playable, correctly-rules-implemented Klondike solitaire game. Drag-and-drop
(or tap-to-move) card interaction, legal-move validation, win detection,
undo, new-game/deal, and a stock/waste/foundation/tableau layout that
actually works. Do not let the visual ambition come at the cost of the game
being playable and correct — a beautiful app that can't be played is a
failure.

VISUAL DESIGN — THIS IS THE PART THAT MUST WIN AWARDS:
Cards must look like real, tactile playing cards — not the generic flat
rounded-rectangles-with-tiny-corner-pips that every solitaire clone uses.
Invent a genuinely original custom card face system: bespoke rank/suit
typography or iconography (not SF Symbols reused as suit glyphs), a
consistent illustrated or generative pattern language across all 52 cards
and the card back, real card-stock texture/shadow/lighting, and satisfying
physical motion (cards should feel like they have weight — spring-based
drag, believable flip/deal animation, subtle parallax or depth).

The bar: this should look and feel like something from an Apple Design
Award reel, not a tutorial app. Judge yourself against that bar throughout
— if a screen looks like a stock SwiftUI solitaire tutorial, it has failed
the brief. One clear, original visual "hook" (an art direction, a material
language, a signature interaction) should be identifiable in one glance
that no other solitaire app has.

Also include: light/dark mode (both fully art-directed, not just inverted
colors), haptics on card moves/wins, a stats screen (games played/won,
best time, streak — all local), and a settings screen (draw-1 vs draw-3,
card back selection, timer on/off).

Ship something that could realistically be submitted to the App Store today
and be visually distinctive in a screenshot alone.

## Change requested
The app currently FAILS its release gate: design lint: 21 design/dependency lint error(s) — e.g. inline_color at DesignSystem/Theme.swift:120 (hardcoded color — use a DesignSystem token). Full list in docs/design_lint.json. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Full findings with file:line are in docs/design_lint.json — fix EVERY error entry.
