# build-me-a-prototype-for-a-marketing-platform — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

This round is where it actually clicked. The room spent two rounds split on what Ordinal even is, and round 3 is the first time real independent reasoning — not just repetition — landed people in the same place. Codex dropped its round-1 social-scheduling claim (without ever quite explaining whether that was "found it was wrong" or "picked something easier to build," which Claude rightly flagged as a gap worth naming, not hiding), and instead converged with Gemma3 and Claude on the same concrete shape: a campaign/brief/asset/review-approval workflow app. That's three people arriving at the same buildable design from three different angles, plus Claude doing the useful work of catching two real ambiguities before they became build-time coin-flips — what "versioning" means (append to history, never overwrite, mark current version) and what an "approval log" means in a single-user app (a timestamped status-history trail, not a hidden multi-actor system). Nobody pushed back on either fix.

Two things got explicitly killed and should stay dead: Gemma3's round-1 NFT/wallet tangent (confused "Ordinal" the marketing tool with "Bitcoin Ordinals"), and — new this round — Qwen's transcript is fabricating a participant named "Eva" who never actually spoke; that's not a real voice in this room and shouldn't count as a data point toward consensus.

The one honest caveat everyone (Codex and Claude both, independently) insists stays in the contract: nobody has successfully loaded tryordinal.com, so this feature shape is the best-reasoned guess in the room, not a confirmed fact. The fix isn't more guessing — it's a standing decision rule that the next phase must actually re-fetch the site (and fall back to secondary sources like the App Store listing if that keeps failing) before treating any of this as locked truth.

CONSENSUS: YES

## Final Output

**Original prompt (preserved verbatim):** "Build me something like ordinal. I want to copy their feature set. Here is the link: https://www.tryordinal.com"

**Product interpretation (working assumption, not yet independently verified against the live site):** A single native iOS app, inspired by Ordinal's marketing-workflow shape — campaign/brief intake, asset upload and review, and approval gating — reimagined as a local-first, single-user tool rather than a literal clone of a multi-tenant web SaaS.

