# Learning engine

Turns closed findings into reviewable lesson proposals and replay plans. It is
continuous in detection and proposal generation, not self-modifying: a lesson
cannot change shared rules or project policy until a distinct reviewer approves
the exact proposal and a known-bad fixture fails under the old policy but passes
under the proposed policy.

Adoption output is a digest-bound plan of approval-required project updates. It
never edits `AGENTS.md`, policy locks, tests, or quality thresholds directly.
