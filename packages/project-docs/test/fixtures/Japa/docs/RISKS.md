# Risks

| ID | Risk | Probability | Impact | Mitigation | Owner | Status |
|----|------|-------------|--------|------------|-------|--------|
| R1 | Haptic feel differs on untested device classes | medium | high | iPhone 16 Pro Max passed; add broader device coverage post-v1 | owner | accepted |
| R2 | Spiritual seed content inaccurate / disrespectful | low | high | Bundled spiritual content removed; reactivate review if reintroduced | owner | resolved |
| R3 | Accessibility gaps undermine eyes-free promise | low | medium | Dynamic Type passes and is the accessibility baseline; VoiceOver support is out of scope by product decision (2026-08-14, MALA-7) — not planned for any version, so no residual VoiceOver risk is tracked | owner | closed — out of scope |
| R4 | Signing/config drift blocks TestFlight | low | high | Build 2 manual archive/upload succeeded; preserve evidence and configure `ASC_KEY_CONTENT` later before relying on unattended deployment | owner | mitigated; automation deferred |
| R5 | Repository docs vs external-mirror drift | medium | medium | Repository is authoritative; sync outward to Jira, Notion, and Studio OS; reconcile conflicts from verified repo evidence per `GOVERNANCE.md` | owner | mitigated |
| R6 | No CI allows silent regressions | low | medium | GitHub Actions build/test workflow exists | owner | resolved |
| R7 | A future opt-in cloud-Pro tier could introduce unreviewed or AI-generated spiritual content | low (not yet scoped) | high | Portfolio-wide direction discussed 2026-08-14, not scheduled. Same human sign-off precedent as R2/B6 applies: any future cloud-generated or cloud-curated prayer content requires human religious/cultural review before release — an LLM must not be the sole source of anything presented as prayer content. Free on-device product and its "nothing leaves your device" disclosure stay unchanged unless and until this is explicitly actioned. | owner | open — directional only |
