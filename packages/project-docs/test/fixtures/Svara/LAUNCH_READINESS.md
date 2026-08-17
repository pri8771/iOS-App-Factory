# Svara TestFlight Readiness

The current, evidence-backed release state is maintained in:

- `docs/STATUS.md`
- `docs/TESTFLIGHT_TASKS.md`
- `docs/APPLE_TESTFLIGHT_REQUIREMENTS.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/BUGS.md`
- `docs/TEST_PLAN.md`
- `quality/completion-reports/`

The repository is registered as an existing iOS project under App Factory
standard 0.4.0. Do not use a readiness percentage or mark the release `done`;
the current state is `verification_pending`, followed by
`human_review_required`.

The active milestone is an external-eligible build 2 upload, owner TestFlight
smoke, and then an invitation-only close-friends beta after Apple review.
`TF-001` is complete. Apple account/app-record/signing verification, final
candidate evidence, and upload remain active. StoreKit commerce is deferred
because Plus is disabled. Live legal pages, physical-device/accessibility QA,
cultural sign-off, and audio provenance/rights block friend invitations but
not the owner smoke. Jira and Notion are mirrors only; the repository task
register is authoritative.
