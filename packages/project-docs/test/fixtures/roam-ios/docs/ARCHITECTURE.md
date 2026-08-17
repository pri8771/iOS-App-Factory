# Architecture

## Current architecture

Roam is a native SwiftUI app using view models, SwiftData, Core Location,
MapKit, and read-only SQLite geography resources. Release services require
seven validated production databases—six geometry bundles plus one
country/city catalog; DEBUG ZCTA paths may use the labeled sample fixture.
`ZCTAIndex` performs R-tree candidate queries and
point-in-polygon checks. `VisitTransitionService` converts confirmed matches into
unique tracked areas and visit segments. `MapViewModel` builds pins and requests
zoom-aware or explicitly scoped overlays from
`MultiTierZCTAOverlayFactory`.

Persisted `AppSettings.trackingEnabled` is user intent, while `TrackingState`
is a transient runtime projection. App launch, foreground activation,
authorization changes, and Core Location relaunches all re-evaluate one resume
policy. The engine starts only after persistent storage, deletion recovery,
processor writes, production geometry, and authorization pass their gates.
Foreground current-location requests use the same callback router: with
tracking off they may update only transient coordinate/blue-dot state; only an
opted-in sample may reach `LocationEventProcessor` and persistence.

Core Location delivery is event-driven, not timer-driven. The current service
starts standard updates, significant-change monitoring, and visit monitoring
together. Balanced defaults to 100 m desired accuracy, a 200 m standard-update
distance filter, and no automatic pausing. Battery Saver uses 1 km/500 m with
pausing; High Accuracy uses 10 m/75 m without pausing. `distanceFilter` is not a
time interval and does not control significant-change or visit callbacks.
Each delivered callback array now enters the processor actor through one task;
the actor stable-sorts samples by timestamp and preserves original order for
ties. A pure checkpoint policy can aggregate repeated same-area progress, but
its production default remains immediate because no owner-approved cadence or
loss budget exists. With the default diagnostic log enabled, each processed
element therefore still normally ends in a `ModelContext.save()` even when it
is rejected, unmatched, low-confidence, or transition-ignored. Manager-facing settings now resolve
through one `EffectiveLocationConfiguration`: a preset seeds the editable
fields, persisted custom distance/accuracy/auto-pause values remain
authoritative, invalid legacy numbers clamp or fall back into the visible UI,
and the background-indicator preference is not overwritten at start. A narrow
adapter makes property and service assignments deterministic in tests.

TF-008.8–TF-008.12 define the target boundary:

```text
ordered callback batch
  -> filter/match/transition evaluation for every sample
  -> immediate durable open/transition/close/deletion-fence transaction
  -> bounded same-area checkpoint policy
  -> bounded redacted diagnostic flush policy
  -> privacy-safe aggregate cadence/energy evidence
```

One validated `EffectiveLocationConfiguration` is the source passed to an
injectable manager adapter. Unchanged reconfiguration performs no restart;
changed properties apply live, and changed service membership touches only the
affected service. A pure service-composition state machine may reduce
background work only after physical A/B evidence proves both correctness and
energy budgets. Ordered batching and injectable same-area checkpoint
infrastructure are locally code-complete. Until cadence/loss budgets and
physical evidence are approved, the immediate production checkpoint plus
current simultaneous service policy remain authoritative. TF-008.11 now has
bounded actor-buffer/flush infrastructure, but its production diagnostic policy
also remains immediate until an owner-approved crash-loss/flush budget and
end-to-end export/clear proof exist.

## Data flow

```text
Core Location
  -> explicit tracking-intent/deletion-fence routing
  -> location quality and boundary-confidence gates
  -> SQLite R-tree candidate lookup
  -> detailed point-in-polygon match
  -> visit transition service
  -> SwiftData tracked area and visit records
  -> MapViewModel
  -> MapKit pins and polygon overlays
```

Home navigation remains typed and local to `AppTabView`:

