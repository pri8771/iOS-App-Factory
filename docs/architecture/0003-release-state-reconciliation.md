# ADR 0003: One release state machine, with certification as a projection

Status: accepted
Date: 2026-08-14

## Context

Two schemas independently modeled the candidate-to-device-smoke release arc:

- `packages/quality/src/certification.ts` / `model.ts` — `CertificationV1`, 4
  stages (`candidate → archived → uploaded → device-smoke-passed`), with
  `assertCertificationAdvancement` enforcing exactly-one-stage advancement, an
  11-field immutable set, and monotone approvals requiring at least one new
  approval per stage. `verifyCertification` additionally bound a certification
  to the exact release contract, experience manifest, and finding-ledger
  digests it was issued against, and rejected any open finding at or above a
  configured blocking severity.
- `packages/contracts/src/v1/release.ts` — `ReleaseManifestV1`, 8 stages
  (`candidate → certified → archived → upload-approved → uploaded →
processing → internal-testflight-available → device-smoke-passed`),
  validated only as a single object (structural shape plus a `superRefine`
  requiring `archiveDigest`/`appStoreBuildId` once their stage was reached).
  It had no transition-assertion function, no minimum approval count, and no
  evidence fields at all for its own `internal-testflight-available` and
  `device-smoke-passed` stages.

Both are digest-bound and both claim to be the release record. Neither has a
consumer yet (no kernel, command handler, or app imports either type outside
its own tests), which is exactly why this had to be resolved now: wiring
either one first would have picked a source of truth by accident, and wiring
both would produce contradictory answers about a release's state.

The two also disagreed structurally, not just in stage count. Contracts'
8 stages encode gates that the 4-stage model collapsed into single
transitions:

- `certified` — quality's coherence/digest-binding check
  (`verifyCertification`) was a function call with no persisted state. A
  candidate could be re-validated any number of times, or never, with no
  record of whether it had happened. Splitting it into its own stage makes
  "this exact candidate passed the quality gate" an auditable, approval-bearing
  fact.
- `upload-approved` — the 4-stage model required a new approval for the same
  `archived → uploaded` transition that also recorded the App Store build ID,
  conflating a human "go ahead and upload" decision with the system fact that
  the upload happened. Splitting them lets the human gate
  (`ReleaseContractV1.requiredHumanGates` includes `"testflight-upload"`) be
  satisfied before the upload adapter acts, instead of after.
- `processing` — Apple's asynchronous build-processing window had no
  representation at all in the 4-stage model; it was invisible time between
  `uploaded` and the (also-collapsed) smoke-test outcome. Naming it means a
  stuck or slow processing pipeline is a directly observable state, not
  something inferred from elapsed time.
- `internal-testflight-available` — the 4-stage model set
  `testFlightInstalledAt` and `deviceSmokeEvidenceDigest` together, atomically,
  at the single terminal stage. In reality a build becomes installable before
  anyone has run the smoke test against it; the 8-stage model can say so.

## Decision

`ReleaseManifestV1` (contracts) becomes the single source of truth for
release state. `CertificationV1` (quality) becomes a read projection and a
validator over it, not a second machine:

- **`assertReleaseAdvancement`** (new, `packages/contracts/src/v1/release.ts`)
  is now the only transition-assertion function for release state. It
  enforces, across all 8 stages uniformly, the invariants
  `assertCertificationAdvancement` used to enforce over 4:
  exactly-one-stage advancement (via the new exported
  `RELEASE_STAGE_ORDER_V1`, the single ordered source of truth the schema's
  own evidence gate also derives from); an unchanged release identity
  (`releaseId`, `projectId`, `profile`, `target`, `metadataDigest`, the whole
  `candidate` payload, and the whole `ios` payload — a superset of the old
  11-field immutable set, see the mapping below); and strictly-growing
  `approvals` with at least one new approval per stage. It throws the new
  `ReleaseAdvancementError`. `assertCertificationAdvancement` is removed.
