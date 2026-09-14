Build a fully offline iOS + watchOS workout-form-coaching app called
"Formcheck". Native Apple stack only: SwiftUI + SwiftData, Vision
framework (VNDetectHumanBodyPoseRequest) for on-device rep counting and
form analysis from the camera, Core ML for on-device exercise
classification, HealthKit for writing completed workouts (with explicit
permission), WatchConnectivity for a companion watchOS app, Mac Catalyst
as a secondary target for reviewing session footage on a larger screen.
No backend, no accounts, no network — everything must work in airplane
mode. Follow the ios-app-factory-rules. The iOS Simulator cannot access
a camera or a paired Watch — do not fake camera/Watch behavior in
Simulator; detect the unavailability and report it as an explicit,
honest capability gap rather than mocking fake pose data or fake Watch
messages. Likewise if any feature turns out to need a paid developer
account entitlement, record that as a gap rather than omitting or
faking the feature silently.

Core features (complete over broad — ship fewer things fully working):

1. Camera-based rep counting: record a set using the front or back
   camera; run Vision body-pose detection in real time (or near-real-
   time on-device, whichever is honestly achievable) to count reps for
   a small set of exercises (squat, push-up, plank hold) and flag at
   least one concrete form issue per exercise (e.g., squat depth,
   push-up elbow angle) — the flagging logic must be a real, documented
   geometric rule on the pose joints, not a placeholder.
2. Exercise classification: a small on-device Core ML model (or a
   documented, justified fallback heuristic if training/bundling a
   custom model is genuinely out of scope for this project — record
   that decision honestly either way) that classifies which exercise
   is being performed from the pose stream, so the user doesn't have
   to manually select it every set.
3. Session history: SwiftData-persisted workout sessions (exercise,
   rep count, duration, flagged form issues, optional recorded clip
   reference) with a calendar/list view and per-exercise trend charts
   (Swift Charts).
4. HealthKit write: on session completion, with explicit permission,
   write a HKWorkout entry (type, duration, and any derived energy
   estimate you can honestly compute on-device — do not invent
   biometric numbers you have no basis for). Must degrade gracefully,
   with the session still fully saved locally, if permission is denied.
5. Apple Watch companion (separate watchOS target): shows live rep
   count and elapsed time on the wrist during a set, mirrored from the
   iPhone via WatchConnectivity, plus a haptic tap on every counted
   rep. Handle the Watch being unreachable/unpaired/app not installed
   without crashing or hanging the iPhone side.
6. Mac Catalyst target: browse past sessions and step through a
   recorded clip frame-by-frame with the detected pose skeleton
   overlaid, for reviewing form after the fact on a bigger screen.
7. Settings: manage which exercises are enabled, HealthKit permission
   status (with a re-request path), and a full local data export/erase
   (no data leaves the device implicitly, ever).

Priorities, in order: (a) honest reporting of every Simulator/hardware/
entitlement limitation encountered — this is the primary thing being
tested, do not paper over gaps with fake data or silently dropped
scope; (b) the pose-based rep-counting and form-flagging logic actually
being a real, explainable geometric algorithm; (c) WatchConnectivity
and HealthKit failure paths never crashing or corrupting a locally
saved session. Use TimeInterval for durations, Decimal only if you
introduce any real currency (you shouldn't need to). Seed a "demo
session" toggle with a pre-recorded pose-data fixture (not a live
camera capture) so history/charts/Watch-summary screens are never
empty on first review even though live camera/Watch testing isn't
possible in Simulator. Provide a clear way to run what CAN run in the
iOS Simulator via Xcode, and a precise list of what requires a real
device/Watch to verify.

## Change requested
The app currently FAILS its release gate: UI crawl: declared user flow 'Demo session end-to-end' failed: step 1: no tappable element ‘home.startSetButton’ (+4 more) — the app's ACTUAL interactive controls are: Home, History, Settings, Known Limits. The declared flow may name labels the build never used; make the app expose the exact control the flow taps (add the affordance / set its accessibilityIdentifier), rather than leaving the promised journey unreachable.. Fix every problem named until the gates pass; do not drop features unless unavoidable.
Screen graph, per-screen screenshots, dead taps, and flow results are in docs/ui_crawl/ and docs/ui_crawl.json — open the failing screen's screenshot before fixing.
