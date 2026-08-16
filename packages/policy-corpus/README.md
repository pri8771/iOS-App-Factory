# Policy corpus

Compiles the iOS App Factory rules corpus
([`docs/policy/ios-app-factory-policy-source.v1.json`](../../docs/policy/ios-app-factory-policy-source.v1.json))
with `@app-factory/policy-engine`, materializes the digest-locked `AGENTS.md`
and client adapters into a directory, and proves the result against
`@app-factory/project-sdk`'s read-only scanner.

The package never reads the clock (`--generated-at` is explicit so bundle
digests are reproducible), never runs Git, and never follows symbolic links
when writing. `materializePolicyBundle` re-verifies every written byte with
`verifyPolicyBundle` before returning.

## Files

- `docs/policy/ios-app-factory-policy-source.v1.json` — the compiled source
  (`CanonicalPolicySourceV1`: 28 principles, 32 rules, 9 protected surfaces).
- `docs/policy/ios-app-factory-policy-source.v1.sidecar.json` — provenance
  digests, per-rule sources, `humanOnly` / `appliesTo`, and the check registry;
  fields the engine schema does not have yet. `crossCheckSidecar` and the
  tests keep it in lockstep with the source.
- `docs/policy/RULES_CORPUS_RECONCILIATION.md` — version drift, mapping
  decisions, and the Hindsight proof.

## CLI

```sh
factory-policy-corpus compile --source <json> [--sidecar <json>] --out <dir> \
  --generated-at <ISO instant> [--overwrite] [--bundle <file>]
factory-policy-corpus verify  --source <json> --generated-at <ISO instant> --root <dir>
factory-policy-corpus scan    --root <git repository>
```

`compile` refuses to replace existing files unless `--overwrite` is given and
refuses symbolic-link roots, parents, or targets. `verify` recompiles from the
source rather than trusting a bundle file. `scan` prints a
`RuleAuthorityReportV1`: rule-file authority statuses, `rules.*` /
`compatibility.*` issues, declaration conflicts, and which of the enrollment
blockers are absent.
