Build Kings — a multiplayer drinking game app for iOS (local pass-and-play).

Core mechanics:
- 2–6 players draw cards from a deck in turn order
- Each card (A–K, plus Joker) triggers a rule: e.g. "2 = You" (drinker picks someone), "5 = Guys", "K = King's Cup" (build communal cup with dares), "Joker = Make a rule"
- Players drink per the card rule; when the cup is empty or 10 turns pass, game ends with a recap
- Pass phone between players; each player sees only their own card until they pass

Key features:
- Local only (no server, no login)
- Customizable rules: edit card meanings before each game, save rulesets
- Game history: recap shows who drank most, funniest rule, timeline of rounds
- Sober mode toggle (default): uses "dare" language instead of drinking; activating drinking mode (17+ gate) swaps copy to drinking references but same mechanics

Tech:
- SwiftUI, local-first with CoreData for game history
- Phone must stay face-down while other player holds it; privacy shield until handoff
- Export game recap as a sharable image (name, date, player list, highlights)

Scope: MVP with Kings rules only (not Hearts, Asshole, or other variants). One ruleset bundled; let users customize before start.

## Change requested
The build produced sources but NO buildable Xcode project. Generate a complete working project wiring in all existing sources, then make it compile cleanly for the iOS Simulator.
