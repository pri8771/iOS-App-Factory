# Decisions

## DEC-001 — Project registration

- **Status:** accepted
- **Context:** This repository is governed by the App Factory standards.
- **Decision:** Use `.factory/project-context.json` as the authoritative project classification marker.
- **Consequences:** Agents must read the registration and quality files before coding.

## DEC-002 — Product scope

- **Status:** accepted
- **Context:** Earlier documents mixed ZIP travel tracking with an abandoned package-tracking concept.
- **Decision:** Roam is a private location tracker whose primary outcome is highlighting each visited ZCTA boundary and recording visits.
- **Consequences:** Package tracking is removed from active planning; secondary progress and monetization cannot block the core map.

## DEC-003 — Boundary authority

- **Status:** accepted
- **Context:** USPS ZIP codes do not provide a complete public polygon dataset.
- **Decision:** Use bundled U.S. Census ZCTAs as the authoritative overlay geometry and label them honestly as ZIP Code Areas.
- **Consequences:** Reverse geocoding may enrich or recover labels, but cannot define polygon boundaries.

## DEC-004 — Runtime data posture

- **Status:** accepted
- **Context:** The product handles sensitive location history.
- **Decision:** Perform matching and persistence on-device with no required account or backend.
- **Consequences:** Production geometry ships as a validated read-only app resource; privacy copy must disclose any future network fallback.

## DEC-005 — Multi-level zoom hierarchy is US-first

- **Status:** accepted
- **Context:** Requested 2026-07-27: highlight city/county/state/continent
  boundaries at coarser zoom, not just ZCTA. Administrative hierarchies are
  not universal (states/provinces/prefectures/oblasts vary by country), and
  fine-grained worldwide sources (OpenStreetMap boundary extracts) are much
  larger and carry attribution/licensing overhead versus US Census TIGER.
- **Decision:** Build the full 5-tier hierarchy (ZCTA/city/county/state/
  continent) for supported U.S./territory ZCTAs and bundle Natural Earth
  country/continent geometry for worldwide browsing. Automatic visit
  collection remains ZCTA-gated; a non-US coordinate with no ZCTA match is not
  recorded merely because a country polygon can be displayed. Do not invest
  in fine-grained non-US admin data or a global visit model unless demand
  justifies it later.
- **Consequences:** ROAM-MAP-002 scopes to US TIGER data (Places, Counties,
  States) plus one small worldwide continent/country browsing layer. Revisit
  this decision and add an explicit country-visit model if international
  collection becomes a product requirement. The passive collection limit
  remains accepted; DEC-010 now supersedes the earlier decision to defer a
  separate manual worldwide visit model.

## DEC-006 — Production geography stays fully on-device for now

- **Status:** accepted
- **Context:** The six boundary bundles (ZCTA + ROAM-MAP-002's place/county/
  state/country/continent) together embed 206.5 MB directly in the app via
  the existing `Roam/Resources/ZCTA` folder reference. FEAT-005 adds a seventh
  52,236,288-byte country/city catalog to the same generated-resource set. A
  per-state chunked download-on-first-visit design was discussed as a future
  way to shrink the initial install.
- **Decision:** Not now. During testing and development, ship all six geometry
  bundles and the world-place catalog on device. Revisit chunked/on-demand
  distribution after exact-candidate size/performance evidence and real usage.
- **Consequences:** No download manager, no partial/"not yet downloaded"
  map states, no chunk-hosting infrastructure to build yet. If revisited,
  the state-based chunking approach (not a geographic-radius approach) is
  the agreed shape: ZCTA/place data split per state, county/state/country/
  continent tiers stay bundled always since they're small. The point catalog
  remains bundled unless TF-011 evidence drives a separate reviewed decision.

## DEC-007 — Repository-first release planning and status