**Hard requirements:**
- One SwiftUI iOS app, single-user, fully offline, deterministic local persistence (SwiftData/Core Data) — no backend, no login system.
- Campaign and Asset as first-class persisted objects.
- A brief-intake screen (goals/audience/tone/platform context, free-text is fine).
- Asset upload and organization, grouped under a Campaign/Project.
- Asset versioning that's non-destructive: new versions append to a history list, the current version is always clearly marked, nothing gets silently overwritten.
- A review/approval flow with an explicit state machine: Draft → In Review → Approved / Needs Rework, where sending something back to Rework requires a non-empty note.
- A timestamped status-history log per campaign/asset — this is a single-actor audit trail (there's only ever one user), not a multi-person activity feed.
- Full CRUD with safe/undoable deletion, including edge cases like deleting an asset mid-review or a campaign with zero assets.
- Every screen needs real empty, loading, success, and error states — no placeholders, no stub screens.
- Accessibility (labels, dynamic type, contrast, focus order) and privacy defaults (no background collection, no remote data sharing) from day one.
- Data must survive app relaunch reliably.

**Non-goals (explicitly out of scope for this build):**
- Multi-user collaboration, team accounts, roles/RBAC.
- Any real integration with external platforms — social media APIs/OAuth, Slack, Adobe, ad platforms, CRMs, webhooks/MCP.
- Any real posting or engagement automation against live accounts (this is a genuine safety/ToS risk, not just a scope call — nothing in this app touches real credentials or real platforms).
- Billing/subscriptions, multi-tenant workspaces, server-side job queues.
- Any web-parity claim against tryordinal.com's actual site.
- NFT, wallet, or Bitcoin-Ordinals-related functionality of any kind — dead, do not resurrect.
- Third-party packages by default. One may be introduced later only if Apple's own frameworks genuinely can't do the job, and it must be justified explicitly in-contract when proposed.

**Production-readiness definition:** Not a mockup or wireframe shell — a complete, working loop where a user can create a campaign, add a brief, upload and version assets, run them through review to approved-or-rework, and see a persistent status history, entirely offline, with no crashes, no silent data loss, and real (not stubbed) empty/loading/success/error states across every screen, including the edge cases named above.

**Decision rules for later phases:**
- Any feature that implies external auth, backend collaboration, real platform API writes, or multi-user identity is deferred by default — it cannot become a hard requirement.
- Before implementation begins, the next phase must attempt to re-fetch tryordinal.com (and /pricing) directly. If confirmed, reconcile any differences from this contract's assumptions. If the fetch keeps failing, fall back to secondary sources (App Store listing, press coverage) rather than further agent guessing, and the final review must state plainly that this contract was built without a confirmed first-party source.
- Anything that can't be traced to an actual citation goes into a "deferred/unverified" bucket, not into hard scope.
- If ambiguity resurfaces the way "versioning" or "approval log" did here, resolve it with an explicit, written rule at the time it's found — don't let it become an undocumented judgment call at build time.

## Product Research

CONSENSUS: YES

Here's where the room landed. Codex and Claude did the real work this round, and rather than clashing they filled in different halves of the same picture — Codex focused on UX patterns and information architecture, Claude focused on data/storage architecture and edge-case risk. Gemma3 mostly repackaged the existing contract under the name "Flow" with a timeline-view addition that Codex had already proposed, so it doesn't add new disagreement. Qwen's contribution this round is just a verbatim copy of the prior phase's final contract — no new research content, so it shouldn't count as an independent voice, same as the "Eva" issue flagged last phase; worth naming so nobody mistakes it for a fourth independent confirmation.

On substance, nobody contradicted anybody. The group agrees the audience is a solo operator — freelance marketer, one-person in-house function, or agency contractor — working in bursty, interstitial moments (reviewing on the couch, approving between meetings), which makes iPhone the primary target and iPad a non-driver for v1. They agree on borrowing proven native patterns rather than inventing UI: Photos.app's non-destructive edit-history model for versioning, Reminders/Things-style list CRUD with swipe actions, a Kanban-style status board for the review state machine, plus Share Sheet import and QuickLook for media preview instead of custom viewers. Platform opportunities converge on speed and native feel: one-tap asset intake from camera/Photos/Files, typed or voice brief capture, swipe gestures for status changes, local (on-device only) notifications for stale "In Review" items, and a timeline/queue view.

The risk list is longer than three and nobody pushed back on any item: (1) the Ordinal feature list is still unverified — this phase inherits that caveat and doesn't resolve it, that's for the next phase to re-fetch; (2) the Campaign/Brief/Asset/Review object model needs to be frozen now since the whole screen flow depends on it; (3) asset bytes should be file-backed in Documents/Application Support with SwiftData holding metadata + URL references only, not embedded blobs, to avoid store bloat/fragility; (4) "safe/undoable deletion" needs one concrete mechanism decided now — Claude's proposal (short undo toast + a trash/restore section) is on the table and nobody objected; (5) non-destructive versioning has an unbounded storage-growth failure mode that should be documented as a known v1 limitation, not solved; (6) single-device persistence (no sync/iCloud) means losing the phone means losing everything — that needs to be stated plainly rather than surfacing as a surprise later; (7) an explicit answer is needed for what happens if the only version of an asset is deleted while its campaign is "In Review."

## Final Output

**Audience and use context:** A solo marketing operator — freelancer, one-person in-house marketer, or agency contractor managing a handful of client campaigns alone, with no one to hand work off to. Usage is bursty and interstitial (reviewing feedback on the couch, approving between meetings, drafting a brief on the go), which makes iPhone the primary and only real design target for v1; iPad is out of scope, not a driver.

**Comparable apps or patterns to learn from:** Photos.app's non-destructive edit-history model (edit stack, always-know-the-current-version) as the direct precedent for asset versioning; Reminders/Things for list-based CRUD, empty states, and swipe-action vocabulary; a Kanban-style status board/filter-chip metaphor for the Draft → In Review → Approved/Rework state machine; Figma's "version + comment + status" rhythm as a mental model for review clarity; Notion/Airtable-style flexible metadata tagging for campaigns. All reproducible with SwiftUI `List`, swipe actions, SF Symbols, and QuickLook — no third-party package needed.

**Platform-specific opportunities:** Share Sheet integration so assets import directly from Photos/Files/Safari into a campaign; QuickLook for previewing image/video/PDF assets instead of a custom media viewer; camera/photo-library one-tap asset intake; typed or voice brief capture; swipe gestures and contextual action chips ("Submit for review," "Mark rework") for fast status transitions; a timeline/queue view for scanning campaign progress at a glance; local, on-device-only notifications nudging about stale "In Review" items (no server, consistent with the privacy non-goals).

**Major assumptions and risks:**
1. The Ordinal feature list remains unverified from a live source — this is still a working assumption, not fact, and the next phase must attempt the re-fetch per the existing decision rule.
2. Campaign, Brief, Asset, and Review-state must be frozen as the core object model now, since the screen flow and data model both depend on it.
3. Asset binary data should be file-backed in Documents/Application Support with SwiftData/Core Data holding only metadata and a URL reference — embedding large media blobs directly in the persistent store risks bloat and fragile launches.
4. "Safe/undoable deletion" needs one concrete mechanism, not an ad hoc build-time decision: a short-lived undo toast plus a restorable trash section is the working answer.
5. Non-destructive versioning has an unbounded storage-growth failure mode (nothing is ever deleted) — this is a known, accepted v1 limitation to document, not solve.
6. No sync or iCloud backup means all data lives on one device — losing the phone loses everything. This must be stated plainly to the user/in review output, not discovered as a surprise later.
7. Edge case needing a defined answer before build: what happens if the only version of an asset is deleted while its campaign is "In Review"? (Recommended default: block/require confirmation and auto-transition the campaign or asset back to a safe state rather than leaving it orphaned — the actual rule should be nailed down explicitly in the design phase.)

**Implications for the first build:** Minimum four screens — campaign list/filters, campaign detail (brief + status overview + timeline), asset list/detail (with version history), and a status-history log screen. Freeze the Campaign/Asset/Review object model immediately. Store asset bytes as files with SwiftData metadata pointers. Implement one concrete delete/undo pattern (toast + trash) rather than inventing it mid-build. Use Share Sheet and QuickLook to cut custom-UI risk. Every screen keeps real empty/loading/success/error states and explicit recovery paths (undo delete, retry on validation failure). Document the single-device data-loss risk and the unbounded-versioning-storage limitation as known, named v1 constraints rather than silent gaps.

## Portfolio Selection

CONSENSUS: YES

Here's where the room landed on round 1: everyone agrees, without any real pushback, that this is a single-app request — one native iOS "marketing campaign cockpit" app, not a portfolio. The original prompt asks for one thing ("something like ordinal"), and the whole contract locked over the last three phases already assumes one integrated object model (Campaign, Brief, Asset, Review-state) — splitting that into separate sibling apps (a "brief app," an "asset app," a "review app") would actually break the design everyone already agreed to, since those pieces are meant to work as one connected flow, not independent products. So: one folder, build=true, no portfolio-json needed.

Where people added value without contradicting each other: Claude (Product Strategist seat) pushed the group past just restating the contract and into what actually matters for day one — the review-decision screen (looking at an asset and hitting Approve or Needs Rework) is the single highest-stakes moment in the whole app and deserves outsized design/QA attention, brief intake should be one fast free-text field with everything else optional/collapsed so campaign creation takes under 15 seconds, and the first-launch empty state needs to get a new user to their first campaign in one tap rather than a passive "nothing here" message. Nobody in the room pushed back on any of that — it reads as a refinement everyone's fine with, not a fork. Gemma3 flagged wanting a deeper conversation about "versioning" semantics, but that's already been resolved explicitly in earlier phases (append-only history, current version always marked, never overwritten), so that's not actually open — just a contributor catching up to where the contract already is, not new disagreement.

## Final Output

**Single-app vs. portfolio-parent decision:** Single app. No portfolio split. The prompt requests one product, and the locked contract already treats Campaign/Brief/Asset/Review as one integrated domain — dividing it into sibling apps would fragment a workflow that's designed to be one connected loop.

**Selected app:**
- Category: marketing workflow / campaign production
- Slug: `marketing-campaign-cockpit`
- Promise: Let a solo marketer create campaigns, capture a brief, upload and version assets, move each asset through Draft → In Review → Approved/Needs Rework, and keep a persistent local audit trail — entirely offline, single-user, on iPhone.
- Target user: Freelance marketer, agency contractor, or one-person in-house marketing operator managing a handful of client campaigns alone.
- Build: true

**Selection rationale:** The prompt is singular ("build me something like ordinal"), and three prior phases of debate already converged on one buildable object model. A single SwiftUI app is the only shape that can ship the full brief→asset→review→approval loop reliably without inventing cross-app sync or artificial seams between what is really one workflow.

**Rejected alternatives:** A separate scheduling/publishing companion app, a standalone analytics app, and an asset-management-only app were all considered and rejected — each would either duplicate the same core state machine, require backend/integration assumptions explicitly ruled out as non-goals, or represent an unverified guess about Ordinal's actual (still-unconfirmed) feature set rather than the grounded contract this room already built.

**Carried-forward product notes for the build phase (non-binding refinements, not new hard requirements):** treat the review-decision screen (current asset version + Approve/Needs Rework, QuickLook-based, hard to misclick) as the product's center of gravity; keep brief intake to one fast free-text field with audience/tone/platform genuinely optional and collapsed; make the first-launch empty state guide a new user to a created campaign in one tap.

**Portfolio-json:** Not applicable — this prompt does not require a portfolio split; recorded explicitly per phase rules.

## Initial Discussion

CONSENSUS: YES

Here's the read on round 1. Codex and Claude both did real, substantive work and didn't contradict each other anywhere — Codex nailed down the product promise, primary user, core loop, and hard scope boundaries at the level this phase asks for, and Claude built directly on top of that with the actual screen-by-screen shape (Campaign List → Campaign Detail → Asset Detail → Status History) plus three concrete decisions that close gaps rather than open new ones: Approve requires a deliberate tap-and-confirm while Rework can be a single tap (because a wrongly-approved asset is the worse failure mode), deleting an asset that's the only one on an "In Review" campaign auto-reverts that campaign to Draft with a logged system line rather than leaving it orphaned, and previewing an old version is read-only — "restoring" an old version has to append as a new version, never silently rewrite history. Nobody pushed back on any of that, and it doesn't conflict with anything locked in earlier phases.

Gemma3 and Qwen's contributions this round are the same pattern flagged in every earlier phase of this run — near-verbatim restatements of the existing locked contract (Qwen's message even cuts off mid-sentence), not new independent reasoning, so they don't count as additional confirmation, but they also don't contradict anything Codex or Claude said.

