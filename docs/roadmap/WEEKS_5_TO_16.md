# Weeks 5–16: enrollment-to-TestFlight roadmap

Status: proposed implementation baseline  
Dates: September 7–November 27, 2026  
Dependency: the committed exit gate in `FIRST_4_WEEKS.md` is green  
Primary outcome: one new Factory-certified Hindsight build available in Internal TestFlight and smoke-tested on a physical device

Detailed Jira-ready tasks and subtasks: `DETAILED_BACKLOG_WEEKS_5_TO_16.md`

> **2026-08-14 re-baseline note:** This document is preserved as the original
> historical planning baseline. Its task breakdown and exit-gate intent
> remain accurate engineering content, but the Week 5–16 calendar above is no
> longer being tracked as a live schedule — implementation order and pace
> diverged from it (see `BUILD_STAGES.md`'s own re-baseline note for how
> early that divergence started). [`BUILD_STAGES.md`](BUILD_STAGES.md) is the
> current authoritative capability-stage sequencing (this document's scope
> maps roughly onto Stages 3–8), and
> [`docs/progress/IMPLEMENTATION_STATUS.md`](../progress/IMPLEMENTATION_STATUS.md)
> is the current authoritative status ledger.

## Honest finish line

By the end of Week 16, the Factory should have:

1. enrolled Hindsight from an explicitly approved clean base without damaging its
   current working checkout;
2. completed three to five deliberately small Hindsight issues through durable
   Jira → Codex → GitHub PR → verified merge reconciliation;
3. rejected the historical mixed-generation Hindsight UI through a reusable
   whole-product Quality Kit;
4. certified one exact Hindsight SHA, uploaded a new build through the Factory,
   installed that build from Internal TestFlight, and recorded a physical-device
   smoke result;
5. exposed projects, attempts, blockers, Jira/PR state, approvals, evidence, and
   release state through CLI, MCP, and a functional local dashboard; and
6. converted the mixed-UI escape into the first reviewed, replayable Factory
   lesson.

If the release path is green early, the final week may also prove one controlled
Hindsight lifecycle event → website data PR → preview. Cross-app product
analytics, CRM, email, ads, and automatic social/content publishing are not part
of the committed finish line.

## Current constraint that controls the schedule

As of August 10, Hindsight is on branch `dev` at `f7935cd` with 55 modified,
deleted, or untracked paths spanning UI, icons, tests, and release documents.
The Factory must not stash, commit, delete, relocate, or reinterpret that work
automatically. Week 6 therefore contains a mandatory preservation and product-
authority gate. If that gate is unresolved, all Hindsight write dates move.

Hindsight also has an earlier build 1.0 (4) accepted by App Store Connect. That
build is useful historical evidence, but it does not prove the new Factory. The
roadmap requires a later build produced from a Factory-certified SHA.

## Week 5 — Operational clients and enrollment primitives

Dates: September 7–11 (reduced-capacity holiday week)  
Goal: turn the reliable CLI kernel into a usable local service and establish a
strictly read-only project-discovery boundary.

Tasks:

- Close any unresolved P0/P1 finding from the Week-4 walking slice.
- Add safe install, uninstall, status, and log commands for a new, explicitly
  scoped App Factory user LaunchAgent; never reuse or install the legacy one.
- Test login, daemon restart, sleep/wake reconciliation, and child cleanup. Make
  the limitation explicit: execution still requires the Mac to be awake and the
  user session available.
- Add the local MCP command surface for project, attempt, status, blocker,
  evidence, pause, resume, retry, and cancel.
- Finish the minimal dashboard if it did not land as a Week-4 stretch: daemon
  health, current attempt, timeline, blocker, evidence, and safe actions.
- Define `ProjectManifest`, protected-path, capability, policy-lock, and
  enrollment-plan contracts only as needed by the scanner.
- Build deterministic scanner fixtures for Swift Package, Xcode, dirty repo,
  conflicting rules, and unsupported project cases.

Exit gate:

- CLI, MCP, and dashboard show the same command, attempt, event, and evidence IDs.
- The new daemon restarts safely after login/wake and never starts the legacy
  orchestrator.
- A repository scan is proven read-only with before/after Git and content
  digests.

User gate: approve installation of the new LaunchAgent when implementation
reaches that task. Claude authentication is needed only if Claude is tested as a
command client; Codex remains the coding runner.

