# Features

## Product outcome

Roam privately creates a visual record of the ZIP-like areas a person has traveled
through. Entering a supported ZCTA records a visit, adds a pin, and colors the
area boundary without an account or server. A separate worldwide Past Places
feature lets the person add remembered countries and cities without pretending
Roam observed an exact route, date, or duration.

The complete final-product sequence and every routed task/subtask are
canonical in `PRODUCT_ROADMAP.md`. This inventory describes feature state; it
does not independently promote planned work.

## MVP boundary

### Included

- Explicitly enabled foreground/background location tracking.
- On-device coordinate-to-ZCTA matching against a bundled Census dataset.
- One persistent discovered record per unique ZCTA and separate revisit history.
- Visited, current, and selected polygon styles plus entry pins.
- Map, visit history, basic progress, export, and deletion controls.
- Offline remembered-country/city entry with optional dates and purposes,
  upward-only verified parent coverage, and Past Places editing.
- Honest limited/missing-data, permission, offline, and error states.

### Excluded

- Official USPS delivery-boundary claims.
- Accounts, cloud sync, social feeds, routing, venue search, ads, or data sale.
- Reverse geocoding as the authoritative boundary source.
- Subscription work until the core tracking loop is validated.

## Accepted device-feedback requirements

The following 2026-07-30 feedback is part of the current MVP correction pass:

- A persisted tracking-on choice must resume honestly on an ordinary app
  launch. The Home status must not default to “Tracking Off” merely because
  the transient runtime object was recreated.
- Home summary cards are navigation, not decoration. ZIP-area and state totals
  open a map focused on the corresponding visited coverage; the weekly metric
  says “New Areas This Week” and opens useful visit detail; Longest Visit opens
  a place-aware comparison rather than only displaying a duration.
- The map exposes an understandable coverage scope instead of requiring users
  to infer ZIP/state/country/continent behavior from zoom alone. A scope must
  never color an administrative area unless Roam can derive that visited state
  honestly from persisted data. Its compact legend says `Visited <boundary
  level>` (and `Auto` when zoom-driven), so a parent city/state/country fill is
  not mistaken for a different visit set. When an international remembered
  city has only its verified country/continent polygon, Automatic falls back
  to the country at a state-scale view; closer views retain the honest city
  marker rather than fabricating a city or postal outline.
- The visible **Map Key** explains the active boundary tier, clarifies that
  U.S. ZIP Areas are Census ZCTAs rather than USPS postcodes, and defines the
  tracked-area, visit, remembered-place, current-location, and cluster pins.
- Sharing creates a privacy-safe **travel coverage snapshot**, not an
  interactive map. Its month is labeled as the snapshot creation date, its
  colors are explained as presentation styling, rendering has explicit
  loading/failure states, and the share sheet never opens with empty content.
- Automatic map coverage follows the camera through Continent → Country →
  State/Region → County → City → ZIP Area. Home coverage metrics focus the
  camera without locking that hierarchy; only a deliberate Map menu choice
  locks one tier.
- Remembered worldwide travel uses its own coarse, local-only records. Dates
  are optional, country/city browsing does not require typing, and verified
  coverage propagates upward only. A point-only city must never be presented
  as though Roam owns a reliable city outline.

## Future product notes — proposals, not commitments

These ideas are retained from the 2026-07-30 device review. They are not part
of the current TestFlight gate and need discovery, privacy review, and explicit
product decisions before implementation:

- **Optional check-ins and social travel:** let a person intentionally check in
  to a place and optionally share that coarse event with chosen people. This
  conflicts with the current no-account/no-backend boundary unless implemented
  as device-local sharing. Any networked version requires identity, consent,
  audience controls, blocking/reporting/moderation, retention, account/data
  deletion, child-safety, abuse prevention, and a new architecture decision.
- **Location-aware audio guides:** offer opt-in narrated context for a place or
  route. Discovery must select a licensed, attributable content source and
  define downloads/offline playback, language, accessibility transcripts,
  editorial accuracy, interruption behavior, and whether location can trigger
  audio without surprising the user.