```text
Dashboard metric
  -> DashboardNavigationIntent
  -> AppTab selection
  -> unique MapNavigationRequest when applicable
  -> visited-coverage camera fit
  -> Automatic zoom hierarchy retained
```

The persisted visited key is always a ZCTA code, but hierarchy bundles use
different identifiers. `MultiTierZCTAOverlayFactory` therefore translates
before querying: the stored ZCTA centroid is matched against the target state,
country, continent, place, or county spatial index. ZIP-range-to-Census-FIPS
and exact country/continent rules are bounded fallbacks for small territories
omitted by Natural Earth at the bundled scale. American Samoa, Guam, Northern
Mariana Islands, Puerto Rico, and U.S. Virgin Islands have explicit ZIP/FIPS/
continent fixtures. A missing relationship is omitted rather than invented.
Explicit map scopes are Automatic, ZIP Areas, States, Countries, and
Continents. A Map-menu scope selection changes overlays but preserves the
current camera, so users can compare the same location across levels; a typed
Home navigation request is the only normal path that fits the camera to all
visited coverage. Current collection remains supported-ZCTA-derived; browsing
a worldwide boundary does not imply non-US visit tracking.

Automatic mode resolves the complete visual chain from the camera span:
Continent → Country → State → County → City/Place → ZIP Area. A Home ZIP/State
metric requests only a camera fit and keeps Automatic; a concrete tier persists
only when the person selects it from the Map coverage menu. The chip includes
the live automatic tier so a broad view cannot silently look like a locked
States view.

## Accepted worldwide Past Places architecture

The catalog, persistence, add-flow, atomic Undo, upward-only coverage/pins,
History/detail, and separate manual CSV exports are present in the integrated
source and 192-test non-StoreKit unit run. They remain
`verification_pending` because full UI/accessibility/offline/relaunch checks
and exact-device evidence are incomplete.

Manual remembered travel is separate from the observed ZCTA pipeline:

```text
Bundled GeoNames country/city point catalog
  -> browse or local search
  -> optional date precision and visit purposes (unknown/empty by default)
  -> guarded ManualPlaceService transaction
  -> SwiftData VisitedPlace + PlaceVisit + PlaceVisitPurposeTag
  -> upward-only CoverageHierarchyResolver
  -> verified same-level and ancestor outlines only
  -> Past Places history/detail
```

`VisitedPlace` stores a stable source ID, source version, display/hierarchy
snapshot, catalog representative point, and replaceable geometry references.
That reference point may be a capital or another verified GeoNames feature; it
is neither an observed user coordinate nor necessarily a geometric centroid.
`PlaceVisit` stores source and only the unknown/year/month/day/range precision
the person supplied. V3 stores each optional normalized Work, Vacation,
Family/Friends, or Other value in a `PlaceVisitPurposeTag` companion row keyed
to the visit UUID. The companion design leaves the genuine V2 `PlaceVisit`
entity unchanged so SwiftData can migrate existing stores safely; guarded
service mutations own uniqueness and referential cleanup. None of these models
creates automatic-tracking records or synthetic ancestors.
Direct and derived coverage is unioned by stable ID at read time:

```text
manual city point -> containing city? -> county? -> state? -> country -> continent
manual country ---------------------------------------------> country -> continent
tracked ZCTA -> city -> county -> state -> country -> continent
```

Every arrow is optional when a relationship is missing or ambiguous, and there
are no downward arrows. A city without a verified polygon remains a marker with
an explicit unavailable-outline state. For a manually added U.S. city,
`CoverageHierarchyResolver` may use the persisted catalog representative point
against the independent Census place, county, and state point-in-polygon
indexes when an exact persisted boundary ID is absent. It never queries the
ZCTA index for a manual city. The production Pittsburgh fixture therefore
resolves place `4261000`, county `42003`, and state `42`, then its existing
country/continent crosswalk, while the manual `.zcta` contribution stays
empty. This read-time fallback also repairs older saved records without a
schema migration.

