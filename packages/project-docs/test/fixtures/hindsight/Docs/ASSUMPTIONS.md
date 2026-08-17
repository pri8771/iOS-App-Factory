# Assumptions

| ID | Assumption | Evidence | Validation plan | Status |
|---|---|---|---|---|
| HIND-A01 | Quick capture improves activation without weakening later analysis. | Current wizard is visibly dense. | Prototype field contract and uncoached timing study. | open |
| HIND-A02 | Demo data helps users understand reviews and Insights. | Empty simulator state communicates little. | Observe demo-onboarding comprehension and deletion. | open |
| HIND-A03 | Users return when a review becomes due. | Reminder/review loop exists in code. | Physical beta retention and notification QA. | open |
| HIND-A04 | Current statistics produce meaningful claims at low sample counts. | Charts exist; no test target. | Fixtures and minimum-sample rules. | open |
| HIND-A05 | Private group prediction lists create repeat use beyond solo capture. | Strong qualitative product fit; not yet tested with live groups. | Phase 1 prototype and private beta: group forecast and reveal return rate. | open |
| HIND-A06 | Receipts and direct challenges produce organic invites without unacceptable privacy incidents. | Sharing maps to existing group-chat behavior. | Measure safe share/open/join conversion plus report, revoke and accidental-share rates. | open |
| HIND-A07 | Users trust a Foresight Score based on proper scoring and can explain rank movement. | Proper scores are defensible but unfamiliar. | Formula simulations and comprehension tests before leaderboards launch. | open |
| HIND-A08 | Curated public events can be supplied and resolved quickly enough to sustain a public network. | No event operations history exists. | One-category pilot across multiple full event cycles with resolution SLO and correction rate. | open |
| HIND-A09 | iMessage reduces invitation friction enough to justify extension complexity. | Predictions already originate in chats; no measured Hindsight funnel. | Compare iMessage challenge completion against normal universal links in Phase 2 QA/beta. | open |
| HIND-A10 | Managed Postgres behind a versioned API can meet Phase 1 integrity and operations needs without a vendor iOS SDK. | Weighted architecture comparison favors relational transactions and portability; no spike evidence yet. | Run the ADR-008 synthetic auth/authorization/lock/realtime/APNs/restore/isolation spike and reject the direction if any critical case fails. | testing |
| HIND-A11 | A premium four-destination experience makes the invite → forecast → reveal loop understandable within 30 seconds. | Detailed design contract exists; no approved prototype or observed sessions yet. | Run the Claude Design prototype and five uncoached sessions; require at least 4/5 completion and accurate lock/audience comprehension. | open |
