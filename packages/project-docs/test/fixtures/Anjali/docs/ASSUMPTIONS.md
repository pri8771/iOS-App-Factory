# Assumptions

| ID | Assumption | Evidence | Validation plan | Status |
|---|---|---|---|---|
| ASM-001 | Team `796XH483R4` owns `app.anjali.Anjali`. | Xcode build settings only. | Confirm identifiers and agreements in App Store Connect. | unverified |
| ASM-002 | Lifestyle is the primary category; Health & Fitness is secondary. | Product positioning and reconciled listing docs. | Confirm with product owner before metadata entry. | proposed |
| ASM-003 | The final v1 can be free with no IAP. | No StoreKit code/config and current PRD. | Confirm App Store Connect has no purchases configured. | likely |
| ASM-004 | External beta must not include provisional audio. | Target membership and catalog exclude it; archive inspection verifies absence. | Re-enable only after reviewed replacement. | verified |
| ASM-005 | App Store screenshots, keywords, categories, and full age-rating work are not all prerequisites for the first internal TestFlight install. | Apple separates Test Information/build groups from platform-version store metadata. | Follow any App Store Connect blocking prompt; otherwise track as AS-001–AS-006. | verified against Apple docs |
| ASM-006 | The first external cohort should use invitations, not a public link. | Product-risk choice; Apple supports both email invitations and optional public links. | Product/QA may expand only after TF-012 controlled cohort exits green. | approved plan |
| ASM-007 | China mainland is not enabled for the initial beta. | App information has region-specific religious-information permit fields; legal/account review is absent. | Account/legal owner documents availability decision in TF-002/AS-006. | proposed safety default |