The first catalog is fully bundled and read-only so browsing and search do not
require an account, backend, or live GeoNames request. GeoNames supplies stable
IDs, names, hierarchy fields, and WGS84 city **points** under CC BY; Natural
Earth supplies coarse public-domain country/continent polygons. The catalog
stores a stable-ID-to-geometry-ID crosswalk because the existing Natural Earth
bundle uses display names as feature keys.

The exact current artifact is `world_places_bundle.sqlite`: 52,236,288 bytes,
SHA-256
`3798a8a967204597a2eda1cb3ede5f178d3225e3e280880f989d12665238827f`,
250 addable current countries with verified GeoNames points, 69,542 cities,
and 175 country-polygon crosswalks. The other 75 current countries are
marker-only; two historical GeoNames source countries (`AN`, `CS`) are
excluded. It is the seventh production SQLite resource and follows the same
fail-closed Release posture as the six geometry databases through
`Scripts/validate_world_place_catalog.py`.

Fine worldwide administrative/locality polygons are deliberately outside the
base artifact. The preferred later source is Overture Divisions:
`division` supplies point/entity/hierarchy data while `division_area` supplies
Polygon/MultiPolygon geometry. A future pipeline must pin a release, preserve
GERS IDs and political perspectives, simplify and validate per-country packs,
sign an immutable manifest, and download/cache only required packs. It is
blocked on DEC-010's ODbL derivative-database attribution/share-alike and
artifact-hosting approvals.

## Proposed Plan a Trip architecture

FEAT-006 is planned, not implemented, and not part of the current TestFlight
gate. Its canonical decomposition is `tasks/trip-planning/README.md`. The
non-negotiable model boundary is:

```text
observed fact:    TrackedZCTA + ZCTAVisit
remembered fact:  VisitedPlace + PlaceVisit
future intent:    PlannedTrip + TripDay + TripStop
```

Trip creation, dates, stop completion, directions, current-location help, or
trip completion never write either history model. The only bridge is a
separate, confirmed “Add destination to Past Places” action that shows the
destination and date precision before calling `ManualPlaceService`.

The intended local-first flow is:

```text
bundled WorldPlaceCatalog
  -> offline destination selection
  -> versioned SwiftData trip draft and itinerary
  -> optional user-initiated TripDiscoveryClient (MapKit POIs)
  -> optional user-initiated TripRouteClient (walking legs)
  -> distinct planned pins plus an equivalent accessible list
  -> explicit Apple Maps handoff
```

The MapKit clients must be injected, cancel stale requests, ignore mismatched
generations, and expose loading, empty, offline, throttled, and failed states.
Only a minimal user-selected place snapshot may persist after Apple terms
review; Roam must not build a background Apple POI or route database. Saved
itinerary order, notes, and markers remain available offline, while fresh
search and route recalculation state their network dependency. “Use my
location” is a foreground, one-shot, user-initiated input that cannot change
the tracking preference or create history.

Madrid is marker-only in the current bundled catalog: Spain and Europe have
coarse outlines, but Roam does not currently own Madrid city or neighborhood
polygons. A future Madrid municipal or worldwide Overture pack must pass
license, attribution, perspective, integrity, hosting, size, and offline
gates. Editorial/audio tours also require redistribution rights, transcripts,
content dates, explicit playback, and download/removal behavior.

The share experience is a static privacy-safe image, not an interactive map.
`CoverageShareView` previews state-level aggregates and
`ShareSnapshotRenderer` creates one opaque 1080×1350 light-appearance asset.
An item-backed sheet is created only after a dimension-validated image exists,
so rendering or resource failure cannot present empty share content. The
snapshot excludes coordinates and individual ZIP Code Area identities.

The build-time paths are:

