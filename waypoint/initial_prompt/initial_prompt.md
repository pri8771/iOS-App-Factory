Build a polished, fully offline iOS trip-planning app called "Waypoint".
Native Apple stack only: SwiftUI + SwiftData for persistence, MapKit for
all mapping, ActivityKit for Live Activities, EventKit for calendar
export. No backend, no accounts, no third-party SDKs, no network calls
except on-device MapKit/local geocoding (which works offline-cached but
may need network for tile fetch — if a feature would require live
network for correctness, don't fake it; record it as a gap). Follow the
ios-app-factory-rules.

Core features (complete over broad — ship fewer things fully working):

1. Trips & itinerary: create trips with a date range; each trip has
   multiple days; each day has an ordered list of stops (place name,
   address, optional MapKit-resolved coordinate, time window, notes,
   category icon). Reorder stops via drag-and-drop within a day AND
   across days. Get date math right across the trip's date range,
   including a trip that starts and ends on the same day and a
   single-day trip.

2. Map view: a MapKit view per day showing all of that day's stops as
   annotations connected by a route line (MKDirections walking/driving,
   gracefully degrading to a straight-line polyline with a visible
   "approximate" indicator if MKDirections has no network). Tapping a
   stop centers the map and highlights it; tapping a map pin selects
   the corresponding itinerary row (two-way binding).

3. Expense splitting: a per-trip list of travelers (name, no accounts).
   Log expenses (amount, payer, split method: equal / exact amounts /
   percentage) against any subset of travelers. A settle-up screen
   computing the minimum set of payments to zero every balance (the
   classic debt-simplification graph problem — get this genuinely
   correct, including rounding remainders so amounts always sum
   exactly). Use Decimal, never Double, for money.

4. Packing lists: per-trip checklist, templates the user can save and
   reapply to future trips, a "packed %" indicator.

5. Live Activity: while a trip is "active" (today falls within its date
   range), a Live Activity / Dynamic Island showing the current or next
   stop and time until it, updating as stops are checked off. Must
   degrade gracefully (no crash, no Live Activity) on devices/OS
   versions without support, and when the user denies the permission.

6. Calendar export: export a day's stops as EventKit calendar events
   (with the user's explicit permission), one event per stop honoring
   its time window; must not create duplicate events if exported twice
   for the same day — detect and either skip or update existing ones.

7. Home-screen widget (WidgetKit, separate target): shows the active
   trip's next stop, or "no active trip" honestly if none.

8. iPad: itinerary list and map must work as a genuine two-column split
   view on iPad, not just a stretched phone layout.

Priorities: the debt-simplification math, the drag-reorder data
integrity (no duplicate/lost stops across days), and honest degradation
of every system-permission-gated feature (Live Activities, Calendar,
location) — never fake success when a permission is denied or a
capability is unavailable in the Simulator. Explicitly call out in a
Gaps section anything requiring infrastructure this project can't
provide (live traffic data, real-time flight tracking, iCloud trip
sync). Seed a "demo trip" toggle in Settings with realistic multi-day
sample data so no screen is empty on first review. Provide a clear way
to run it in the iOS Simulator via Xcode.

## Change requested
The app currently FAILS its release gate: UI crawl: declared user flow 'Honest first launch, then enable demo trip' failed: step 4: expected ‘DEMO’ on screen (+6 more) — the app's ACTUAL interactive controls are: settings.tabButton, Settings, Done, tripSwitcher.newTripButton, New Trip. The declared flow may name labels the build never used; make the app expose the exact control the flow taps (add the affordance / set its accessibilityIdentifier), rather than leaving the promised journey unreachable.. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Screen graph, per-screen screenshots, dead taps, and flow results are in docs/ui_crawl/ and docs/ui_crawl.json — open the failing screen's screenshot before fixing.