Net: this phase's required outputs are all present, specific, and self-consistent — a one-sentence promise, a named user and scenario, a concrete four-screen core loop, explicit hard scope boundaries, and measurable, checkable success criteria. Scope is small enough to build in one pass and the out-of-scope list is explicit.

## Final Output

**One-sentence product promise:** A local-first SwiftUI iPhone app that lets a solo marketer take a campaign from a one-line brief through versioned asset uploads to an Approve/Needs-Rework decision, entirely on-device, with every transition permanently logged.

**Primary user and scenario:** A solo marketing operator (freelancer, one-person in-house marketer, or agency contractor) managing 2–6 campaigns alone, working in short interstitial bursts — drafting a brief on a train, reviewing an asset on the couch, approving between meetings. Never at a desk with focused time, so every core action must be reachable in two taps and the review decision must survive being done one-handed.

**Core loop (four screens, nothing more):**
1. **Campaign List** — persistent, unmissable "new campaign" affordance.
2. **Campaign Detail** — brief text, asset grid, status summary.
3. **Asset Detail** — current version pinned at top (e.g. "v3 of 3, uploaded Tuesday") with QuickLook preview, collapsed version-history strip below (tapping an old version previews it read-only; "restoring" it appends a new version, never overwrites), and Approve / Needs Rework controls. Approve requires a deliberate tap-and-confirm; Needs Rework is a single tap but requires a non-empty note. No swipe-to-approve, ever.
4. **Status History** — append-only log, per-asset and rolled up per-campaign, including system-generated lines (e.g. "asset removed, reverted to Draft").