- **Step context:** optionally enrich a trip with HealthKit step totals. This
  requires the HealthKit capability, purpose-specific permission, a useful
  denied/unavailable state, strict on-device handling, privacy/App Store
  disclosures, and a decision about whether daily steps or trip-window steps
  actually support Roam’s travel outcome.
- **Plan a Trip:** the accepted proposal is now specified in
  `tasks/trip-planning/README.md` as FEAT-006. It uses a third, local
  `PlannedTrip` model for a destination, optional dates, a base, daily stops,
  nearby discovery, and requested walking legs. A plan, completed stop, route,
  date, or arrival never counts as visited; only a separate confirmed
  “Add to Past Places” action may bridge into FEAT-005. The proposal is not in
  the current TestFlight gate.
- **Fine worldwide outlines:** the accepted first slice stores manually added
  countries and cities using a compact offline point catalog and coarse
  country/continent geometry. Downloadable Overture administrative/locality
  polygons remain a later legal/product-gated enhancement because the global
  source is multi-gigabyte, locality coverage is incomplete, political
  perspectives need policy, and derived packs carry ODbL obligations.
- **Private iCloud continuity:** a future opt-in will synchronize Roam's
  app-controlled travel data through the person's own private CloudKit database
  so a replacement device can restore it. This is not implemented in the
  current local-only TestFlight candidate. It requires a CloudKit-compatible
  SwiftData migration; the current models' unique constraints and non-optional
  relationship/cascade design cannot simply be switched to CloudKit.
- **Memories from this location:** a saved-place detail action may open a
  private chronological view for that exact place, combining user-entered notes
  with photos the person selects or explicitly asks Roam to search. Search runs
  once, locally, and only after an in-context consent action; it never runs at
  launch or in the background. Suggestions must preserve observed-versus-
  remembered provenance, never infer a visit from media, and expose review,
  edit, detach, export, and delete controls. This belongs to Phase 5 memory
  enrichment, not the current TestFlight gate.

## Feature inventory

| ID | Feature | Status | Contract |
|---|---|---|---|
| FEAT-001 | Local area tracking, hierarchy, map, and visit persistence | verification_pending | `../quality/feature-contracts/FEAT-001.json` |
| FEAT-002 | Export and deletion | verification_pending | `../quality/feature-contracts/FEAT-002.json` |
| FEAT-003 | Roam Plus one-time purchase | deferred from Beta 1 | `../quality/feature-contracts/FEAT-003.json` |
| FEAT-004 | TestFlight release packaging | verification_pending | `../quality/feature-contracts/FEAT-004.json` |
| FEAT-005 | Worldwide manual countries and cities | verification_pending | `../quality/feature-contracts/FEAT-005.json` |
| FEAT-006 | Plan a Trip | planned | `../quality/feature-contracts/FEAT-006.json` |

Release implementation and verification are decomposed into TF-001 through
TF-014 in `TESTFLIGHT_READINESS_PLAN.md`. The owner chose a fully free Beta 1,
and the 2026-08-08 source-level removal leaves no StoreKit, Roam Plus, purchase,
restore, entitlement, or paywall path in the app or generated project. TF-006
retains the prior commerce design only as a future-paid packet; none of its
historical results qualify a paid candidate. FEAT-004 is not done until TF-014
has exact Build 4-or-later evidence.

For FEAT-001/FEAT-002, the location pipeline now delays accepted
state/data-change publication until its primary save succeeds and uses a
generation/suspension fence to reject late writes during deletion/recovery.
Delete All Data journals and removes app-controlled SwiftData history/settings,
exports, diagnostics, and transient state, then resets processor/transition
state only after confirmed cleanup. Local 33/33 focused hardening, 11/11
privacy/save-order/fence, and current integrated 283/283 unit results are green.
These features remain `verification_pending` because real
SwiftData/file faults, on-disk relaunch/migration, power-loss durability or an
approved narrower guarantee, and signed physical-device evidence are missing.

