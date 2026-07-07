# chapterly — Product Requirements (PRD)

_Deterministic render of the discovery/scoping phases' final decisions. Non-AI; missing phases are N/A, never invented._

## Prompt Contract

Here's where things stand: only Codex actually weighed in this round — I (Claude) hit a spend cap before I could respond, and Gemini's CLI is unavailable in this environment. So there's no real second opinion to reconcile against, and nothing Codex said is contentious — it's a faithful, thorough translation of the parent prompt's rules plus the app spec into a concrete contract. Given the acceptance checks for this phase (can a later phase tell if it's violating the prompt; are quantity/category rules explicit; does "production-ready" mean more than a prototype), Codex's writeup satisfies all three cleanly. There's no open disagreement to carry into another round — just an absent second voice, not a substantive split.

CONSENSUS: YES

## Final Output

**Original prompt:** preserved verbatim above (Chapterly spec, nested inside the batch-cat-b3 portfolio prompt requiring 9 apps across Social Networking/Travel/Utilities, uniqueness rules against named prior apps and sibling batches).

**Hard requirements:**
- SwiftUI, local-first, deterministic, Apple-framework-first (no third-party dependency unless it materially reduces risk).
- Ship the full v1 scope: personal reading log; manual quote capture; Vision OCR quote capture; rating/reflection; one circle invited and shared via Messages/share sheet; personal reading timeline and stats.
- Ship the named iOS-native features: Vision OCR, share-sheet/Messages invite flow, widgets (currently-reading + streak), App Intents/Siri quote logging.
- Every reachable screen needs empty/loading/success/error states.
- Real, working local persistence that survives relaunch; graceful handling of denied camera/contacts permissions and OCR failures.
- Accessibility, privacy, persistence, and testing are treated as product requirements, not polish.
- Architecture must leave a clean seam for a future CloudKit/private-server sync layer without a rewrite — but that sync layer is not built now.
- Own project folder under `/Users/pchordia/Documents/iOS-App-Factory`, distinct from every other portfolio app and from the disallowed prior concepts.

**Non-goals for this phase forward:**
- No backend, no real-time sync, no public feed, no discovery/recommendation algorithm, no bookstore integrations, no large community features, no cross-platform work.
- No heavy on-device LLM commitment in v1 — discussion-prompt generation can be stubbed or deferred if it threatens delivery.
- No requirement to fully build paid-entitlement plumbing, advanced export sophistication, or multi-circle depth in the first build — architect for it, don't have to finish it.
- Must never become a social timeline/feed — that's an explicit tripwire, not a style preference.

**Production-readiness definition:** installable and usable by a normal iPhone user with no dev hand-holding; data persists correctly across relaunch; permissions are explained and denials handled; OCR failure / no-camera / no-contacts / no-data states are all real states, not crashes; widgets and intents demonstrably work; visual identity stays warm/literary/editorial throughout. This does not require every subscription feature to be live, but the app must feel coherent, trustworthy, and shippable as a whole.

**Decision rules for later phases:**
1. Smaller finished app beats broader unfinished scope.
2. When solo vs. social conflict, protect the solo journal/capture/reflect loop first — but never cut the one-circle Messages-sharing promise entirely.
3. When visual ambition conflicts with implementation risk, keep the editorial identity but favor robust native implementation over fragile ornament.
4. When AI ambition conflicts with reliability, keep OCR if it performs adequately; defer on-device LLM discussion prompts unless clearly low-risk and valuable.
5. When category purity (Social Networking) conflicts with usefulness, anchor to the actual pain point: a place for a finished-book reaction, shareable with 2–3 trusted people — not a feed, not a chat app, not Goodreads-private.

## Initial Discussion

CONSENSUS: YES

## Final Output

The group's actually pretty aligned here — Codex and Claude converged from different angles (one design-first, one QA-first) on the same shape, and neither contradicted the other. Here's the landing spot:

**Product promise:** Chapterly is a private reading journal — log a book, capture a quote (typed or OCR'd), rate and reflect — where a finished journal entry can optionally be shared, as a complete artifact, to one small trusted circle (2-6 people) via Messages. It is never a feed, never a chat app, never Goodreads-private.

**Primary user & scenario:** An adult who reads regularly, just finished a book or chapter with a real reaction, wants to capture that reaction (quote/rating/note) immediately, and occasionally wants to forward it to the one or two specific people who'd actually care — without starting or hunting through a group chat.

**Core loop:** Log a book → capture a quote (manual or OCR, always user-confirmed before saving) → rate/reflect → entry lands in personal timeline/stats → optionally share that *finished* entry to your circle via the Messages share sheet. Sharing happens after the personal artifact is complete — it's an export step, not a posting step.

**Hard scope boundaries (both agents converged on these):**
- No public profile, follower graph, discovery, or algorithmic feed — ever.
- One circle for v1; the "Circle" is a locally-persisted list of people you share with, not a synced membership or live thread.
- No inbox for incoming replies — once shared via Messages, the conversation happens in Messages itself. Building a reply-inbox would silently recreate the "feed/chat" tripwire the last phase banned.
- OCR is always confirm-and-edit before save — never silent auto-accept. This is the feature's actual error handling, not a nice-to-have.
- Camera/Contacts permission denials degrade gracefully (manual quote entry; manual contact entry for sharing) rather than blocking the workflow.
- No CloudKit/multi-device sync, no on-device LLM unless it's a trivial templated/static prompt generator (no model download/management).

**Measurable success criteria for this phase:**
- One sentence describes the app with no mention of "feed" or "community."
- A first-time user can log a book, capture a quote, add a reflection, and find it again with no instructions.
- A finished entry can be shared to one circle via Messages with real content (not placeholder text), no account or server needed.
- Data (books, quotes, reflections, ratings) survives force-quit and relaunch.
- Denied camera or contacts permission still leaves the app fully usable via manual entry.
- Timeline/stats feel meaningful even with just a few entries, not only after months.

One thing worth flagging as resolved rather than still-open: Claude's point about "circles" not implying synced replies, and Codex's point about the journal entry (not the message or the book) being the atomic unit — these aren't in tension, they're the same idea from two directions, and both are now locked into the boundaries above.

## Per App Product Brief

CONSENSUS: YES

## Final Output

Codex and Claude came at this from different angles — Codex focused on discipline and risk, Claude on a concrete persona and go-to-market — but they landed on the same brief without contradicting each other. Here's the shape of it:

**Target user & use case:** An adult reader (15-25 books/year, literary fiction/nonfiction) who currently loses their best reactions to group-chat scroll. She's usually mid-book, not between books, so the app has to work from a "capture this line right now" moment, not a library-building moment. First-run should get her from zero to "I saved something real" in under 20 seconds, offline, no network lookups required.

**Core loop:** Log a book → capture a quote (manual or OCR, always confirm-and-edit, never silent auto-accept) → rate/reflect → entry lands in personal timeline/stats → *only then*, optionally, share the finished entry to one saved circle via Messages. Order matters: sharing is the last step on a completed artifact, never the first move — that's what keeps this from becoming a feed.

**Paid value:** Free tier must never cripple the solo loop (unlimited books/journaling, one circle, manual quotes) or the retention engine dies per the invalidation criteria. Paid unlocks real friction removal: OCR capture (saves real time turning a phone into a page scanner), multiple circles (different books belong with different people — book-club friends aren't who gets the thriller recs), and richer stats/export. Both agents flag the year-end wrap-up export as the standout paid feature — personal, screenshot-worthy, and it does double duty as a growth surface without ever making the app itself public.

**Competitive wedge:** Against Goodreads/StoryGraph, the wedge is refusing the public-profile/feed model entirely — private-by-default, sharing is a deliberate high-friction-in-a-good-way act. Against Apple Notes (the sneakier competitor, since it's free and already there), the wedge is structure: the same effort she'd spend jotting a note instead produces a book-linked, page-linked entry that compounds into a timeline and a wrap-up for free.

**Growth angle — this is where they added nuance, not disagreement:** Codex frames growth narrowly as artifact-sharing through trusted reading relationships (a nicely-formatted entry a friend receives explains the product on sight). Claude sharpens this into a specific recommendation: treat the wrap-up/quote-share image as the *primary* acquisition surface (screenshot-to-Instagram-worthy) and the circle invite as a *secondary*, retention/expansion mechanic once someone's already a user — because inviting someone into your reading circle is a much higher-commitment ask than sharing a pretty image. This is a reordering of emphasis from the original spec (which treated circles as the growth engine), not a contested point — nobody argued against it.

**Local-first & cloud-ready:** Strict local-first in v1 — books, entries, quotes, ratings, stats, and the circle member list all live on-device, OCR runs on-device, sharing is an export through the share sheet with no app-mediated delivery and no reply path back into the app. The "circle" is explicitly a local convenience list for repeat-sharing, not a synced membership or proof of receipt — both agents independently warned against ever quietly building a reply inbox, which would recreate the feed/chat tripwire. Cloud-ready path: entries, circles, and share events as separate objects with stable IDs now, so CloudKit/private sync can be added later as an additive layer without a data-model rewrite.

**The one detail everyone wants preserved into design:** the home screen's hero content is the reader's own books and quotes — the circle is a drawer, not a tab. If design gives the circle equal or greater visual weight to the personal journal, the brief has been violated.

No open disagreement to carry forward — Claude's growth-angle reordering is a refinement of Codex's framing, not a competing position, and both independently arrived at the same non-goals (no reply inbox, no OCR overpromising, no circle-as-crutch).

## Detailed Discussion

Both Codex and Claude spent this round doing exactly what the phase calls for — surfacing edge cases and turning them into concrete decisions rather than leaving them fuzzy. Gemini was unavailable again. Where they overlap, they agree without friction (optional page numbers, optional ratings, circle as an outbound recipient list not an inbox, share events as immutable snapshots). Claude added several technical resolutions Codex didn't touch — using the no-permission-required contact picker, an optional biometric app-lock given how personal the content is, and a concrete free/paid split (full data model supports multiple circles, but the UI enforces the one-circle cap) — but none of it contradicts anything Codex said; it's additive detail in the same direction. Nothing here is in tension, so this reads as genuine convergence rather than a forced close.

CONSENSUS: YES

## Final Output

**Resolved requirements**
- A book supports many journal entries over time (one-to-many), with an explicit reading status field (want-to-read / currently-reading / finished / did-not-finish) — status is never inferred from entry count.
- Book creation is lightweight: title + author only required; cover, genre, ISBN, dates are optional enrichments, never blockers to capture.
- Page/location is optional free text (accepts "p. 214", "42%", a timestamp, or nothing) — never a required typed integer. This covers Kindle, audiobook, and borrowed-book use honestly instead of pretending "page-synced" means exact pagination.
- Rating is optional, not mandatory, on every entry.
- Quote capture (manual or OCR) never requires a book to be "complete" first — quote-first, structure-after is the required order.
- OCR capture is single-frame, camera-only in v1. No multi-photo stitching, no Photos-library import (deferred explicitly). OCR failure/blank frame/no-text-detected is a normal terminal state that always offers "type it instead," never a retry loop.
- Circles use `CNContactPickerViewController` for adding members — this requires no Contacts permission at all (out-of-process picker), which removes a permission-denial path the earlier phase assumed we'd need to handle. Manual name/phone/email entry remains the fallback for people not in Contacts.
- Sharing uses `MFMessageComposeViewController` when available, falling back to `UIActivityViewController` when `canSendText()` is false — never a dead button.
- Shared entries are point-in-time snapshots: editing an entry after sharing does not retroactively update what a recipient saw, and removing someone from the circle does not delete the historical record that you shared with them. Share events are their own timestamped objects, separate from current circle membership.
- Deleting a book cascades to delete its entries/quotes. Deleting a circle member does not cascade to delete past share-event history.
- Free/paid boundary: the data model supports unlimited circles and OCR from day one (no migration debt later); the UI enforces the free tier's one-circle cap and gates OCR behind a real but non-functional (no StoreKit) paywall screen. This satisfies the "architect for it, don't have to finish it" rule from the prompt contract.
- Home screen hierarchy stays: personal journal/timeline first, stats second, circle third (a drawer, not a tab) — reconfirmed from the product brief.

**Edge cases (now explicit product decisions, not implementation surprises)**
- Multiple in-progress books at once: quote-logging (including via Siri/App Intent) defaults to the most-recently-active book but always surfaces that choice in a confirmation step before saving — never a silent wrong attach.
- User abandons OCR mid-capture: partially recognized text must be easy to discard or hand-edited into a manual entry, not force a full restart.
- Poor lighting/curved page/messy OCR: always lands in an editable field; the crop/confirm screen preserves paragraph breaks so users can see what got merged.
- Quote spans a page break: out of scope for v1 — user retakes or manually completes the rest.
- User never creates a circle: the solo app must still feel fully complete and worth keeping (per invalidation criteria).
- `canSendText()` returns false (no SIM/Messages capability): falls back to the generic share sheet rather than blocking.

**Data and privacy implications**
- All journal content (quotes, reflections, ratings, circle member list, share history) is private local data by default; OCR runs on-device; no account, cloud sync, or remote text processing in v1.
- Contacts entitlement is not requested at all in v1 — the picker sidesteps that permission surface entirely.
- Given how personal reflections can be (grief, major life events tied to a quote), an optional biometric/passcode app-lock (`LocalAuthentication`) is a real v1 candidate, not a nice-to-have — it directly reinforces the "private, not a feed" promise. If cut for time, it must be recorded as a deliberate, named exclusion, not silently dropped.
- Sharing is a real privacy boundary-crossing moment (content leaves the local environment into Messages) and should be communicated clearly in the UI at the moment it happens.
- Standard device/iCloud backup will still capture this local store even without app-mediated sync — that's expected and consistent with "no server," not a contradiction of "local-first."

**Risk register**
- False social expectation ("circle" sounds more alive than a local recipient list) → mitigated by UI language discipline and by never building a reply inbox.
- OCR disappointment if framed as magic → mitigated by treating manual entry as equal-status and OCR as a time-saver, with confirm-and-edit always present.
- Stats feeling too thin or over-elaborate for actual data volume → mitigated by keeping stats intimate (books finished, quotes saved, streak, favorite authors, a few highlights) rather than a dashboard.
- Asking for circle creation before value is proven feels socially needy → mitigated by only surfacing the share/invite path after a real entry already exists.
- Streak/wrap-up date logic (timezones, midnight boundaries, DST) computed from scattered `Date()` calls → named as a determinism risk; mitigation is testable date-range logic with an injectable "now," not ambient `Date()`.
- Timeline/stats performance degrading as entries accumulate → mitigation is designing lazy/paginated fetches from the start rather than full-table-scan recomputation.
- Streak-reminder notifications are an obvious temptation but explicitly excluded from v1 — named exclusion, not an oversight, because it adds a permission surface and cuts against the calm/editorial tone.

**Final assumptions**
- Unlimited books/entries in free tier; one circle enforced in UI (not data model) for free; OCR gated behind non-functional paywall for free.
- No inbound sync, no reply ingestion, no live discussion thread, no network book lookup requirement — fully offline-first from first launch.
- Exports/shares are snapshots; no author-of-record relationship to a recipient's copy.
- Photos-library import for OCR and Contacts-permission-based invites are both explicitly deferred, not silently possible-later features.
- Local notifications/streak reminders are excluded from v1 by decision, not by omission.
- Optional biometric app-lock is a strong candidate for v1 scope; if schedule forces a cut, it must be logged as a named limitation.

## App Features

Codex and Claude are basically singing from the same sheet here — both landed on the same core insight that "personal stats" and "one circle" were the two soft spots left by prior phases, and both closed them the same way rather than pulling in different directions. Claude's list is really Codex's list with sharper, more testable acceptance criteria bolted on, plus one real addition: promoting the biometric app-lock from "should-have" to "must-have," with a clear justification (private grief/personal content + "private, not a feed" is the actual pitch, so shipping it with zero on-device protection undercuts the app's own promise). Codex didn't push back on that in this round because there's no round 2 yet, but nothing about it contradicts anything Codex said — it's consistent with the prior phase's own framing of app-lock as a strong candidate that must be a named decision either way.

Both agree on the must-have spine: lightweight book creation, quote-first entries with optional page/rating/reflection, manual capture, OCR capture with mandatory confirm-before-save, timeline as home, stats computed off real data with deterministic date logic, one circle via contact-picker (no Contacts permission), Messages/share-sheet sharing as an outbound snapshot, full persistence with correct cascade-delete rules, and graceful permission-denial handling everywhere. Both agree on the should/could/won't shape too — paywall-without-billing, wrap-up view, widgets, App Intent, versus no reply inbox, no CloudKit, no Photos import, no push notifications, no real LLM model.

The only thing not fully settled is whether app-lock is must-have (Claude's position) or should-have (Codex's original list) — but this reads like a natural one-round refinement rather than a fight, since Claude gave a concrete reason and Codex's own list already flagged it as more than a nice-to-have. I'd call this close enough to converge without needing a second round to relitigate it — the group's practical acceptance criteria all point the same direction.

CONSENSUS: YES

## Final Output

**Must-have features** (each ships with real, testable acceptance criteria — not aspirational):

1. **Add a book (lightweight)** — title + author only required; optional cover/genre/ISBN/dates; explicit status field (want-to-read/currently-reading/finished/did-not-finish). Empty state on zero books; persists across relaunch.
2. **Journal entry creation, quote-first** — one-to-many entries per book; quote text can be saved alone with page/location, rating, and reflection all optional; no forced sequencing.
3. **Manual quote capture** — reachable with no permission prompt; full edit before save; appears in timeline immediately; survives relaunch.
4. **OCR quote capture with mandatory confirm-and-edit** — camera-only, single-frame; every result lands in an editable field before save, never auto-accepted; no-text-detected/blank frame is a normal state with a "type it instead" path; denied camera access degrades to manual entry, never a dead end. This is the one feature the group agrees a build should fail outright on if confirm-before-save isn't wired — it's the feature's entire error-handling strategy.
5. **Personal timeline as home** — books/entries in reverse-chronological order; real empty state; verified to persist post-force-quit, not just in-memory.
6. **Personal stats** — books finished, quotes saved, streak (at minimum), computed from real stored entries; streak/date logic tested against an injected "now" (not live `Date()`), specifically across midnight and timezone edge cases.
7. **One circle via `CNContactPickerViewController` + manual fallback** — capped at one in the free-tier UI; must never trigger a Contacts permission prompt (that would itself be a defect).
8. **Sharing via `MFMessageComposeViewController`, falling back to `UIActivityViewController`** — only from a completed entry; real content (quote/book/attribution), never placeholder text; works when `canSendText()` is false.
9. **Full local persistence with correct cascade rules** — deleting a book deletes its entries; deleting a circle member preserves historical share records; survives force-quit.
10. **Graceful permission-denial handling everywhere** — camera or contacts denial never blocks the workflow, always routes to a working manual path.
11. **Optional biometric/passcode app-lock** (`LocalAuthentication`) — off by default, toggle in settings, gates content on background/return when enabled, with passcode fallback. Elevated to must-have this round given how personal the journal content can be and the app's own "private, not a feed" positioning.

**Should-have:**
- Widgets for currently-reading and streak.
- App Intent/Siri quote logging, defaulting to most-recently-active book but always confirming before save.
- Real (non-functional-payment) paywall screen gating OCR and additional circles.
- Lightweight bundled-local book title/author autocomplete (no network lookup).
- Year-end wrap-up view (stats-based, not necessarily exportable-as-image yet).
- Entry-level share history (what was shared, when).

**Could-have:**
- Exportable/shareable wrap-up image.
- Templated (non-LLM, static/rule-based) discussion-prompt generator.
- Capture-flow haptics/animation polish.
- Draft recovery for abandoned entries.
- Additional texture/quote-card visual variants.

**Won't-build (hard boundary for this build):**
- No reply inbox or any inbound-message ingestion — sharing is strictly outbound.
- No Photos-library OCR import; no multi-photo/page-break stitching.
- No CloudKit or multi-device sync.
- No on-device LLM requiring model download/management.
- No public profile, discovery, or feed of any kind.
- No push notifications or streak reminders.
- No more than one circle reachable in the free-tier UI (data model may support more).
- No network-dependent book metadata lookup.

**Standing risk flagged for build-verification:** OCR and share-sheet behavior both depend on runtime device/simulator state (camera availability, SIM/Messages capability) that's easy to happy-path in a demo and silently fail in the field. Verification must explicitly exercise denied-camera and `canSendText()==false` states, not just the golden path.
