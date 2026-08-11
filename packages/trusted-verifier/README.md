# Trusted verifier

Runs a pre-approved deterministic check in a separate, clean Git checkout. The
coding agent cannot choose the command, environment, policy, or protected-file
digests. Verification uses no shell or TTY, has fixed resource limits, and fails
if the checkout changes tracked or untracked release inputs.