## Week 6 — Safe Hindsight enrollment and authority freeze

Dates: September 14–18  
Goal: establish exactly what Hindsight is, what source state may be changed, and
what “correct” means before autonomous work starts.

Tasks:

- Run read-only discovery over the existing Hindsight checkout: status, content
  digests, branches, schemes, build commands, tests, routes, screens, states,
  integrations, rules, assets, release material, and known quality gaps.
- Produce explicit preservation choices for the current dirty redesign. Do not
  choose among them automatically.
- Ratify one canonical product contract, information architecture, design-system
  generation, feature scope, and Internal TestFlight target.
- After approval, create or select an explicit clean base SHA without modifying
  the user's working checkout.
- Generate the Hindsight `ProjectManifest`, protected paths, build/test commands,
  initial release contract, and enrollment gap report.
- Establish a clean baseline test/build result from a Factory-owned checkout.
- Select three required and up to two optional pilot issues. Keep each issue
  independently reviewable and small enough for one PR.

Exit gate:

- One approved clean base SHA, one product/design authority, one versioned
  manifest, and one green or honestly blocked baseline exist.
- The original dirty checkout is unchanged.
- The pilot contains three required issues; issues four and five are conditional
  on actual size and quality findings.

User gate: decide whether the dirty redesign is authoritative, should be
checkpointed on an explicit branch, or should remain excluded. Approve the
product/design authority and pilot scope.

## Week 7 — Durable Jira and GitHub effect boundary

Dates: September 21–25  
Goal: make remote project-management actions planned, approval-bound,
idempotently reconcilable, and safe after crashes.

Tasks:

- Add the minimum `Approval`, `ExternalEffect`, operation-marker, external-
  resource, and transactional-outbox contracts consumed by this slice.
- Use Keychain-backed credential references; never place Jira/GitHub credentials
  in agent environments or evidence.
- Implement Jira and GitHub capability/authentication preflight.
- Add read-only Jira workflow/issue revision ingestion and GitHub repository,
  branch, PR, check, and merge-state reconciliation.
- Snapshot Jira issue revision, TaskSpec digest, policy digest, base SHA, and
  target branch when work is claimed; block or replan when they change.
- Implement deterministic `project provision plan` for a Jira project, epics,
  small issues, GitHub repository attachment, checks, and naming conventions.
- Model cross-project work as one work package linked to multiple project issues;
  do not duplicate shared completion state.

Exit gate:

- Read-only reconciliation and provision planning are deterministic.
- No coding agent has remote-service credentials.
- A stale approval, changed Jira revision, or advanced base cannot cause a push,
  transition, or merge.

User gate: repair/authorize GitHub and Jira access with the narrowest practical
scopes and approve the exact sandbox provisioning plan before any remote write.

## Week 8 — Remote sandbox and failure-injection proof

Dates: September 28–October 2  
Goal: prove every Jira/GitHub mutation in a disposable Factory sandbox before
touching Hindsight remotely.

Tasks:

- Apply the approved sandbox plan: Jira project/epic/issues and GitHub test repo
  or approved existing sandbox.
- Exercise create/comment/transition, branch/push, draft PR, checks, approval,
  merge, and post-merge reconciliation.
- Embed stable Factory markers in Jira effects and GitHub branches/PRs/commits.
- Inject duplicate delivery, timeout-before-send, timeout-after-server-mutation,
  daemon restart, stale fence, changed issue, advanced base, and ambiguous merge
  response at every external step.
- Reconcile provider state before retrying; never assume an HTTP timeout means the
  mutation did not occur.

Exit gate:

- Replaying the complete sandbox flow creates no duplicate project, issue,
  comment, branch, PR, transition, or merge.
- Unknown external state becomes `manual_intervention`, never success.
- The sandbox flow survives daemon restart without operator redispatch.

User gate: approve the first sandbox writes and the exact hash-bound sandbox
merge. Cleanup or deletion of sandbox resources is a separate explicit action.

## Week 9 — First real Hindsight delivery slice

Dates: October 5–9  
Goal: complete one or two small, low-risk Hindsight issues through the real
Jira/GitHub loop.

Tasks:

- Create or reconcile the accepted Hindsight Jira issues and dependency links.
- Claim a revision-pinned issue and create a short-lived branch/worktree at the
  approved base SHA.
