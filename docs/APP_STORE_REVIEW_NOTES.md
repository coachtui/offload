# App Store Review Notes — Offload

Paste the **Review Notes** section below into App Store Connect → App Review
Information → Notes. The rest of this file is checklist and context for us.

> ⚠️ **Before submitting**, fill in the two placeholders marked `<<…>>` and
> complete the pre-submission checklist at the bottom. A reviewer who cannot
> reach the arrival reminder will reject the Always-location request under
> Guideline 5.1.1.

---

## Review Notes (paste this)

**Demo account**
Email: `<<DEMO_EMAIL>>`
Password: `<<DEMO_PASSWORD>>`

This account is pre-seeded with a saved place and an open note attached to it,
so the location feature can be verified without recording anything:

- Place: **`<<SEEDED_PLACE_NAME>>`**
- Coordinates: **`<<LAT>>, <<LNG>>`** (radius 150 m)
- Note attached: *"`<<SEEDED_NOTE_TEXT>>`"*

---

**What Offload does**

Offload is a voice-notes app. You speak a thought, and it is split into separate
notes. When a note mentions a place ("grab milk at Safeway"), Offload links it to
that real location so it can remind you when you are actually there — the core
feature of the product.

**Why Offload requests "Always" location**

Delivering that reminder requires iOS to wake the app when the user crosses into
a saved place while Offload is closed. That is only possible with Always.

Offload uses **CoreLocation region monitoring** (`CLCircularRegion` /
`startMonitoringForRegion`, capped at the iOS limit of 20 regions). It does
**not** use continuous location updates, significant-change monitoring, or any
location stream. There are no calls to `startUpdatingLocation` in the app's own
code. Crossings are detected by the OS on-device; Offload receives an enter/exit
event, never a location history.

*Disclosure:* the Info.plist declares `UIBackgroundModes: location`. This is
required by the Expo SDK's geofencing implementation, which sets
`allowsBackgroundLocationUpdates = YES` on its `CLLocationManager` before
registering regions — iOS throws without the declaration. It reflects the
library's requirement, not continuous tracking by Offload.

**When the request appears**

Always is never requested at launch or during onboarding. Onboarding asks only
for microphone, When In Use location, and notifications — all skippable.

The Always request appears only **after** a recorded note has resolved to a real
place, in a screen that names that place ("Remind you at Safeway?") so the user
sees the reason before the system dialog. It is shown at most once per account,
and declining it leaves the app fully functional minus arrival reminders.

**How to verify the feature (≈3 minutes)**

Arrival reminders are intentionally gated: a notification fires only when the
user is inside a saved place *and* has an open note there. Using the demo
account above:

1. Sign in with the demo account. Grant microphone, location ("While Using"),
   and notifications at the onboarding screen.
2. Tap **Places** on the home screen and confirm **`<<SEEDED_PLACE_NAME>>`** is
   listed with arrival reminders enabled.
3. Set the simulated location to **`<<LAT>>, <<LNG>>`**
   (Simulator: *Features → Location → Custom Location…*; device: run a GPX route
   from Xcode → *Debug → Simulate Location*).
4. Background the app (swipe up / press Home), wait ~5 seconds, then reopen it.
   On becoming active Offload runs a foreground proximity check against the
   simulated position.
5. **Expected:** a "You're at `<<SEEDED_PLACE_NAME>>`" banner appears at the top
   of the screen *and* a local notification is delivered. Tapping either opens
   the place, showing the note waiting there.

Step 4 is the deterministic path and does not depend on background region
delivery, which iOS may defer by several minutes.

**To see the Always request in its natural context** (optional):

1. Sign in, complete onboarding.
2. Tap the microphone and say: *"I need to pick up milk at Safeway."* Tap
   **Done — offload it**.
3. Wait ~10 seconds for processing. Once the note resolves to a real Safeway
   location, a sheet appears: **"Remind you at Safeway?"** — this is the
   contextual Always request described above.

**Data handling**

Location is used in three distinct ways, disclosed in-app at the point of
consent:

- Arrival checking runs on-device via region monitoring; no coordinates are
  uploaded on a crossing.
- A voice note is saved with the coordinates where it was recorded, so a place
  name resolves to the nearby branch rather than an arbitrary one.
- Place-name lookup queries OpenStreetMap Nominatim.

Offload does not build or upload a location history and does not track users in
the background. This matches the app's Privacy Nutrition Label (Precise
Location, linked to the user, used for App Functionality).

---

## Pre-submission checklist (internal — do not paste)

- [ ] Create the demo account and verify it can sign in on a clean install.
- [ ] Seed the place + at least one **open** (not completed) note attached to it.
      A completed note will suppress the notification and the reviewer will see
      nothing.
- [ ] Confirm the seeded geofence has `enabled: true` and `notifyOnEnter: true` —
      the foreground check in `useProximityAlerts.ts:65` skips regions without both.
- [ ] Fill in every `<<…>>` placeholder above.
- [ ] Walk the reviewer steps yourself, on a clean install, exactly as written.
- [ ] Confirm the Privacy Nutrition Label declares Precise Location linked to the
      user. Declaring otherwise contradicts the recording behavior (see
      `docs/IOS_LOCATION_PRIVACY.md` §2).
- [ ] Confirm the account is not rate-limited or reset between review rounds.

### Choosing the seeded coordinates

Pick somewhere unambiguous and easy to type — a well-known landmark works better
than a suburban address. Avoid coordinates near an Apple campus: the reviewer's
real position could sit inside a region and confuse the result.

### Known reviewer pitfalls

- The proximity check has a **30-minute per-place notification cooldown**
  (`useProximityAlerts.ts:28`). If a reviewer repeats step 4 immediately, the
  banner still appears but a second notification will not. Mention this only if
  they push back on notification delivery.
- Background region delivery on iOS can lag several minutes and does not fire an
  enter event if the device is already inside the region when monitoring starts.
  The foreground path in step 4 exists precisely to avoid depending on it.
