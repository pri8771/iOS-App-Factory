# SESSION_2 offline protected-release threat model (OR-27)

Scope: factory control plane and fake Apple upload transport only. No live Apple, signing, TestFlight, device, or credential disclosure.

## Assets

- Durable release identity and build reservations
- One-time artifact-bound approvals
- External effect intents and sanitized receipts
- Operator Studio truthfulness about capability and effect state

## Adversaries / failure modes

1. Replay of `release.upload` after uncertain send
2. Stale or ambiguous provider max-build observations driving allocation
3. Approval reuse across different artifact/build identities
4. Release-scoped approval bound to an attempt-scoped effect (or the reverse)
5. Real Apple transport accidentally enabled or silently substituted
6. Secrets, absolute paths, or raw provider payloads entering receipts/UI/logs
7. Studio stale reconnect authorizing a new send from an old view
8. Cancellation presented as remote undo after an effect is already in flight

## Controls

| Threat | Control |
| --- | --- |
| Replay / duplicate effect | Durable intent digest uniqueness; consumed approval bound to exact effectId; no resend after unknown |
| Stale observation | `freshnessDeadline` + fail-closed kinds `ambiguous`/`unavailable` |
| Identity drift | `ReleaseIdentityV1` digests in approval binding and intent; mismatch fails closed |
| Subject scope confusion | Contract superRefine + migration/action policy; no fabricated attempts |
| Live transport | Capability probe; real protocol disabled by default; actionable blocker |
| Secret leakage | Sanitized receipt schema excludes credentials/paths/raw payloads; tests assert redaction |
| Stale UI | Reconnect/stale-view tests; confirmation never creates effects |
| Cancellation honesty | Cancel stops future dispatch only; in-flight external effect remains observable |

## Tabletop traces (offline)

1. Success: archive → upload txn → fake accept → confirm uploaded → processing → internal-testflight-available
2. Rejection: fake reject → rejected state; no second effect from same approval
3. Timeout: fake timeout → unknown; restart reconciles; no blind retransmission
4. Replay: duplicate upload command returns retained receipt; revision conflict does not resend
5. Identity mismatch: wrong build/artifact receipt cannot advance stage
6. Stale max-build: allocation refused

## Explicit non-claims

This batch does not authorize or perform Apple authentication, signing, archive export to ASC, TestFlight distribution, device install, or public submission.