- Run Codex, trusted checks, independent review, evidence finalization, push,
  draft PR, and GitHub checks.
- Require a hash-bound human merge approval during the pilot.
- Reconcile merge result, verify `main` after merge, and transition Jira only
  after verified completion.
- Repeat with a second issue only if the first completes without manual repair.
- Inject one lost-response or restart scenario in the real path without risking
  duplicate external effects.

Exit gate:

- At least one, preferably two, Hindsight issues have an unbroken Jira → attempt
  → evidence → PR → verified merge chain.
- No step required manual redispatch or direct repair of Factory state.

User gate: approve each exact pilot commit for merge. Routine status updates do
not require manual intervention.

## Week 10 — Whole-product Quality Kit foundation

Dates: October 12–16  
Goal: create a reusable gate that tests the assembled product, not merely isolated
features.

Tasks:

- Implement versioned `release-contract`, `experience-manifest`, `finding`, and
  generated `certification` schemas.
- Inventory every public Hindsight route, screen, sheet, dialog, and meaningful
  loading/empty/error/content state with stable IDs.
- Map each inventory row to a deterministic fixture, critical journey, design
  generation, accessibility requirements, and required evidence.
- Add deterministic clocks, seeded data, test-only launch routes, and simulator
  isolation.
- Capture a pinned device/theme/text-size screenshot matrix and produce visual
  diffs plus whole-journey filmstrips.
- Add a visible simulator observer mode: an operator comment becomes a timestamped
  Finding linked to screen/state, screenshot, build SHA, and proposed Jira bug.
- Import the historical mixed-generation state as a known-bad regression fixture.

Exit gate:

- The archived mixed-generation fixture fails for stable named finding IDs.
- A deliberately coherent reference fixture passes.
- Adding an unregistered public route or state fails the inventory gate.

User gate: review the first whole-journey filmstrips and approve the initial
visual authority/baseline. The implementation agent cannot approve or rewrite
its own baseline.

## Week 11 — Common-sense quality and UI coherence

Dates: October 19–23  
Goal: make the failure that produced old/new Hindsight screens mechanically
unacceptable.

Tasks:

- Enforce one active design-system generation across every public release route.
- Add static checks for legacy components, raw tokens, unclassified routes,
  expired exceptions, and protected baseline changes.
- Add test-build runtime generation auditing to catch legacy components hidden
  inside shared views.
- Exercise complete critical journeys: first launch, capture/relaunch, due and
  resolve, History/Insights, samples, retained failure/retry, export/delete,
  store recovery, and notification/deep-link behavior.
- Add small/large phone, light/dark, Dynamic Type, Increased Contrast, Reduce
  Motion, accessibility semantics, privacy, secrets, persistence, and migration
  gates appropriate to the release contract.
- Convert operator observations into deduplicated findings and candidate Jira
  issues; require evidence and root-cause fields for closure.

Exit gate:

- The current Hindsight candidate has a finite, severity-ranked finding list.
- No mixed-generation route, missing required state, unresolved P0/P1 finding,
  or unapproved baseline change can pass release verification.

User gate: resolve genuinely subjective product/visual decisions and approve
baseline changes separately from implementation PRs.

## Week 12 — Hindsight remediation and pilot completion

Dates: October 26–30  
Goal: produce one coherent, scope-frozen Hindsight release candidate through the
same small-issue workflow.

Tasks:

- Freeze Internal TestFlight scope; route new ideas to backlog.
- Turn release-blocking findings into small, dependency-ordered Jira issues.
- Complete the remaining required pilot issues through Codex, trusted tests,
  independent review, PRs, approved merges, and post-merge verification.
- Remediate all P0/P1 product, UI-generation, accessibility, persistence, privacy,
  and trust findings in the frozen scope.
- Rerun the full inventory, journey, screenshot, accessibility, and migration
  matrices from one clean candidate SHA.
- Generate a candidate quality report bound to that SHA and the exact policy and
  evidence digests.

Exit gate:

- Three required issues—and up to five if they stayed small—have completed
  without manual Factory repair.
- One clean candidate SHA passes the whole-product gate with no unresolved P0/P1
  finding.
- Jira reaches Done only for verified merged work.

User gate: accept the feature freeze and the exact release-candidate scope.

## Week 13 — Apple release adapter and signed archive

