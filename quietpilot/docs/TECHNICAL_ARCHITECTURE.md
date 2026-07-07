# quietpilot — Technical Architecture

_Deterministic render of the design/spec/planning phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Design Discussion

CONSENSUS: YES

Codex came back and explicitly took the side Claude was arguing for — no tab bar, single Room Home as the dominant surface, with capture/proposal/trend/settings as pushed secondary screens, not equal-weight tabs — and gave his own reasoning for it (protecting the "one daily question" ritual, not spending permanent chrome on a room switcher that most users, capped at 1-3 rooms, will barely use). On the capture screen, Codex agreed to modal exclusivity too, and Claude sharpened it into a concrete fourth state: "extracting/deleting" as its own visible beat distinct from recording and from success/cancelled, specifically so the raw-audio-deletion promise is something the user can actually see happen, not just take on faith. Both sides are now fully aligned with no open threads — this closes the phase.

## Final Output

**Screen inventory (7 screens, no tab bar):**
1. **Onboarding/Permissions** — mic rationale first, calendar rationale only when negotiation is first requested; each denial has its own recovery screen with a path to Settings.
2. **Room Setup** — name, optional color/icon, activity default, optional "start first capture" CTA, room-cap messaging tied to tier (free = 1, paid ≤ 3).
3. **Room Home** (the sole primary/persistent destination) — scrollable single screen; room switcher only surfaces once a second room exists.
4. **Capture** — full-screen modal, entered from a persistent floating action on Room Home.
5. **Proposal/Negotiation** — pushed from Room Home once the room is in the "ready" state.
6. **Trend/Review** — pushed secondary screen, built around the room-change marker.
7. **Settings** — pushed secondary screen, intentionally low-visual-priority (permissions status, erase-all-data, export, recompute-now, subscription management).

**Primary user flow:** grant mic permission → create/select room (capped by tier) → Room Home shows one of three truths → tap floating capture action → full-screen capture (ready → recording → extracting/deleting → success-or-cancelled) → return to Room Home with updated last-session comparison and heatmap settle animation → once the room clears both confidence gates, a proposal card appears on Room Home → push into Proposal screen → accept, or reject-and-re-propose (visually distinguished as date-chip shift vs. time-track shift) → after 3 rejects, terminal "no viable windows today" state with three equal-weight recovery actions. Secondary flows given equal design weight: denied-mic path, denied-calendar path, capture-cancelled-with-retry, and the trend screen's before/after room-change comparison.

**State model per screen:**
- *Room Home:* no-room (empty) → room-loading → sample-insufficient → sample-unstable (visually and semantically distinct from insufficient) → confident-ready → error-reload.
- *Capture (modal):* ready-to-record → recording → extracting/deleting (its own explicit beat — visibly shows the raw audio being deleted, not folded into a generic spinner) → extracted-success, or cancelled(reason)+retry at any interruption/backgrounding/route-change.
- *Proposal:* generating-candidates → proposal-ready → candidate-evaluated (accept/reject) → terminal-no-windows-today (three recovery actions) → post-accept stale-check/manual-refresh state.
- *Trend:* zero-data → rendering → loaded → export-success → export-error.
- *Settings:* normal → permission-needed → operation-in-progress → completion/error.

**Visual direction:** muted steel-and-aurora neutrals with a single accent family, no neon; restrained single-spring motion reserved for real state transitions; the waveform-to-heatmap settle animation is a trust signal (with a single haptic tick on lock-in, not a barrage), not decoration; strict, legible type scale; generous whitespace preserved specifically because the no-tab-bar decision frees up chrome space that would otherwise be spent on permanent nav.

**Accessibility notes:** 44pt minimum targets everywhere; every heatmap cell and waveform state needs a real spoken-equivalent value (not "chart, image"); Reduce Motion cuts straight to the settled/final state rather than an abrupt animation skip; confidence/status language always renders in solid high-contrast text even where the surrounding visualization is deliberately hazy — the haze belongs to the chart, never to the words; no color-only status coding anywhere.

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