The 2026-07-30 device-feedback correction is locally code-complete:
persisted tracking intent uses one guarded launch/foreground/authorization
resume policy; current-location requests cannot persist visits while tracking
is off; Home metrics have typed destinations; explicit map scopes translate
ZCTAs to the identifiers used by each hierarchy bundle; and the travel
coverage snapshot cannot present a share sheet without a validated image.
Focused resume/routing (8/8), hierarchy/statistics (21/21), final
production-overlay/territory (28/28), snapshot (5/5), and core-loop UI (2/2)
suites pass. The bugs remain
`verification_pending` until the focused UI journey and physical-device
relaunch, overlay, native share-sheet, saved-image, accessibility, and
performance checks are recorded.

Tracking cadence remains a Phase 0 correction. There is no fixed time interval:
iOS delivers standard, significant-change, and visit events, and Balanced asks
for 100 m accuracy with a 200 m movement filter. Default diagnostics currently
cause approximately one SwiftData save per processed sample. Callback arrays
now enter one actor operation and are stable-sorted by sample timestamp; a pure
same-area checkpoint policy and retryable aggregate are implemented, but the
production checkpoint remains immediate until an owner approves measured
cadence/loss bounds. A bounded finite-diagnostic buffer/flush policy is also
implemented behind an immediate production default; it does not yet authorize
a diagnostic crash-loss window or claim fewer writes. The displayed
custom distance/accuracy/auto-pause values and background-indicator preference
now reach an injected manager through one validated effective configuration;
10/10 focused tests prove presets, custom/legacy values, idempotency, service
membership, opt-out/deletion gates, authorization downgrade, and relaunch
restoration. TF-008.8 and TF-008.10–TF-008.12 still own measurement, enabling
bounded same-area/diagnostic checkpoints, and physical energy/correctness
proof; TF-008.9 still needs exact-candidate device evidence. See
`quality/evidence/testflight/TF-008/persistence-cadence.md` and
`quality/evidence/testflight/TF-008/diagnostic-cadence.md`.

WP-001 is additionally `code_complete` with 24/24 focused tests for the full
North America → United States → Pennsylvania → Allegheny County → Pittsburgh →
ZCTA automatic progression and Home focus-versus-lock semantics. FEAT-005
remains `verification_pending`: catalog, V3 remembered-place persistence,
dates/purposes, add-flow, map union/pins, History/detail, Full Export v4, and
atomic Undo are in the current 283/283 unit run. The Milestone 0/1 focused slice
passes 95/95, while the 2026-08-11 exact-current unit and core-flow UI runs pass
283/283 and 2/2. Progress/date regressions pass 46/46, map-runtime regressions
pass 5/5, and Python/tooling passes 89/89: 86 under `Scripts/tests` discovery
plus 3 hierarchy-builder tests. Source preflight reports 21 passes, zero
failures, and the expected no-archive warning. Exact-current
accessibility R66 completes all nine free-beta surfaces with eight passes and
only History failing on one anonymous `.elementDetection`/OCR finding; no
audit suppression was added. The run is still red, and offline/relaunch,
exact-candidate, and physical-device interaction evidence must still be
recorded. See
`../quality/evidence/testflight/TF-010/exact-current-automated-audits-2026-08-11.md`.

### Multi-level zoom hierarchy (part of FEAT-001)

As the map zooms out, switch which boundary type is highlighted, coarser at
each step: **ZIP/ZCTA → city → county → state → country → continent** (stop at
continent — no coarser tier). Requested 2026-07-27 and clarified 2026-07-30
with a worked example that
must resolve correctly end-to-end: ZIP 15232 → Pittsburgh (city) → Allegheny
County → Pennsylvania (state) → United States (country) → North America
(continent). Zoom-tier
breakpoints (the `latitudeDelta` thresholds in `MapZoomResolver.swift`):

