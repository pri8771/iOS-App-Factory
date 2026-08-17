# Project Docs

A read-only, fail-closed reader for an enrolled or observed project repository's
own mandated documentation (`STATUS.md`, `RELEASE_CHECKLIST.md`, `BUGS.md`,
`RISKS.md`, `DECISIONS.md`, `quality/quality-manifest.json`,
`quality/completion-reports/*.json`). Owner doctrine: the project repository's
own docs are the source of truth; Jira and Notion are convenience mirrors synced
FROM the repo, never the reverse.

`readProjectDocsSnapshot` never infers or fabricates a value: a doc that is
absent, unreadable, or unparseable is reported as an honestly-explained
`unavailable`, with per-field provenance (file path, content digest, line range)
for everything it does read. It supports both the canonical `docs/` layout and
the case/location variants actually present across real repositories (a
capitalized `Docs/`, a case-mismatched file, a root-level fallback, a
self-declared "superseded"/"historical_pointer" stub).

`mirror.ts` builds and diffs the bounded `MirrorProjectionV1` projection a
future Jira/Notion push adapter may receive (contract only — no live provider
calls, no credentials) and proves the other half of the doctrine in code:
`applyMirrorDataToRepoDocs` always refuses to write repo docs from mirror data.