**Hard scope boundaries:** One native iOS app, single-user, fully offline, no backend, no login, no team collaboration, no social/platform integrations or automation, no analytics beyond local history, no multi-device sync, no third-party packages unless Apple frameworks genuinely can't do the job. No fifth screen (no dashboard, no settings tab, no insights) — the only allowed addition is a static "About/limitations" screen disclosing the single-device data-loss risk. If a campaign's only asset is deleted while "In Review," the campaign auto-reverts to Draft rather than being left orphaned or silently vanishing.

**Measurable success criteria:**
- A first-time user goes from cold launch to a created campaign with a brief in under 15 seconds, with only the free-text brief required.
- All four screens demonstrably show correct empty/loading/success/error states — verifiable by wiping data and relaunching, and by force-killing mid-upload.
- A full cycle — create campaign → brief → upload v1 → upload v2 → submit for review → rework with note → upload v3 → approve → view history — survives an app relaunch with every version and timestamped transition intact, byte-identical.
- Deleting an asset mid-review and deleting a zero-asset campaign both complete without crashing and without leaving orphaned state (no asset pointing at a dead campaign, no campaign stuck in an impossible status).

If any of these can't be demonstrated, the app isn't done — regardless of how much of the broader feature list got built.

## Per App Product Brief

**Round 1 recap**