```text
Census boundary source -> WGS84 GeoJSON -> simplification/encoding
-> validated zcta_bundle.sqlite -> read-only app resource
-> Release resource gate -> signed app bundle

GeoNames country/cities + Natural Earth country attributes
-> deterministic world-place catalog builder
-> validated world_places_bundle.sqlite
-> Release resource gate -> signed app bundle
```

## Persistence

- User tracking state, discovered ZCTAs, automatic visits, manual
  `VisitedPlace`/`PlaceVisit` history and `PlaceVisitPurposeTag` values,
  settings, and event logs use a versioned SwiftData schema. V3 adds only the
  companion purpose entity; V1 and V2 remain unchanged migration inputs.
- If the persistent store cannot open, the app preserves the on-disk files,
  creates a temporary in-memory container only to render a recovery screen, and
  blocks tracking so visits are not silently written to temporary storage.
- Boundary geometry is immutable SQLite data bundled with the app.
- The worldwide place catalog is an immutable SQLite release resource; saved
  manual history keeps its own display/hierarchy snapshots so a catalog failure
  or version change cannot erase the user's visible record.
- Delete All Data first suspends the processor and advances an actor-owned
  write generation, so late location/diagnostic/end-visit callbacks are
  rejected. It then stops location/MetricKit writers, waits for the actor
  barrier, stages app-controlled export/diagnostic files on the same
  Application Support root, and uses a metadata-only journal. Pre-commit
  failures restore staged files and roll back SwiftData; post-commit relaunch
  recovery is idempotent and forward-only. Success resets processor filter/
  transition state only after model reset, quarantine cleanup, and journal
  removal. Recovery direction is
  determined only from the last atomically written journal phase, and Delete
  All Data is
  unavailable while the app is rendering from an in-memory persistent-store
  recovery container. This is process-interruption recovery, not a claim of
  file/directory durability across sudden power loss.
- `Scripts/enforce_release_resources.sh` validates every required production artifact
  after resource copy and removes the DEBUG fixture before code signing.
- `Scripts/restore_release_resources.sh` is the provider-neutral supply-chain
  boundary. It makes no network request: an explicitly supplied exact local
  directory/zip/tar is staged, validated with the canonical manifest, then
  installed behind a lock and incomplete marker with rollback of a prior valid
  set. The future owner-selected provider must feed this boundary.
- The production artifacts are generated release inputs and are currently
  gitignored; release automation must obtain them through the still-unselected
  provider and run the restore/check boundary before archiving.

## External dependencies

- Apple Core Location and MapKit: device location and rendering.
- U.S. Census ZCTA cartographic boundaries: public geographic source.
- Natural Earth: coarse public-domain country/continent overview geometry.
- GeoNames: bundled CC BY worldwide country/city point catalog; no runtime
  GeoNames service.
- SQLite3: bundled spatial data and R-tree indexing.
- StoreKit: optional-to-the-core-loop one-time Roam Plus product. If it remains visible in the beta, TF-006 requires a complete localized-price/state/entitlement implementation and a matching App Store Connect non-consumable.
- No third-party runtime packages or backend.

## Known architectural risks

- National geometry may exceed acceptable app-size, memory, or overlay budgets.
- ZCTAs approximate ZIP geography and do not cover every USPS ZIP.
- Background execution and location delivery are controlled by iOS.
- Simplification can damage holes, islands, or boundary accuracy if not validated.
- The project file and generator must agree about production bundle resources.
- App Store Connect export depends on external distribution signing assets.
- The seven gitignored production SQLite resources remain a release supply-
  chain risk. Local checksummed transactional restoration exists, but TF-002
  still requires an approved provider/authenticated CI path and clean-checkout
  proof for the entire set.
- The world-place catalog's pinned inputs, local artifact hash, and tests are
  recorded, but its candidate archive/thinned-size and physical search
  measurements remain TF-002/TF-011 gates.
- Jira and Notion are non-authoritative planning mirrors; release architecture and evidence remain repository-controlled under DEC-007.
