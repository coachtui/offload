# App Store Review Notes — Offload

Paste the **Review Notes** section below into App Store Connect → App Review
Information → Notes. The rest of this file is checklist and context for us.

> ✅ The demo account below is **live and seeded** (created 2026-08-09 against
> production). Re-verify it still signs in before each submission — see the
> pre-submission checklist at the bottom. A reviewer who cannot reach the
> arrival reminder will reject the Always-location request under Guideline
> 5.1.1.

---

## Review Notes (paste this)

**Demo account**
Email: `demo@useoffload.app`
Password: `OffloadDemo2026!`

This account is pre-seeded with a saved place and an open note attached to it,
so the location feature can be verified without recording anything:

- Place: **`Griffith Observatory`**
- Coordinates: **`34.1184, -118.3004`** (radius 150 m)
- Note attached: *"`Pick up the planetarium tickets for Saturday`"*

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
2. Tap **Places** on the home screen and confirm **`Griffith Observatory`** is
   listed with arrival reminders enabled.
3. Set the simulated location to **`34.1184, -118.3004`**
   (Simulator: *Features → Location → Custom Location…*; device: run a GPX route
   from Xcode → *Debug → Simulate Location*).
4. Background the app (swipe up / press Home), wait ~5 seconds, then reopen it.
   On becoming active Offload runs a foreground proximity check against the
   simulated position.
5. **Expected:** a "You're at `Griffith Observatory`" banner appears at the top
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

**Account deletion**

Tap the avatar in the top-right of the home screen → **Settings** → **Delete
account**. The user re-enters their password, confirms, and the account and all
of its data — notes, transcripts, saved places, reminders, categories and
insights — are deleted immediately. No email or support request is involved.

**Voice recordings are not part of that list because we never store them.**
Audio is streamed to the transcription providers, turned into text, and
discarded; it is never written to our storage and cannot be played back. Only
the transcript persists.

Individual saved places can also be removed without deleting the account:
**Places** → tap a place → **Edit reminder settings** → **Delete this place**.

---

## Pre-submission checklist (internal — do not paste)

- [x] Create the demo account — done 2026-08-09, user id
      `5d14b5f6-f621-4b73-b411-f6068e376d92`. Still needs a sign-in check on a
      clean install.
- [x] Seed the place + at least one **open** (not completed) note attached to it.
      Geofence `006de90b-1aa7-4f0a-b645-fe2b7a918be9`, note
      `69aaf904-e7c9-4da0-b742-a31eb1b46f15`. A completed note will suppress the
      notification and the reviewer will see nothing.
- [x] Confirm the seeded geofence has `enabled: true` and `notifyOnEnter: true` —
      the foreground check in `useProximityAlerts.ts:65` skips regions without both.
      Verified via `GET /geofences`: `{enabled: true, onEnter: true, onExit: false}`,
      `openObjectCount: 1`, `openPreview: "Planetarium tickets"`.
- [x] Fill in every placeholder above.
- [ ] Walk the reviewer steps yourself, on a clean install, exactly as written.
- [ ] Confirm the Privacy Nutrition Label declares Precise Location linked to the
      user. Declaring otherwise contradicts the recording behavior (see
      `docs/IOS_LOCATION_PRIVACY.md` §2).
- [ ] Confirm the Nutrition Label does **not** declare Audio Data collection.
      Audio is transcribed and discarded, never stored — the upload path in
      `voiceSessionService.ts` has no caller (mobile's `sendAudioChunk` is dead
      code) and the app transcribes via `POST /voice/transcribe-audio`. Declare
      the *transcript* (User Content), not the recording. If audio storage is
      ever revived, this label, the privacy policy, and the Delete-account
      consequences list all have to change together.
- [ ] Confirm the account is not rate-limited or reset between review rounds.
- [~] Walk **Settings → Delete account**. The two screens are confirmed rendering
      correctly on device (2026-08-09, iPhone 17 Pro Max, Release build — see
      `docs/app-store/verification/settings.png` and `delete-account.png`).
      **Still outstanding: nobody has actually submitted the form.** Run one real
      deletion on a throwaway account before submitting — 5.1.1(v) is checked on
      essentially every review of an app that creates accounts, and a deletion
      path that errors is worse than none.
- [ ] Confirm the privacy policy's third-party list still matches reality —
      Nominatim was missing from it until 2026-08-09.

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

---

## Demo account provisioning (how it was seeded)

Recreate with these calls if the account is ever lost. All against
`https://brain-dump-production-895b.up.railway.app`.

```bash
# 1. account
curl -X POST $API/api/v1/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"demo@useoffload.app","password":"OffloadDemo2026!","name":"Sam","acceptedTerms":true}'

# 2. place (radius 150m, arrival reminders on)
curl -X POST $API/api/v1/geofences -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Griffith Observatory","type":"custom","location":{"latitude":34.1184,"longitude":-118.3004},"radius":150,"notifyOnEnter":true,"notifyOnExit":false}'

# 3. the open note, then link it
curl -X POST $API/api/v1/objects ...      # objectType must be in the 014 enum; "note" is NOT valid
curl -X POST $API/api/v1/geofences/<geofenceId>/objects -d '{"objectId":"<id>"}'
```

Verify with `GET /api/v1/geofences` — the seeded row must show
`notificationSettings.enabled: true`, `onEnter: true`, and `openObjectCount: 1`.

The display name is deliberately **Sam**, not "App Review": the home screen
greets the user by first name, and "Good afternoon, App" looks broken in
screenshots.