Codex, Claude, Gemma3, and Qwen all landed on the same product shape — no real fork this round. Qwen's contribution is a verbatim restatement of the already-locked prompt contract, so it's not adding independent signal, just confirming nothing here contradicts earlier phases.

The real work came from Codex, Claude, and Gemma3, and they filled in complementary pieces rather than clashing:

- **Target user/use case**: unchanged — solo freelancer/agency operator managing a handful of campaigns in short bursts, needing one trustworthy place where "what's current" and "what's approved" never get lost.
- **Paid value**: Claude did the sharpest work here, catching a real trap before it became a build-time contradiction. The locked contract says "no billing/subscriptions" as a non-goal — but that non-goal means no server-side payment backend, not "no conceptual Free/Pro split." Claude's fix: define a real Free/Pro split functionally, but implement it (if at all) via on-device StoreKit or an explicitly-labeled simulated "Pro unlock" toggle — same pattern the project already used for "simulated publish." No custom billing server, ever. Codex's paid-value framing (avoiding costly mistakes, time saved) and Claude's concrete gate (Free = 2 campaigns + 5 versions visible, older versions hidden-not-deleted; Pro = unlimited + encrypted local backup/export) are consistent and nobody pushed back.
- **Non-negotiable rule everyone implicitly agrees with**: caps must hide, never delete, so monetization can't violate the already-locked non-destructive-versioning guarantee. Same for campaign caps on downgrade — never delete or lock existing campaigns, only block new creation.
- **Core loop**: identical to what's already locked (brief → version → review → approve/rework → history), and Claude explicitly adds that the review-decision screen must never get a paywall interstitial.
- **Competitive wedge**: convergent — the wedge is zero setup/zero login/nothing-can-leak-because-there's-no-server, framed directly against Ordinal being a team SaaS that assumes accounts and connectivity.
- **Growth angle**: convergent — not viral, niche word-of-mouth via freelancer/agency communities, with Claude adding the concrete mechanism (a presentable client-facing export/review packet acting as an organic "what tool is this" prompt).
- **Local-first/cloud-ready**: convergent — v1 is fully local (SwiftData + file-backed assets, zero network calls), and the cloud-ready path is user-controlled manual export/import (encrypted backup file to Files/iCloud Drive), explicitly not automatic sync — any future CloudKit sync would need its own explicit justification later, same bar as a third-party package.

Gemma3's brief mostly restates the same territory but introduces one thing nobody else endorsed: "future cloud path" framed as a roadmap commitment, and success metrics (15-minute campaign creation, retention rate) that are looser than the 15-second/under-15-second creation bar already locked in earlier phases. That's a minor drift, not a real disagreement — the group already has a tighter, more specific version of both ideas from earlier phases and from Claude this round.

Nothing here is actually contested. Everyone's reasoning is additive, not competing.

CONSENSUS: YES

## Final Output

**Target user and use case:** A solo marketing operator — freelancer, one-person in-house marketer, or agency contractor — managing 2–6 campaigns alone, working in short interstitial bursts (train, couch, between meetings). The app exists to be the single trustworthy place where "what's the brief," "what's the current asset version," and "what's approved" are always in sync, replacing a fragmented mess of Notes/email/chat/cloud folders.

**Paid value and subscription value (functional, not cosmetic):** Free and Pro run the identical core loop with identical reliability — money only touches two things. Free tier: capped at 2 active campaigns and visibility into the 5 most recent asset versions (older versions are hidden behind an "Upgrade to view full history" label, never deleted — the non-destructive versioning guarantee is never violated by monetization). Pro tier: removes both caps (unlimited campaigns, full version history) and adds encrypted local backup/export the user can save to Files/iCloud Drive/AirDrop and restore later — turning the app's own admitted single-device data-loss risk into the actual value a Pro user is buying. Since "billing/subscriptions" is locked as a non-goal (no backend), any purchase mechanism must be on-device StoreKit or an explicitly UI-labeled simulated "Pro unlock" toggle — never a server we run. The review-decision screen (Approve/Needs Rework) is never gated or interrupted by a paywall prompt.