- **Status:** accepted
- **Context:** Jira and Notion are useful for assignment and visibility, but can drift from versioned requirements and evidence.
- **Decision:** `docs/TESTFLIGHT_READINESS_PLAN.md` controls TestFlight scope, dependency order, and release gates; `docs/tasks/testflight/TF-*.md` controls the implementation handoff for each task/subtask; `quality/release/testflight-backlog.json` provides machine routing. Repository feature contracts, checklist, status, and evidence determine completion. Jira and Notion only mirror the same `TF-*` IDs and repository paths.
- **Consequences:** Update the repository first. External items cannot add hidden acceptance criteria or mark a task done when repository evidence is incomplete. Every task/subtask packet must answer summary, user story, what, why, and an executable how; CI validates this contract. TF-014 reconciles mirrors after each release decision.

## DEC-008 — TestFlight promotion reuses one frozen binary

- **Status:** accepted
- **Context:** Rebuilding between internal verification and external rollout can change code, resources, signing, or metadata while retaining misleadingly similar labels.
- **Decision:** Candidate identity is bundle ID + marketing version + build + commit SHA + production-artifact manifest. Internal testing, Beta App Review, and external rollout use the same processed build.
- **Consequences:** TF-003 uploads/processes once and exposes that build only to a restricted Release QA group for pre-gate physical-device evidence. Any binary-affecting change increments the build number and invalidates affected evidence. TF-013 selects the recorded processed build and promotion never rebuilds or duplicates an already tested candidate.

## DEC-009 — TestFlight rollout is staged and recoverable

- **Status:** accepted
- **Context:** Roam processes sensitive location history and has unverified physical-device/background behavior.
- **Decision:** A restricted TF-003 pre-gate internal lane makes the processed binary available to device QA; TF-013 then reconciles the same group/build and completes final Stage 0 internal acceptance before a small invited external pilot. Expansion requires recorded exit criteria. Public links are optional and deliberately limited.
- **Consequences:** TF-013 records monitoring, feedback ownership, 90-day expiry, stop criteria, and replacement-build communication. Stopping access cannot erase already installed builds.

## DEC-010 — Worldwide remembered travel is a separate local model

- **Status:** accepted
- **Context:** On 2026-07-30 the owner explicitly requested a low-effort way to
  add countries and cities visited worldwide, often without exact dates.
  `TrackedZCTA` and `ZCTAVisit` represent observed U.S. boundary matches,
  timestamps, coordinates, durations, confidence, and open-visit state.
  Reusing them for memory-based travel would fabricate precision. Natural
  Earth supplies compact country polygons but not city boundaries; GeoNames
  supplies stable worldwide city points, not polygons; Overture Divisions has
  normalized worldwide hierarchies and `division_area` polygons but is
  multi-gigabyte and ODbL-licensed.
- **Decision:** Add `VisitedPlace` and `PlaceVisit` beside the automatic ZCTA
  models. Dates are optional and retain their actual precision. The first
  catalog is a bundled, read-only GeoNames country/cities point catalog
  crosswalked to Natural Earth overview geometry. Every addable current country
  has a verified GeoNames representative point; historical `PCLH` records
  `AN`/`CS` are excluded, and a Natural Earth outline is claimed only when the
  crosswalk resolves. Coverage derives upward only through verified IDs.
  Missing city/country geometry renders as a point with an honest
  unavailable-outline state. Automatic passive discovery remains
  supported-ZCTA-gated and local-only.
- **Consequences:** Export, deletion, migration, privacy, accessibility, map,
  and release-resource gates must cover both histories without combining their
  semantics. GeoNames CC BY attribution is required. Fine worldwide outlines
  may use versioned per-country Overture packs only after legal/product approval
  of ODbL attribution/share-alike distribution, disputed-boundary perspective,
  static artifact hosting, cache/eviction, and offline failure behavior. Apple
  MapKit search may be an interactive fallback after terms review, but cannot
  be bulk-extracted into Roam's independent catalog.

## DEC-011 — Home coverage actions focus; only the map menu locks

- **Status:** accepted
- **Context:** A Home States action left `coverageScope` fixed to States, so a
  Western Hemisphere view kept state polygons instead of highlighting North
  America. Automatic zoom also skipped the country tier.
- **Decision:** Automatic coverage resolves Continent → Country → State →
  County → City/Place → ZIP Area from camera span. Home ZIP/State actions are
  one-shot camera-focus requests and retain Automatic. Only a deliberate
  selection in the Map coverage menu locks a concrete tier, and the Automatic
  label exposes its live resolved tier.
