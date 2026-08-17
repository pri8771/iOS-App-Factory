# Assumptions

| ID | Assumption | Evidence | Validation plan | Status |
|----|------------|----------|-----------------|--------|
| A1 | Distinct completion haptic is perceptible vs per-bead tick eyes-free | Validated on physical iPhone 16 Pro Max on 2026-07-18 | Broader device-class coverage is optional post-v1 | accepted |
| A2 | Users can complete a full round without looking | Product differentiator; UI tests cover tap flow only | Manual eyes-closed round on device | open |
| A3 | Bundled spiritual seed content is in v1 | Removed from v1 on 2026-07-26; `CONTENT_REVIEW.md` is historical | Reactivate review only if bundled spiritual content returns | accepted |
| A4 | Local JSON persistence is sufficient for v1 (no sync) | Product constraint; PrivacyInfo audited | Keep no-network; relaunch tests | accepted |
| A5 | iPhone-only is correct for v1 | `TARGETED_DEVICE_FAMILY = 1`; launch scope | DEC-003; revisit post-v1 | accepted |