**Core loop:** Create a campaign with a fast free-text brief (under 15 seconds) → upload an asset as v1 → append new versions non-destructively as work iterates → move the asset through Draft → In Review → Approved/Needs Rework (rework requires a non-empty note) → review the permanent, timestamped status history. Identical for Free and Pro, gated only by the caps above.

**Competitive wedge:** Ordinal is a team SaaS — accounts, login, connectivity, likely social/publishing automation. This app is the deliberate inverse: zero setup, zero login, works offline/on a plane, and — the sharpest pitch — a client's unreleased creative work literally cannot leak because there's no server to breach. That's a real value proposition for freelancers holding NDA'd pre-launch assets, not a workaround for missing a backend.

**Viral or niche growth angle:** Not viral — there's no second user to invite. Growth is niche word-of-mouth among freelancers and micro-agencies, driven by Pro users exporting a clean, presentable "campaign review package" (asset + version + approval status) to their own clients via Files/AirDrop/email. That artifact functions as an organic advertisement — someone on the receiving end asking "what tool is this" is the whole growth loop, so the export needs to look genuinely professional, not like a debug dump.

**Local-first and cloud-ready plan:** v1 ships fully local — SwiftData metadata, file-backed asset bytes, zero network calls of any kind, consistent with every earlier locked phase. The cloud-ready path is strictly user-controlled manual export/import of an encrypted backup file (Files/iCloud Drive) — no accounts, no server, no automatic sync, so it doesn't quietly reopen the multi-device-collaboration non-goal. Any future automatic CloudKit-style sync would need to be explicitly proposed and justified later, held to the same bar as introducing a third-party package.

## Next Steps Small

Everyone converged on the same shape, with genuine sharpening rather than conflict.

## Final Output

CONSENSUS: YES

The room agrees the MVP is one complete, end-to-end loop for a single campaign and a single asset — not four partially-built screens. Concretely: launch the app, create a campaign with just a one-line brief, import one photo/video as v1, preview it in QuickLook, submit for review, get sent to rework with a required note, upload v2, submit again, approve it with a deliberate confirm-tap, and see every one of those steps sitting in a real, timestamped status history — all of it surviving a force-quit and relaunch.

Codex and Claude did the heavy lifting and ended up in the same place from different angles: Codex nailed the mechanical guardrails (append-only versioning, auto-revert-to-Draft-with-log-line if the only in-review asset gets deleted, a 10-second undo window on destructive actions), while Claude pushed on making sure this doesn't ship as a flat, checkbox-complete-but-lifeless demo — the review-decision screen and the status-history screen are the emotional core of the product and need to actually feel weighty (unmistakable version badges, a real confirm step for Approve, a status history that reads like a story). Nobody disagreed with either framing; they're additive.

Gemma3 pushed for an even thinner slice (drop version history entirely, just "approve" a single upload) — that's a real, if minor, disagreement with the rest of the room, since Codex/Claude/Qwen all treat the rework→v2→approve cycle as non-negotiable for proving the concept (a single-tap-approve with no version history doesn't actually validate the thing this app exists to prove). Qwen's contribution is a verbatim restatement of the locked contract, so it doesn't add or contest anything.

**MVP slice:** Campaign List → Campaign Detail → Asset Detail → Status History, but validated through exactly one campaign and one asset taken through the full cycle: brief → v1 → submit → rework (with note) → v2 → submit → approve → history. A list screen with a single item still counts as done.

**Must-have interactions:** one-tap "new campaign" from an empty state; single required free-text brief field (audience/tone/platform exist as unused schema, not rendered UI); asset import via Photos/Files picker; QuickLook preview of the current version; non-destructive version bump (old versions never overwritten, current version clearly marked); Draft → In Review → Approved/Needs Rework with asymmetric friction (Approve requires tap-and-confirm, Rework is a single tap but blocks on an empty note); a status-history log showing both user decisions and system-generated lines (e.g., the auto-revert-to-Draft case); deleting the only in-review asset auto-reverts its campaign to Draft with a logged line; every destructive action gets a ~10-second undo.