**Chosen thresholds and reasoning:**
- **latitudeDelta > 80**: Continent tier (~8 source features, resolution 0).
  World/hemisphere view; coarse continental outlines without overwhelming detail.
- **latitudeDelta 80–30**: Country tier (~177 bundled outlines, resolution 0).
  Continent or large-country view; this prevents the former continent→state jump.
- **latitudeDelta 30–10**: State tier (~56 US states, resolution 0). Regional view; at 
  latitudeDelta ≈ 20, most of the continental US fits; state boundaries become readable.
- **latitudeDelta 10–3**: County tier (~3,200 counties, resolution 0). Multi-county region; 
  provides geographic context for metro areas and state subdivisions.
- **latitudeDelta 3–0.5**: Place tier (~29k cities, resolution 1). City/metro level; cities 
  and neighborhoods become primary visual anchors; medium resolution maintains clarity.
- **latitudeDelta 0.5–0.1**: ZCTA tier (~33k ZIP Code Areas, resolution 2). Neighborhood 
  detail; medium-high resolution enables reading street-level areas.
- **latitudeDelta < 0.1**: ZCTA tier (full resolution 3). Street and block level; finest 
  detail for precise location tracking.

Rationale: Thresholds align with typical map-reading workflows (world → region → area → 
street). Resolution ramping (0→3) keeps rendering fast at coarse zooms while preserving 
accuracy at street level. Each tier is 3–4× finer than the previous, maintaining visual 
balance as users zoom.

Every tier uses the same legibility rule: touching visited polygons receive
different translucent fill colors from a shared palette and no emphasized
border. Current areas retain a teal fill and selected areas retain an indigo
fill. The visible set is conservatively graph-colored from polygon contact, so
neighboring ZIP Areas, cities, counties, states, countries, and continents do
not merge into one same-colored patch on Standard, Hybrid, or Satellite maps.

Passive collection remains **US-first** (see DEC-005): an automatic visit
requires a bundled U.S./territory ZCTA match. FEAT-005 adds a separate manual
worldwide model; opening a boundary alone still does not create history.
Marking a country never marks its children. A point-only city does not itself
become a polygon; for a U.S. city, the catalog point may establish containment
in the independent Census place/county/state bundles. For manual Pittsburgh,
that verified chain highlights Pittsburgh `4261000`, Allegheny County `42003`,
Pennsylvania `42`, the United States, and North America. It never creates or
highlights a ZIP Code Area.

Data sourcing — reuse the existing TIGER/GDAL/SQLite+STRtree pipeline that
built the national ZCTA bundle, do not reinvent it:
- City: US Census TIGER/Line 2024 "Places" (~29k features)
- County: US Census TIGER/Line 2024 "Counties" (~3,200 features)
- State: US Census TIGER/Line 2024 "States" (~56 features)
- Continent: a small worldwide dataset (e.g. Natural Earth admin-0/continent
  polygons, public domain, ~7-8 features) — this tier supports worldwide map
  browsing regardless of the US-first collection decision.

### Worldwide Past Places (FEAT-005)

The canonical execution plan is
`tasks/worldwide-places/README.md` (WP-001–WP-010).

- Default entry is browse-first: continent → country → city, with a
  single-place date editor that defaults to unknown and optional local search.
- Timing choices are unknown, this/last year, chosen year, month/year, an
  exact civil date, or an optional start/end date range. Unknown remains the
  default, so Roam never invents a date.
- `VisitedPlace` retains stable catalog/source IDs, display and hierarchy
  snapshots, a catalog point, and optional exact geometry crosswalks.
  `PlaceVisit` retains only the temporal precision the person supplied. V3
  companion rows attach an optional normalized multi-select purpose—Work,
  Vacation, Family/Friends, or Other—to one visit without changing V1/V2
  entities or coverage.
