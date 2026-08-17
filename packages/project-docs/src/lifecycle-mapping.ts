import {
  ProjectLifecycleStageV1Schema,
  type ProjectLifecycleStageV1,
} from "@app-factory/contracts";

/**
 * Maps the iOS App Factory rules corpus's 14-stage product lifecycle (`PROJECT_LIFECYCLE.md`:
 * `idea -> research -> validated -> planned -> prototype -> mvp_development -> code_complete ->
 * verification_pending -> verified -> beta -> release_candidate -> released -> maintained ->
 * paused_or_retired`, recorded in `docs/policy/RULES_CORPUS_RECONCILIATION.md` §2) onto this
 * repository's canonical six-stage `ProjectLifecycleStageV1` (ADR 0005:
 * `idea | building | qa | launch-prep | live | frozen`). That reconciliation doc explicitly flags
 * this pairing as "recorded, not reconciled" -- this map is this task's answer for it, scoped to
 * exactly the token this package reads out of a repository's own `STATUS.md`. All six surveyed
 * repositories' STATUS.md lifecycle tokens are corpus-vocabulary values (`verification_pending`,
 * `beta`, `mvp_development`), so this mapping is not merely theoretical.
 */
export const CORPUS_LIFECYCLE_STAGE_TO_CANONICAL_V1: Readonly<
  Record<string, ProjectLifecycleStageV1>
> = {
  idea: "idea",
  research: "idea",
  validated: "idea",
  planned: "idea",
  prototype: "building",
  mvp_development: "building",
  code_complete: "building",
  verification_pending: "qa",
  verified: "qa",
  beta: "launch-prep",
  release_candidate: "launch-prep",
  released: "live",
  maintained: "live",
  paused_or_retired: "frozen",
};

/** Maps a raw repo-docs lifecycle token onto the canonical six-stage vocabulary, or `null` when the
 * token is not a recognized corpus stage -- never guessed, never defaulted. */
export function mapCorpusLifecycleStageToCanonicalV1(raw: string): ProjectLifecycleStageV1 | null {
  const mapped = CORPUS_LIFECYCLE_STAGE_TO_CANONICAL_V1[raw.trim().toLowerCase()];
  if (mapped === undefined) return null;
  return ProjectLifecycleStageV1Schema.parse(mapped);
}