- **Consequences:** Threshold and production-geometry tests must verify the
  actual visited polygon at each tier, not only labels. If visual testing shows
  threshold flicker, add bounded hysteresis without changing the hierarchy or
  lock semantics.

## DEC-012 — Planned trips are future intent, never visit evidence

- **Status:** accepted architecture boundary; feature remains planned
- **Context:** The owner requested a Plan a Trip mode that can prepare a Madrid
  visit, surface useful nearby places, build walking plans, and later support
  richer tours. Automatic ZCTA records are observations and Past Places records
  are remembered history; reusing either for a future plan would mark places
  visited before the person went there and corrupt coverage.
- **Decision:** FEAT-006 uses a third local model—`PlannedTrip`, `TripDay`, and
  `TripStop`. Creating a plan, supplying dates, checking a stop, requesting a
  route, using foreground location help, reaching the date, or completing the
  plan never creates `TrackedZCTA`, `ZCTAVisit`, `VisitedPlace`, or
  `PlaceVisit`. A separate “Add destination to Past Places” action must show
  the destination and date precision and require confirmation before calling
  the existing manual-place service. MVP destination selection reuses the
  bundled offline catalog; nearby POI discovery and walking legs are explicit
  Apple MapKit network requests behind injected clients. Planned pins and
  labels must be distinct from visited coverage.
- **Consequences:** Saved itinerary content remains local and usable offline,
  but fresh POI search and route recalculation report their network dependency.
  Roam does not bulk-cache Apple place/route data or promise that Apple Maps
  offline downloads are available to MapKit. Curated/audio tours and
  neighborhood polygons remain separately licensed/data-gated. FEAT-006 stays
  out of the current TestFlight gate until the owner explicitly promotes it;
  `tasks/trip-planning/README.md` is the canonical implementation plan.

## DEC-013 — One repository-first lifecycle roadmap controls product sequence

- **Status:** accepted
- **Context:** TestFlight, worldwide places, and trip planning had separate
  plans, while ideas for walking tours, packs, photos, steps, sharing,
  check-ins, and social lacked one priority/gate view. Jira and Notion are
  intended only as copies.
- **Decision:** `PRODUCT_ROADMAP.md` controls final-product vision, phase order,
  promotion, and cross-family dependencies. Existing TestFlight, WP, and TRIP
  packets plus `tasks/product-evolution/README.md` control nonduplicated task
  and subtask execution detail. The lifecycle order is trustworthy beta,
  controlled learning, trip MVP, smart walking/vacation, packs/guides, private
  memories, then local sharing/check-ins and an optional social decision.
- **Consequences:** Every repository ID namespace is authoritative; mirror
  state cannot override it. A planned later phase is not implementation
  authorization. Observed, remembered, planned, suggested, and shared facts
  remain separate across every phase.

## DEC-014 — Location sampling and persistence cadence are separate policies

- **Status:** accepted target; ordered visit-checkpoint and bounded diagnostic-
  buffer infrastructure code-complete, enabled cadence and physical
  verification pending
- **Context:** Core Location has no fixed delivery timer. Roam currently starts
  standard, significant-change, and visit services together, and default
  diagnostics normally cause a SwiftData save for every processed sample.
  Displayed advanced manager settings are also overwritten by preset/start
  behavior.
- **Decision:** TF-008.8–TF-008.12 will first measure callbacks, work, saves,
  and energy. One effective configuration will make UI and manager state agree.
  Callback batches will be processed in timestamp order; visit opens,
  transitions, closes, stops, and recovery/deletion fences remain immediately
  durable, while repeated same-area progress and redacted diagnostics use
  bounded, owner-approved checkpoint policies. A lower-energy service state
  machine may replace simultaneous services only after physical A/B proof.
- **Consequences:** “200 m” continues to mean a standard-service movement
  request, never an interval or guarantee. Cadence/loss/correctness/energy
  budgets and physical evidence are release gates. The production checkpoint
  and diagnostic flush policies remain immediate until those budgets are
  owner-approved; injected finite policies exist only for deterministic tests.
  No model may weaken visit truth merely to reduce saves.