- **`projectCertificationV1`** (new,
  `packages/quality/src/certification.ts`) is a pure reshape from a
  `ReleaseManifestV1` to the quality-relevant `CertificationV1` view. It is
  lossless: `CertificationV1Schema`'s discriminated union was widened from 4
  arms to 8 (one per `ReleaseStageV1` value, same order), each arm carrying
  exactly the evidence-nullability signature the corresponding release stage
  requires. Folding 8 stages down into the old 4-value enum was rejected (see
  Rejected alternatives) because it cannot represent
  `internal-testflight-available` without either losing information or
  contradicting the source object.
- **`verifyCertification`** (`packages/quality/src/certification.ts`) keeps
  quality's genuinely valuable check — that a release's digest-bound fields
  are consistent with its actual release contract, experience manifest, and
  finding ledger, and that no open blocking finding remains — but now
  validates a `ReleaseManifestV1` (via its `candidate.*` fields) instead of a
  standalone certification object, and returns the projected view. This is
  the gate a caller runs before allowing `candidate → certified`.

### Mapping the old 4-stage transitions onto the new 8-stage model

| Old `CertificationV1` transition | New `ReleaseManifestV1` transitions                                           |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `candidate → archived`           | `candidate → certified → archived`                                            |
| `archived → uploaded`            | `archived → upload-approved → uploaded`                                       |
| `uploaded → device-smoke-passed` | `uploaded → processing → internal-testflight-available → device-smoke-passed` |

### Mapping the old 11 immutable fields

| `CertificationV1` (old)    | `ReleaseManifestV1` (new)                           |
| -------------------------- | --------------------------------------------------- |
| `releaseId`                | `releaseId`                                         |
| `projectId`                | `projectId`                                         |
| `profile`                  | `profile`                                           |
| `gitCommit`                | `candidate.commit`                                  |
| `gitTree`                  | `candidate.tree` (added, additive)                  |
| `cleanTree`                | `candidate.cleanTree`                               |
| `policyDigest`             | `candidate.policyDigest`                            |
| `releaseContractDigest`    | `candidate.releaseContractDigest` (added, additive) |
| `experienceManifestDigest` | `candidate.experienceManifestDigest`                |
| `evidenceManifestDigest`   | `candidate.evidenceManifestDigest`                  |
| `findingLedgerDigest`      | `candidate.findingLedgerDigest` (added, additive)   |

`target`, `metadataDigest`, `ios.*`, and `candidate.qualityReportDigest` had no
equivalent in the old 11-field set (quality never modeled them) and are now
also immutable in `assertReleaseAdvancement` — letting the shipped bundle
identity or App Store metadata change mid-release would be a correctness
hazard the old model never had to guard against because it never modeled
those fields.

### Stage / approval / evidence matrix

Evidence nullability is enforced in both directions by `ReleaseManifestV1`'s
`superRefine`: required at or after its stage, and forbidden before it. This
gives every stage a distinct, checkable signature — the same precision the
old 4-arm discriminated union had, now over 8 stages instead of 4.

| Stage                           | `archiveDigest` | `appStoreBuildId` | `internalTestFlightAvailableAt` | `deviceSmokeEvidenceDigest` | New approval      | Gate character                                                                                                                                                 |
| ------------------------------- | --------------- | ----------------- | ------------------------------- | --------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `candidate`                     | null            | null              | null                            | null                        | — (candidate cut) | human: the pre-candidate gates (`product-authority`, `visual-baseline`, `release-scope`) plus the `candidate` gate from `ReleaseContractV1.requiredHumanGates` |
| `certified`                     | null            | null              | null                            | null                        | required          | human/quality: `verifyCertification` passes for this exact candidate                                                                                           |
| `archived`                      | set             | null              | null                            | null                        | required          | system: Xcode archive produced and authorized                                                                                                                  |
| `upload-approved`               | set             | null              | null                            | null                        | required          | human: `testflight-upload` gate                                                                                                                                |
| `uploaded`                      | set             | set               | null                            | null                        | required          | system: upload adapter executed and authorized                                                                                                                 |
| `processing`                    | set             | set               | null                            | null                        | required          | system: Apple build-processing observed                                                                                                                        |
| `internal-testflight-available` | set             | set               | set                             | null                        | required          | system: TestFlight availability observed                                                                                                                       |
| `device-smoke-passed`           | set             | set               | set                             | set                         | required          | human: `device-smoke` gate                                                                                                                                     |