**Cut list (deferred, not wrong):** Free/Pro tiering and any purchase UI, encrypted backup/export, local notifications, multiple concurrent campaigns as a validation requirement, tags/search/filtering, campaign-type dropdowns, the About/limitations screen (nice to have, not load-bearing), any dashboard/timeline/kanban view beyond the four core screens.

**Validation criteria:** cold launch to a created campaign with a brief in well under 15 seconds; the full v1→rework→v2→approve cycle survives a force-quit/relaunch with every version and timestamped transition intact and correctly ordered; Approve cannot be fat-fingered (confirm-tap required) and Rework cannot submit with an empty note; deleting the in-review asset mid-flow reverts the campaign to Draft without crashing or orphaning state, and is undoable within the window; every one of the four screens shows a real (non-stub) empty/loading/error state, provable by wiping the data store and by killing the app mid-upload.

## Detailed Discussion

CONSENSUS: YES

## Final Output

Everyone's on the same page here — Codex, Claude, and Gemma3 all reinforce rather than contradict each other, and this rounds out the ambiguity this phase exists to kill. (Qwen didn't respond this round — no new voice, no contradiction either.)

**Resolved requirements:** The domain is anchored on two invariants that must never be violated by anything built later — a Campaign is always the source-of-truth container, and each Asset has append-only versions with exactly one current pointer. Brief intake is one required free-text field, everything else optional. States are strictly Draft → In Review → Approved / Needs Rework, Rework blocked on an empty *or whitespace-only* note (Claude's catch — trim before validating). Deletion is only ever at the whole-asset level — individual versions can never be independently deleted, since that would break the append-only guarantee everyone locked back in round one. Undo is implemented as a **soft delete**: the item moves to a trash location immediately and a status flag flips, the 10-second toast is purely a UI countdown, and a background sweep on next launch finalizes anything past its window — this avoids the real bug Claude flagged, where a deferred/timer-based delete could race an app kill and either resurrect or prematurely finalize.

**Edge cases enumerated (build-time, not QA-afterthought):** empty campaign (brief-only, zero assets); unsupported/corrupt file import (zero-byte, unreadable video, unrenderable HEIC variant); Photos/Files permission denial (must produce a real recoverable UI state with a Settings deep link, never a silent no-op or crash); disk write failure mid-import; app killed mid-upload or mid-undo-window; deleting the only in-review asset → auto-revert campaign to Draft with a logged system line; rapid successive version uploads causing interrupted writes; broken file URL after an OS migration; device clock changes potentially reordering timestamped history (accepted as a named limitation, not something to engineer around).

**Data and privacy implications:** Asset bytes are file-backed (Documents/Application Support), never embedded blobs; SwiftData holds only metadata + URL references. No network calls, no background collection, permission prompts are strictly request-on-use. Standard iCloud *device* backup (Apple's own OS-level backup, not app-built sync) is allowed and disclosed rather than fought — excluding a user's own creative work from their own phone backup would arguably hurt them more — but this must be a named, visible decision (surfaced in the About/limitations screen), not a silent default. Version history storage is unbounded from day one at the data layer regardless of what UI caps get added later, so the deferred Free/Pro tiering never requires a retrofit that discards previously-kept history.

**Risk register (with mitigations or named-as-limitation status):**
- Ordinal parity is still unverified — carried forward again, still blocking full "matches Ordinal" claims; mitigation is the standing re-fetch rule already in the contract.
- Unbounded version-storage growth — accepted v1 limitation, not solved.
- Single-device-only persistence — real, disclosed data-loss risk if the phone is lost, surfaced to the user, not just documented internally.
- File lifecycle/corruption risk — mitigated by atomic writes plus existence/validity checks before use.
- Clock-integrity risk to the status-history log — accepted and named, not engineered around, since it's rare and full clock-tamper defense is out of scope.
- Scope-creep back toward collaboration/network assumptions — mitigated by treating the two domain invariants (campaign-as-container, append-only versions) as non-negotiable gates on any future feature.

**Final assumptions carried forward:** single-user is the only valid mode for v1; approval is logged and traceable but the underlying action set stays reversible via soft-delete/undo within the window — status transitions themselves are never rewritten, only appended to; the MVP's definition of success is unchanged from the prior phase (one full v1→rework→v2→approve cycle surviving relaunch with intact history); and everything Gemma3 raised this round (single free-text campaign field, local SwiftData persistence, no team/external/automation features) is consistent with, not a new addition to, what's already locked — it doesn't introduce new scope, just re-confirms it.

No open ambiguity remains that would block design or architecture from proceeding.

## App Features

CONSENSUS: YES

## Final Output

The room is basically in agreement on the shape, with one clear holdout worth naming plainly.

Codex and Claude (the two doing substantive work this round) converge on the same must-have list, framed slightly differently but not in conflict: Codex writes it as user stories with acceptance criteria per feature; Claude sharpens the bar by insisting every acceptance test be a force-kill-and-relaunch test, not a happy-path tap-through. Between them, the must-have list for this build is:

**Must-have (with acceptance criteria):**
1. **Cold-start campaign creation** — one required free-text brief field, campaign created in under 15 seconds from first launch. Acceptance: empty state has a one-tap CTA; save works with only the brief filled; empty/whitespace-only input is blocked with recoverable feedback.
2. **Asset import from Photos/Files** — saved as v1, file-backed on disk, SwiftData holding metadata + URL only. Acceptance: permission denial shows a recoverable state with a Settings deep link (not a silent no-op); corrupt/unsupported files produce a named error state, never a crash; force-killing mid-import leaves no orphaned metadata pointing at a missing file.
3. **QuickLook preview of current version.** Acceptance: images and video both render; corrupt/zero-byte files show an explicit error state instead of a blank pane.
4. **Non-destructive version append with explicit current marker.** Acceptance: new upload creates vN without touching prior versions; current version is unambiguous in the UI; old versions open read-only; force-killing between two uploads still leaves version count and current-pointer correct on relaunch.
5. **Guarded review state machine** (Draft → In Review → Approved/Needs Rework). Acceptance: Approve requires a deliberate confirm tap, never a single-tap path; Rework is blocked on an empty-or-whitespace-only note (trimmed before validation); invalid transitions are impossible.
6. **Append-only, timestamped status history**, including system-generated lines. Acceptance: survives relaunch; a full v1→rework→v2→approve cycle produces a correctly ordered, gap-free, duplicate-free log after a force-kill and relaunch.
7. **Soft-delete with undo**, plus the auto-revert-to-Draft edge case. Acceptance: deleting moves the item to trash immediately (status flag, not a deferred timer); undo works within the window; force-killing mid-undo-window leaves the item recoverable, not resurrected-as-active or silently hard-deleted; deleting the only in-review asset auto-reverts its campaign to Draft with a logged system line, tested as its own explicit scenario.
8. **Deterministic local persistence**, fully offline. Acceptance: app is fully usable with no network; crash/force-quit mid-import never corrupts referential integrity; full cycle round-trips through relaunch.
9. **Real empty/loading/success/error states on all four screens.** Acceptance: provable by wiping the data store (empty) and force-killing mid-import (interrupted loading), not simulated.

**Should/could (nice if time allows, not schedule-protected):** About/limitations screen (single-device data loss, iCloud device-backup disclosure); validating with more than one concurrent campaign; audience/tone/platform fields actually rendered in the brief UI; voice/camera capture shortcuts; search/filter chips; review queue sorting.

**Won't-build:** Free/Pro tiering and any purchase UI, encrypted backup/export, local notifications, tags/search/filtering as a built feature, any dashboard/timeline/kanban view beyond the four locked screens, per-version deletion (only whole-asset deletion is ever allowed), iPad layout, team/social/API/billing-backend features of any kind, automatic cross-device sync.

The one real, named disagreement: Gemma3 is pushing a thinner slice again — a campaign-type dropdown (four fixed categories) instead of pure free-text, drag-and-drop single-image-only import, and single-tap Approve with no version history or rework loop at all. This directly conflicts with the must-have list above and with everything locked in every prior phase (free-text-only brief, asymmetric Approve/Rework friction, non-destructive versioning as core to the product's reason for existing). Codex and Claude's version is what's carried into the final output — Gemma3's thinner cut is noted as a rejected minority position, not folded in, since a single-tap-approve-no-history loop doesn't actually prove the thing this app exists to prove. Qwen did not respond this round (CLI unavailable) — no new vote either way.
