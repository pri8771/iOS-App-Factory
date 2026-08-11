# Simulator runner

Plans and executes lease-bound iOS Simulator test sessions. Simulator identity
is always an exact UDID/runtime pair, DerivedData and result bundles are
attempt-owned, and visible mode opens the selected device so an operator can
watch and record timestamped comments through the Quality finding ledger.

The runner is infrastructure, not a release verdict. Quality policy decides
which workflows, matrices, and evidence are mandatory.