Every transition requires a new approval (the blanket rule ported from
quality, applied uniformly rather than only on stages a human visibly
approves): `ApprovalV1.actorId` is a free-form string, so a system/service
account can hold the approval for a system-driven transition (for example, an
App Store Connect polling adapter's own authorized action for
`uploaded → processing`) without a human in the loop for that specific step.
Which action/actor is expected for which transition is a policy decision for
whatever orchestrates the transitions later (the "certification wiring" this
reconciliation exists to unblock, and which is explicitly out of scope here);
this table records the intended shape of that decision, not a new enforced
constraint beyond "at least one new approval."

## Additive contracts changes

`schemas:check` passes; the only changed checked-in JSON Schema fixture is
`packages/contracts/schemas/v1/release-manifest.v1.schema.json`, and the diff
is purely additive — new properties and new required entries for those new
properties, with the file's `$id`, top-level shape, and every previously
existing property/type/required-entry unchanged:

- `candidate.tree: GitObjectId` (new, required) — the immutable-set
  fix-up above.
- `candidate.releaseContractDigest: Sha256Digest` (new, required) — binds the
  candidate to the exact `ReleaseContractV1` it was cut against.
- `candidate.findingLedgerDigest: Sha256Digest` (new, required) — binds the
  candidate to the exact quality finding ledger it was cut against.