Dates: November 2–6  
Goal: bind Apple/signing operations to the same durable approvals, resources,
and evidence model.

Tasks:

- Run App Store Connect access, agreement, bundle-ID, app-record, tester, signing-
  identity, and physical-device preflight.
- Add exclusive resource leases for signing, archive/export, build-number
  allocation, upload, and tester-group mutation.
- Define provider correlation by bundle ID, version, build number, archive digest,
  and App Store build ID.
- Validate icons, launch assets, privacy answers, support/privacy URLs, release
  notes, screenshots, entitlements, and export configuration.
- Archive and export the clean candidate SHA; hash and inspect the archive rather
  than trusting command exit status alone.
- Build timeout-after-upload and ambiguous-processing reconciliation fixtures.
- Generate the pre-upload release certificate and request approval bound to its
  exact SHA, archive digest, metadata digest, and build number.

Exit gate:

- One signed, exportable archive is fully traceable to the certified source SHA.
- An ambiguous Apple response cannot cause a duplicate build-number allocation or
  false success.
- No upload occurs without the release-specific approval.

User gate: ensure Apple Developer/App Store Connect access, agreements, signing
identity, internal tester, support/privacy URLs, metadata, and a physical device
are ready; approve the exact upload candidate.

## Week 14 — Internal TestFlight delivery

Dates: November 9–13  
Goal: upload and reconcile a new Factory-owned Hindsight build.

Tasks:

- Upload the exact certified archive through the release broker.
- Reconcile timeouts by querying bundle/version/build and archive correlation
  before retrying.
- Poll processing and expose Apple blockers without claiming success.
- Apply required compliance answers and map the approved internal tester group.
- Confirm that the processed App Store build maps to the release certificate.
- Emit a signed `release.testflight.available` lifecycle event only after the
  exact build is available internally.

Exit gate:

- A build newer than the historical build 4 is available in Internal TestFlight.
- Source SHA, archive digest, App Store build ID, version/build number, group, and
  evidence all agree.
- Duplicate upload and ambiguous-response tests remain green.

User gate: handle any Apple agreement or 2FA intervention and join/confirm the
internal tester group.

## Week 15 — Physical-device proof and command-center v1

Dates: November 16–20  
Goal: prove the actual distributed build and make the full delivery path operable
without reading raw logs or switching among provider consoles.

Tasks:

- Install the exact Factory-owned build from Internal TestFlight on a physical
  device.
- Run the named smoke journey and record device/build attestation, screenshots,
  failures, and final release certificate.
- Permit at most one bounded rebuild for a diagnosed release blocker; a rebuild
  receives a new build number and full recertification.
- Expand dashboard and MCP views for portfolio, project, issue/dependencies,
  attempt, blocker, PR/check, quality, approval, evidence, and release state.
- Add project-scoped and all-project reconciliation commands with dry-run first.
- Add resource-safe two-project concurrency only after single-project release
  reconciliation remains green.

Exit gate:

- The exact certified TestFlight build passes the physical-device smoke journey.
- CLI, MCP, and dashboard expose the same authoritative state and supported
  actions.
- No client calls Jira, GitHub, Apple, or SQLite directly.

User gate: perform or observe the device journey and approve any action that
changes release state.

## Week 16 — Buffer, controlled learning, and second-project proof

Dates: November 23–27 (reduced-capacity Thanksgiving week)  
Goal: absorb release variance, encode the first durable lesson, and prove that
the kernel is reusable without opening another large scope.

Committed tasks:

- Consume the week as release/recovery buffer if any earlier gate slipped.
- Convert the mixed-generation UI escape into:
  `Finding → root cause → historical regression → proposed policy/template change
→ independent review → approved policy version → replay → pinned adoption`.
- Run control-plane backup/restore and lost-machine/disaster-recovery drills.
- Produce the operator runbook, 16-week evidence index, reliability metrics, known
  limitations, and next-quarter backlog.
- Run read-only enrollment against one second project to prove the Hindsight
  adapter did not become kernel logic.

Conditional tasks only if every release gate is already green:

- Enroll the existing website as the second project.
- Consume `release.testflight.available` and generate exactly one structured-data
  website PR plus preview that marks Hindsight accurately as private beta.
- Require review before merge/deployment and do not expose an internal TestFlight
  link publicly.

Exit gate:

- One real Hindsight escape is now a reviewed cross-project regression rule.
- Factory state restores from backup and all release evidence verifies.
- A second repository can be scanned without kernel changes.
- If the website slice ran, one lifecycle event created exactly one reviewable PR
  and preview; production mutation remained approval-bound.

User gate: approve the policy change and, only if the conditional website slice
runs, approve status wording and deployment separately.

## Stage gates and schedule policy

| Gate  | Must be true before continuing                                                                   |
| ----- | ------------------------------------------------------------------------------------------------ |
| `G5`  | Core Week-4 reliability remains green after daemon/client operationalization                     |
| `G6`  | Hindsight clean base, preservation decision, product/design authority, and baseline are approved |
| `G8`  | Sandbox Jira/GitHub mutations pass duplicate, timeout, restart, and stale-fence tests            |
| `G9`  | At least one real Hindsight issue completes without manual Factory-state repair                  |
| `G11` | Known mixed-generation UI fails and candidate findings are complete                              |
| `G12` | One clean candidate SHA has no unresolved P0/P1 release finding                                  |
| `G13` | Signed archive and metadata are bound to a release-specific approval                             |
| `G14` | The exact new build is available in Internal TestFlight                                          |
| `G15` | The exact distributed build passes a physical-device smoke journey                               |

If a gate slips, downstream dates slide or Week 16 becomes buffer. Never recover
schedule by deleting reconciliation, protected-path checks, whole-product
quality, signing validation, evidence binding, or device testing.

Cut scope in this order:

1. website lifecycle preview;
2. two-project concurrency and dashboard cosmetics;
3. optional fourth and fifth pilot issues;
4. LaunchAgent convenience beyond safe foreground/detached operation.

Do not cut the three required pilot issues, quality regression, release
certificate, TestFlight reconciliation, or physical-device result.

## Branch and promotion model

Use:

```text
protected main
  <- qa (candidate coordination)
  <- dev (shared integration)
       <- short-lived issue branches
  + immutable candidate/release tags
  + SHA-bound QA, TestFlight, and release records
```

Per the repository owner's 2026-08-11 direction, this Factory repository keeps
long-lived `dev`, `qa`, and `main` coordination branches. Ordinary checkpoints
land on `dev`; a reviewed candidate may advance to `qa`; only separately
approved, verified work advances to protected `main`. Do not add parallel
`testflight` or `release` truth branches. Branch names are navigation and
promotion conveniences, never certification evidence: every QA, TestFlight,
release, and rollback decision must still bind one exact commit SHA and its
immutable evidence. Short-lived issue branches remain preferred for isolated
delivery work, and promotion must not silently re-resolve a moving branch.

## Account and infrastructure activation schedule

| When                | Needed                                                                       | Not needed yet                                   |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Weeks 5–6           | Local Mac, Codex, Git, Swift/Xcode; approval for new LaunchAgent             | GCP, Supabase/Firebase, CRM, marketing accounts  |
| Weeks 7–9           | Jira and GitHub credentials/capabilities                                     | Apple upload credentials until release preflight |
| Weeks 10–12         | Simulator runtimes and human visual baseline approval                        | Product analytics or feedback backend            |
| Weeks 13–15         | Apple Developer/App Store Connect, signing identity, tester, physical device | Public App Store campaign, ads, CRM              |
| Week 16 conditional | Website repository and hosting/deployment integration                        | Cross-app analytics and auto-publishing          |

No GCP, Supabase, or Firebase project is required for this roadmap. Product
backends are enrolled per app only when a product feature needs one; the Factory
control plane remains local SQLite.

## Explicitly after Week 16

- Public App Store submission and launch campaign.
- Cross-app behavioral analytics and a provider decision/event taxonomy.
- Feedback intake, deduplication, consent/privacy, and feedback-to-Jira module.
- SEO/AEO automation beyond the conditional website lifecycle preview.
- Weekly blog/Substack and LinkedIn draft scheduling.
- Automatic publishing, social-account management, CRM, email nurture, ads,
  attribution, sales automation, and growth experiments.
- Generic Jira/GitHub organization provisioning beyond the proved sandbox and
  Hindsight configuration.
- Claude as a second coding runner, LLM voting/debate, dynamic plugins, or a
  hosted 24/7 Factory.

Those are the next modular wave. They should consume signed product/release
events from the proven Factory rather than being built into its kernel.
