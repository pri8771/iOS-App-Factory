# dharma-trail — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

Round 2 closes both gaps the quality gate flagged, cleanly and without reopening anything else. Settings now has a real state model, and the scarier gap — what happens when a completed session's persistence write fails — got a genuinely careful answer rather than a quick patch. Nothing else in the round changed; the screen inventory, primary flow, visual direction, and accessibility notes all stand as they were.

CONSENSUS: YES

## Final Output

Carrying forward everything from round 1 (screen inventory, primary flow, visual direction, accessibility notes — all unchanged), plus the two additions that close this phase out:

**Settings screen — state model (new):**
- **Loading:** on appear, checks current StoreKit entitlement and live `UNUserNotificationCenter` authorization status (not a cached flag) — modeled explicitly since StoreKit checks cross a real async boundary.
- **Success:** shows current plan/renewal date if subscribed, notification toggle reflecting actual current OS authorization status.
- **Error:** "couldn't verify your subscription right now" with manual Restore Purchases and retry — and critically, an unverified check never downgrades access. Last-known-good local entitlement stays in effect until a fresh check either confirms or actively revokes it. A subscriber's second trail must never appear to lock itself just because a status check hiccuped — that would read as the app erasing a paying user's progress, the same trust failure already guarded against on the Trail screen.

**Session Complete — save-failure path (new):**
- Completion is now explicitly sequenced as attempt-save-first, branch-on-result — the celebratory trail-advance/streak-tick transition only ever renders after a confirmed successful write. It is never shown speculatively.
- If the save fails, the user sees a calm, non-punitive "your session didn't save — let's try again" state with a retry that re-attempts the write against the already-completed-in-memory session data (not a redo of the session itself).
- If retries keep failing, the state changes again — not an infinite retry button, but an explicit "this is being held safely and will retry automatically on next launch" state, so a frustrated user closing the app doesn't lose the completion.
- This joins force-quit and abandoned-session as siblings under one governing rule: there is no path in this app where the UI shows trail/streak advancement that isn't backed by a confirmed persisted write.

Both additions are treated as extensions of principles already locked in earlier phases (re-check-live-status-don't-cache from the notification work; never-silently-count-as-complete from the force-quit/abandon states) rather than new mechanisms, so nothing else in the design needs to change to accommodate them. This closes the design_discussion phase for dharma-trail.

## Design Handoff

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Ios Architecture Review

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Tech Specs

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Project Plan

You've hit your monthly spend limit · raise it at claude.ai/settings/usage

## Implementation Readiness Gate

You've hit your monthly spend limit · raise it at claude.ai/settings/usage
