# Risks

| ID | Risk | Probability | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| AURA-R01 | Analysis feels generic or misleading. | high | high | Honest signal labels, deterministic fixtures, and user review. | Product worker | open |
| AURA-R02 | Camera/import/export fails on real devices. | medium | high | Physical matrix and interruption/permission tests. | iOS worker | open |
| AURA-R03 | App Store privacy declarations may not match media access. | low | high | Manifest and usage strings are regression-tested; complete the source-backed App Store Connect privacy review before upload. | Release owner | open |
| AURA-R04 | Paywall precedes a credible first result. | medium | high | Gate monetization work on core-loop verification. | Product owner | open |
| AURA-R15 | Apple account, agreements, roles, signing, or an existing build number blocks upload late. | medium | high | Resolve `AURA-OPS-009`–`012A` before final device QA; never assume Apple-system state from Xcode settings. | Release owner | open |
| AURA-R16 | Production StoreKit catalog differs from code or purchase/restore fails only in sandbox/TestFlight. | medium | high | Exact-ID catalog audit in `AURA-MON-008`; execute `AURA-QA-010` before final archive and internal distribution. | Monetization owner | open |
| AURA-R17 | Public URLs or App Store privacy/reviewer metadata contradict the binary and delay external review. | medium | high | Treat `AURA-MKT-004` and `AURA-LEG-003/004/005/008` as `TF-G3` gates; cross-review against Release behavior. | Release owner | open |