- GeoNames is the compact offline country/city point catalog and requires
  attribution. Natural Earth remains the coarse public-domain country/
  continent outline source. Census remains the U.S. hierarchy/ZCTA authority.
- The exact current catalog contains 250 addable current countries, all with
  verified GeoNames representative points, 69,542 city points, and 175 Natural
  Earth country-polygon crosswalks in 52,236,288 bytes; the other 75 countries
  are marker-only. GeoNames source rows `AN` and `CS` are historical and are
  excluded. SHA-256 is
  `3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`.
- Worldwide city polygons are not part of the first slice. Overture
  `division_area` per-country packs are the preferred later source after the
  DEC-010 legal/product gates pass.
- The map always keeps remembered-place markers visible, uses MapKit’s adaptive
  distance scale, and labels the active highlight tier. A point-only city such
  as London is a haloed city marker plus any verified parent country/continent
  coverage; it is never drawn as a fictional city outline or ZIP visit. The
  map uses a restrained blue/teal/violet translucent palette to distinguish
  touching visited boundaries; hue has no travel meaning.
- Progress intentionally separates three measures: visited countries out of
  the bundled 250-country catalog, saved city records within each country, and
  estimated U.S. ZIP Code Area coverage within each state. City counts are not
  shown as geographic percentages. Optional visit-purpose controls are
  code-complete through V3 migration, add/edit/history, export v4, Undo, and
  deletion; physical accessibility and relaunch evidence remains pending.

The catalog is a real seventh production SQLite release input, not UI fixture
data. It must remain covered by attribution, integrity, checksum,
clean-checkout restoration, archive inspection, and TF-011 thinned-size/search
performance gates.

### Useful local history

History preserves the Timeline, By ZIP Area, and Past Places evidence views,
but begins with a compact local overview: last explored area, new visited areas
this week, the area with the most accumulated time, and the count of remembered
countries/cities. Each automatic-area insight opens the corresponding detail;
the overview never infers a route, place name, or travel purpose that was not
recorded. Timeline remains the raw visit record and Past Places remains an
explicitly separate, user-confirmed history.

### Future scope — personalized map colors and a full-map share

Roam will let a person choose from accessible local highlight-color themes and
preview the selection before saving it. A separate reviewed “Share my full map”
artifact may render the selected theme over coarse visited boundaries and use
the native share sheet. It must never include the live location dot, raw
coordinates, route traces, hidden/archived places, or unconfirmed travel. The
feature needs contrast/Dynamic Type checks, map-provider attribution/legal
review, a clear pre-share summary, cancellation/error states, and tests that
the chosen colors affect presentation only—not visit data, progress, or
coverage semantics.

### Plan a Trip (FEAT-006, planned)

The canonical proposal and lower-model-safe task plan is
`tasks/trip-planning/README.md` (TRIP-001–TRIP-010). It is deliberately outside
the current TestFlight scope.

- Planned intent is a third fact type, separate from automatic observations
  and remembered Past Places.
- Madrid can be selected offline from the existing catalog without typing.
  Optional dates may remain “Someday”; a base, interests, walking preference,
  itinerary, and notes remain local.
- Nearby POIs and walking directions are user-initiated Apple MapKit network
  operations behind injected clients. Saved itinerary content remains usable
  offline; fresh search and route recalculation report their connection need.
- Restaurant and attraction suggestions belong to planned TRIP-005, where a
  person reviews and explicitly saves each suggestion. A Google Maps import is
  not approved or implemented: it requires a separate provider, OAuth consent,
  data-minimization, deletion/export, terms, and App Privacy decision before it
  can be offered.
- “Walking plan” is the first truthful label. Curated tours, narration,
  neighborhood packs, weather, photos, HealthKit steps, and social planning
  require the separate data, permission, licensing, and privacy gates in
  TRIP-010.
- Planned pins use a visually and semantically distinct state and contribute
  no visited boundary at any zoom tier. Post-trip conversion always shows the
  destination and date precision and requires explicit confirmation.
