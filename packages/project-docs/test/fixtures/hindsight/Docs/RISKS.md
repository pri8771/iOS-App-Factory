# Risks

| ID | Risk | Probability | Impact | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| HIND-R01 | Capture abandonment from too many required fields. | high | high | Approve and implement quick-capture contract. | Product worker | open |
| HIND-R02 | Insights imply patterns from insufficient data. | high | high | Sample thresholds, explanatory states, and statistics tests. | Insights worker | open |
| HIND-R03 | Demo records mix with or delete user records. | low | high | Stable identifiers, idempotency, targeted deletion tests. | Data worker | open |
| HIND-R04 | Reminder state diverges from decisions or permissions. | medium | high | Abstraction, reconciliation tests, and device QA. | iOS worker | open |
| HIND-R05 | Existing dirty notification/review changes are overwritten. | medium | high | Start with git status and preserve overlapping work. | All workers | open |
| HIND-R06 | Legacy private journal content is silently uploaded or exposed during the social migration. | medium | critical | Local-by-default migration, explicit per-domain consent, network-capture tests, backup and rollback. | Privacy + data owners | open |
| HIND-R07 | Editable or client-authoritative forecasts invalidate Receipts and leaderboards. | medium | critical | Server UTC lock, idempotent transaction, immutable ledger, negative/concurrency tests. | Backend owner | open |
| HIND-R08 | Ambiguous or incorrect resolution destroys public trust. | medium | critical | Curated events, precommitted source rules, dual approval, evidence, dispute, void and correction ledger. | Event operations | open |
| HIND-R09 | Rankings reward luck, volume, or cherry-picking rather than calibration. | high | high | Proper scoring, common event pools, sample/coverage gates, scoring versions, adversarial simulations. | Product + data | open |
| HIND-R10 | Public profiles and groups enable harassment, impersonation, spam, or unsafe predictions. | high | critical | Block/report/moderation before public launch, age/content policy, audited enforcement and appeals. | Safety owner | open |
| HIND-R11 | Dev/QA/prod credentials or data are mixed. | medium | critical | Isolated accounts/databases/domains/APNs, environment manifests, CI guards and secret scanning. | Release owner | open |
| HIND-R12 | Viral links or iMessage payloads leak private data or lose install context. | medium | high | Opaque IDs, allowlisted previews, typed router, `noindex`, no fingerprinting, routing/security matrix. | Growth + security | open |
| HIND-R13 | Public event spikes or scoring jobs exceed service capacity/cost. | medium | high | Load gates, budgets, queues, SLO dashboards, canaries, granular kill switches and staged rollout. | Operations | open |
| HIND-R14 | Engineering starts from attractive screens before the complete premium flow and failure states are validated. | medium | high | Claude Design brief, state inventory, tap/time targets, five uncoached sessions, and explicit design sign-off before Phase 1 UI code. | Product + design | open |
| HIND-R15 | The proposed managed backend passes a happy path but fails authorization, lock concurrency, restore, or environment isolation. | medium | critical | Conditional ADR only; synthetic negative/concurrency/restore/isolation spike must pass before accounts, SDKs, or production schemas. | Architecture + security | testing |