- `internalTestFlightAvailableAt: IsoInstant | null` (new, top-level) —
  evidence for the `internal-testflight-available` stage. Named for the stage
  it gates (contracts' own vocabulary), not for quality's old
  `testFlightInstalledAt`; `projectCertificationV1` does that renaming at the
  projection boundary.
- `deviceSmokeEvidenceDigest: Sha256Digest | null` (new, top-level) —
  evidence for the `device-smoke-passed` stage.
- The `superRefine` evidence gate now also rejects a value set **before**
  its gating stage (previously only checked "required at/after"), for both
  the two new fields and the two pre-existing ones (`archiveDigest`,
  `appStoreBuildId`). This only narrows which already-nonsensical
  combinations parse successfully; it changes no field's type, no JSON Schema
  shape (`superRefine` business rules are never represented in the generated
  JSON Schema — confirmed by the unchanged rest of the fixture diff), and no
  currently-passing document, since no such document exists yet.

No field was removed, renamed, or retyped. `ReleaseStageV1Schema`'s 8 values
are unchanged.

## Quality-side changes (freer surface, still minimal)

- `CertificationEnvelopeV1Shape.profile` widened from the fixed literal
  `"ios-internal-testflight-v1"` to contracts' `NamespacedCodeSchema` — a
  projection must accept whatever value the canonical `ReleaseManifestV1.profile`
  allows.
- `CertificationV1Schema` widened from a 4-arm to an 8-arm discriminated
  union, one arm per `ReleaseStageV1` value, so the projection is a lossless
  reshape rather than a lossy fold (see Rejected alternatives).
- `assertCertificationAdvancement` and its local `STAGE_ORDER` are removed;
  superseded by `assertReleaseAdvancement`.
- `verifyCertification`'s input field is renamed `certification` →
  `releaseManifest` and now parses a `ReleaseManifestV1`, reading
  `candidate.*` where it used to read the removed standalone envelope. Its
  redundant `approvalIds` (now `approvals`) uniqueness re-check was dropped:
  `ReleaseManifestV1Schema`'s own `superRefine` already enforces it, so the
  re-check could never fire (caught during this change by a test that tried
  to construct a duplicate-approval input and found `.parse()` rejected it
  first).

## Rejected alternatives

- **Fold the 8 stages down into `CertificationV1`'s original 4-value stage
  enum.** Rejected: `internal-testflight-available` cannot be represented
  without either contradicting the source `ReleaseManifestV1` (forcing
  `testFlightInstalledAt` to stay null when the source has it set) or
  silently widening the old `uploaded` arm's strict-null guarantee. A
  projection that sometimes disagrees with its source is worse than no
  projection.
- **Keep both machines and cross-validate them at write time.** Rejected:
  this is the exact problem this ADR exists to close. A bug in the
  cross-check reproduces the original disagreement risk, and it leaves two
  places that must be kept in sync by hand forever instead of one.
- **Make the three new `candidate` fields optional instead of required.**
  Rejected: they are digest bindings, not incidental metadata. An optional
  `releaseContractDigest`/`findingLedgerDigest` would let a release exist
  mid-pipeline without the binding proof that gives the invariant its value,
  and would push the "is this actually bound" check from the type system
  into caller discipline.
- **Put `assertReleaseAdvancement` in quality instead of contracts.**
  Rejected: quality depends on contracts, not the reverse
  (`contracts-are-foundational` in `dependency-cruiser.config.cjs` forbids
  contracts from importing any other package), and the task's premise is that
  contracts is the foundational, single-source-of-truth package. Quality
  already hosts pure business-logic functions alongside its schemas
  (`evaluateExperienceCoherence`, `mergeFindingLedger`); contracts already did
  too before this change (`generateContractJsonSchemasV1`,
  `portfolioReadModelDigestInputV1`) — a transition-assertion function
  alongside `ReleaseManifestV1Schema` and `ReleaseStageV1Schema` in the same
  file is consistent with that precedent, not a new kind of surface for the
  package.

## Non-goals

- Gating `exportedArtifactDigest` to a specific stage. It stays nullable at
  every stage, as before; there is no evidence yet in the codebase for
  exactly when the exported `.ipa` (as opposed to the `.xcarchive`) becomes
  available relative to upload, and inventing a threshold without that
  evidence would be exactly the kind of ungrounded gate-logic change AGENTS.md
  asks task authors to avoid.
- Unifying contracts' generic `FindingV1`/`EvidenceManifestV1` (attempt
  execution evidence) with quality's `QualityFindingV1`/`ExperienceManifestV1`
  (release UI-coherence findings) or contracts' `QualityReportV1` with
  quality's finding ledger. These are different concerns that happen to share
  the word "quality"; reconciling them was not part of the two competing
  state machines this ADR resolves.
- Wiring `assertReleaseAdvancement` or `verifyCertification` into the kernel,
  a command handler, or any other consumer. No consumer of either type exists
  yet (verified repository-wide); that wiring is the work this reconciliation
  was required to precede, not part of it.

## Consequences

- There is exactly one release state machine. Any future kernel/command
  wiring advances a `ReleaseManifestV1` through `assertReleaseAdvancement`;
  anything that wants the narrower quality view calls `projectCertificationV1`
  or `verifyCertification` and gets it derived, never tracked separately.
- The stage/approval/evidence matrix above is the contract that wiring must
  satisfy: which fields become non-null at which stage, and that every
  transition needs a new approval. It is also encoded as tests
  (`packages/contracts/test/release.test.ts`,
  `packages/quality/test/coherence.test.ts`), so a future change that
  violates it fails deterministically instead of silently.
- `packages/quality`'s certification surface shrank in independence but not
  in the invariants it protects: every check `assertCertificationAdvancement`
  and `verifyCertification` used to perform is still performed, now against
  the canonical object instead of a hand-maintained parallel one.
