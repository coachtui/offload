# iOS Location, Privacy & ATS — engineering record

Internal companion to `docs/APP_STORE_REVIEW_NOTES.md`. That document is written
for Apple; this one records *why* the configuration is what it is, so nobody
"cleans up" a setting that is load-bearing.

Last verified: 2026-08-08 · expo-location 19.0.8 · Expo SDK 54 · RN 0.81.5

---

## 1. `UIBackgroundModes: ["location"]` is REQUIRED. Do not remove it.

`app.json` sets `isIosBackgroundLocationEnabled: true` on the expo-location
plugin, which adds `location` to `UIBackgroundModes`
(`node_modules/expo-location/plugin/build/withLocation.js:8-12`).

At first glance this looks removable. Offload does not stream location: it calls
only `Location.startGeofencingAsync`, which on iOS is CoreLocation *region
monitoring* (`CLCircularRegion` + `startMonitoringForRegion`). Region monitoring
delivers crossings by relaunching the app through the standard mechanism and, in
pure CoreLocation terms, does **not** require the `location` background mode —
that mode exists for `startUpdatingLocation` with
`allowsBackgroundLocationUpdates`.

**Expo's implementation removes that choice.** In
`node_modules/expo-location/ios/TaskConsumers/EXGeofencingTaskConsumer.m:74`,
the geofencing task consumer sets:

```objc
locationManager.allowsBackgroundLocationUpdates = YES;   // line 74
locationManager.pausesLocationUpdatesAutomatically = NO; // line 75
```

unconditionally, before registering any region — even though it then calls only
`startMonitoringForRegion` (line 90) and never `startUpdatingLocation`.

Per Apple's `CLLocationManager.allowsBackgroundLocationUpdates` documentation,
setting that property to `YES` when the app's `Info.plist` does not include
`location` in `UIBackgroundModes` **throws an exception**. So dropping the flag
would not quietly degrade geofencing — it would fault the moment
`startGeofencingAsync` runs, which is on every launch that syncs regions.

**Verdict: keep `isIosBackgroundLocationEnabled: true`.** The declaration is an
artifact of the library's implementation, not of Offload requesting continuous
tracking. If it is ever revisited, the change must be validated on a real device
against a backgrounded *and* force-quit app, not in the simulator — and the
honest fix is upstream (a conditional in the task consumer), not in our config.

This mismatch — declaring a mode broader than our actual usage — is disclosed in
the review notes rather than hidden, because a reviewer reading the Info.plist
will see it and ask.

### Not negotiable

Region monitoring must not be replaced with continuous tracking to work around
anything. There are no calls to `watchPositionAsync`, `startLocationUpdatesAsync`,
or `startMonitoringSignificantLocationChanges` in `mobile/src`, and that should
stay true. `EXLocationTaskConsumer.m` (the streaming consumer) is never reached,
because nothing registers a task with `Location.startLocationUpdatesAsync`.

---

## 2. Where location actually goes

The privacy copy is only defensible if it matches this table. Update both
together.

| Path | Trigger | Leaves device? | Retained? |
|---|---|---|---|
| **Recording** | User taps record; `RecordScreen.tsx:166-177` reads one fix | **Yes** — POSTed with the transcript | **Yes** — persisted on the session (`backend/api/src/routes/voice.ts:98-114`) and propagated to each note as `source.location` |
| **Place resolution** | Server resolves a place name from a note | **Yes** — an approximate viewbox derived from those coordinates goes to **OpenStreetMap Nominatim**, a third party (`placeResolutionService.ts:154-160`) | Third-party logs outside our control; resolved place coords stored |
| **Arrival (background)** | OS region crossing | **No coordinates.** A place/geofence id is POSTed to ask which notes are waiting (`geofenceMonitoringService.ts:474`) | Server learns an arrival occurred; stores a cooldown timestamp |
| **Proximity check (foreground)** | App becomes active; `useProximityAlerts.ts` | **No** — compared on-device against geofences fetched from the server | Not stored |

Consequences:

- "Offload never stores or sends your location" is **false**. Copy must not say it.
- "Offload doesn't continuously track you or upload a location history" is **true**
  and is the claim the UI now makes.
- The App Privacy label must declare **Precise Location, linked to the user**
  (recordings carry coordinates). Declaring less contradicts row 1.

## 3. Copy audit

Fixed in this pass:

| File | Was | Now |
|---|---|---|
| `ArrivalPermissionSheet.tsx:36` | "Your location is never stored or sent anywhere." | Scoped to arrival checking; discloses the arrival lookup |
| `locationService.ts` (`getPermissionExplanation`) | "Location is only saved if you choose to save the note", "not saved or sent to the server" | States that a saved note carries its coordinates; keeps the accurate on-device claim for the nearby check |
| `locationService.ts` (`getBackgroundPermissionExplanation`) | "Your location is NOT tracked or stored." | "Doesn't continuously track… On arrival it asks the server which notes are waiting there." |
| `locationService.ts` header / `geofenceMonitoringService.ts` header | "No location storage", "No location history stored" | Replaced with the table in §2 |

Both `locationService` explanation helpers are **shipped UI**, not dead code —
they render in `CreateGeofenceScreen.tsx:649` and `:659`.

`PermissionsScreen.tsx` copy was audited and left unchanged: it explains benefit
without making retention claims.

Regression guard — this should return nothing but matches inside comments that
explicitly describe the real behavior:

```bash
grep -rniE "never (stored|sent|tracked)|not (saved|stored|sent) (or|to)|NOT (tracked|stored)" mobile/src/
```

## 4. ATS

`NSAllowsArbitraryLoads: true` was removed. Every production endpoint is already
TLS:

- API + WebSocket: `https://` / `wss://brain-dump-production-895b.up.railway.app`
  (all four EAS profiles in `eas.json`, and `mobile/.env`)
- Transcription: `wss://api.deepgram.com`
- Marketing links: `https://useoffload.app`

The only `http://` in `mobile/src` are `localhost` fallbacks used when
`EXPO_PUBLIC_API_URL` is unset (`api.ts:158`, `websocket.ts:8`,
`geofenceMonitoringService.ts:19`). The narrow `localhost` exception is retained
for those.

`NSAllowsLocalNetworking` was deliberately **not** added: LAN-IP dev isn't used
(dev builds point at the Railway host), so it would be an exception nothing needs.

## 5. Deliberately unchanged

- **`NSLocationAlwaysUsageDescription`** — only consulted on iOS 10 and earlier,
  so it is dead weight on an iOS 15.1+ deployment target. Kept, with its copy
  synced to the modern key, because removing it is a non-zero-risk change with
  zero benefit.
- **Purpose strings duplicated** between `ios.infoPlist` and the expo-location
  plugin block. Which one wins during prebuild is version-dependent; keeping them
  byte-identical makes the question moot. **If you edit one, edit both.**
- **The permission ladder** — mic → When In Use → notifications at onboarding,
  Always deferred until a note resolves to a place. Unchanged by design.
