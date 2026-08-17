# Assumptions

| ID | Assumption | Evidence | Validation plan | Status |
|---|---|---|---|---|
| AURA-A01 | Users find the analysis credible and actionable. | Polished shell; full result loop unverified. | Uncoached physical-device beta with varied images. | open |
| AURA-A02 | Heuristic classification is acceptable for MVP. | Deterministic fallback exists. | Labeling review and user comprehension test. | open |
| AURA-A03 | Freemium limits occur after enough value is demonstrated. | StoreKit scaffolding exists. | Complete core-loop QA before paywall testing. | open |
| AURA-A04 | Apple Developer membership for team `796XH483R4` is active through the beta window. | Team ID exists in the Xcode project only. | Owner completes `AURA-OPS-009` in Apple Developer. | unverified |
| AURA-A05 | The explicit App ID and App Store Connect app record exist or can be created for `com.pchordia.aurafit`. | Bundle ID is fixed in the project; Apple-system state was unavailable. | Owner completes `AURA-OPS-010`. | unverified |
| AURA-A06 | Build `1` has not already been uploaded. | `CURRENT_PROJECT_VERSION=1`; no App Store Connect evidence. | Query uploaded builds before `AURA-OPS-011`; choose a strictly greater build if used. | unverified |
| AURA-A07 | The four production StoreKit IDs can be registered and their commercial values approved. | IDs exist in code and local StoreKit configuration only. | Complete `AURA-MON-008` and `AURA-QA-010`. | unverified |
| AURA-A08 | The owner can provide durable public privacy/support URLs and monitored review contacts. | Repository has policy copy but no approved public URL/contact values. | Complete `AURA-MKT-004` and owner fields in `AURA-LEG-008`. | unverified |