## DEC-015 — iCloud continuity and Photos suggestions remain explicit, private, and non-evidentiary

- **Status:** accepted future architecture boundary; not in the current
  TestFlight candidate
- **Context:** A person needs their history when replacing a device, and may
  want Roam to surface likely trips from Photos metadata. Roam currently has a
  local-only SwiftData store. Its unique attributes and non-optional/cascade
  relationships are not CloudKit-compatible, so enabling iCloud without a
  deliberate migration risks failed synchronization or divergent history.
  Photos geotags and creation dates are incomplete and can be wrong, especially
  at city resolution.
- **Decision:** SYNC-001 will offer an opt-in private CloudKit database in the
  person's iCloud account, with no Roam account, public database, shared
  database, or background upload of diagnostics. It must first migrate all
  synchronized models to a CloudKit-compatible version and provide a local-only
  fallback, sync state, conflict/reconciliation behavior, export, and confirmed
  delete lifecycle. MEM-001 may offer a clearly labeled, user-started “Find
  travel suggestions” scan after contextual Photos consent. It runs locally in
  the foreground once per request, uses only accessible assets' creation date
  and optional location metadata, and presents country-first candidate groups
  such as “Thailand, 2015.” A city is suggested only when a coordinate is inside
  a verified city polygon; representative catalog points never justify a city
  inference. No scan, suggestion, photo, or metadata automatically creates or
  changes `TrackedZCTA`, `ZCTAVisit`, `VisitedPlace`, or `PlaceVisit`.
- **Consequences:** iCloud account-off, quota/network, schema promotion,
  migration, conflict, partial sync, device replacement, delete propagation,
  limited Photos access, empty/stale/deleted assets, and large-library behavior
  require explicit UI and physical two-device evidence. The copy must say
  “suggestion,” not “you visited,” and a confirmed review is required before
  calling the existing manual-place service.

## DEC-016 — Visit purposes use a V3 companion entity

- **Status:** accepted; code-complete, exact-device verification pending
- **Context:** The owner requested optional multi-select Work, Vacation,
  Family/Friends, and Other context for each remembered visit. Adding a stored
  field directly to the existing `PlaceVisit` type caused a genuine pre-change
  V2 SwiftData store to fail migration, so that design could not ship safely.
- **Decision:** Keep the V1 and V2 model shapes unchanged. `RoamSchemaV3` adds
  `PlaceVisitPurposeTag`, one normalized row per visit UUID and stable purpose
  value, with a unique composite key. `ManualPlaceService` owns validation,
  idempotent add/edit, rollback, Undo, visit/place cleanup, and notifications;
  export v4 and Delete All Data include the companion rows. No purpose is
  required or preselected, and purposes never affect tracking or coverage.
- **Consequences:** Existing V2 stores migrate without invented values and one
  city can have differently tagged visits. Because the companion uses a UUID
  rather than a SwiftData relationship, every deletion path and integrity test
  must continue checking orphan cleanup. The future CloudKit migration must
  revisit the unique key and relationship shape before enabling iCloud.

## DEC-017 — First free App Store candidate is version 1.0 build 4

- **Status:** accepted
- **Context:** The owner directed Roam to launch free before any future
  commerce work and authorized preparation of the App Store submission. App
  Store Connect already contains obsolete processed builds `1` through `3`,
  while the current canonical project resolves version `1.0 (4)`.
- **Decision:** Freeze the first free App Store candidate as marketing version
  `1.0`, build `4`, bundle `com.localfirst.roam`, and team `796XH483R4`.
  App Store release remains manual after approval. Any binary-affecting change
  after the build-4 archive increments the build number and repeats affected
  evidence; an existing build number is never reused.
- **Consequences:** The exact clean commit, reviewed seven-resource manifest,
  signed archive/export, App Store processing record, screenshots, review
  metadata, internal install, and release gates must all reconcile to this
  tuple. This decision approves the identity allocation; it does not claim
  that build `4` has been archived, uploaded, tested, submitted, or approved.
