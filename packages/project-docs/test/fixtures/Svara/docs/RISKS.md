# Risks

| ID | Risk | Probability | Impact | Mitigation / task | Owner | Status |
|---|---|---|---|---|---|---|
| RISK-001 | Distribution signing cannot be reproduced on the current Mac. | high | blocker | `TF-003`: repair signing without revoking unrelated credentials; then `TF-011`. | release owner | open |
| RISK-002 | Audio rights or performer consent are incomplete. | medium | external blocker | Sole-owner private evaluation only; `TF-007` must complete provenance and replace any unproven asset before external distribution. | product owner | open |
| RISK-003 | Cultural interpretation is inaccurate or too authoritative. | medium | external high | Owner-only evaluation is not approval; `TF-007` human review remains mandatory before external distribution. | product owner | open |
| RISK-004 | StoreKit products differ from metadata or are not cleared for sale. | low while disabled | deferred | Commerce and product loading are disabled under `DEC-006`; `TF-005`/`TF-012` become mandatory only when Plus returns. | product owner | deferred |
| RISK-005 | Dynamic Type or VoiceOver blocks a primary action. | medium | external high | TF-015 is a bounded smoke only; `TF-010` remains mandatory before external beta. | product owner | open |
| RISK-006 | Dated festival content becomes stale. | high | external medium | `TF-007` reviews dates and regional caveats before external distribution. | product owner | open |
| RISK-007 | A Jira or Notion copy drifts from repository requirements. | medium | high | Mirror exact task ID/path/commit and always reconcile back to `docs/TESTFLIGHT_TASKS.md`. | release owner | open |
| RISK-008 | Cross-entry navigation bypasses lesson sequence or premium access control. | low in free build | medium | `UI-003` is fixed through Aaroh policy enforcement; commerce-specific `UI-004` remains deferred until Plus returns. | product owner | mitigated |
| RISK-009 | Progress/reward UI misstates or duplicates awards. | low | high | Build 2 deduplicates practice awards, resumes lessons, queues achievements, and reports replay awards truthfully; keep regressions in TF-009. | product owner | mitigated |
