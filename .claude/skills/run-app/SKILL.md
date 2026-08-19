---
name: run-app
description: Launch and verify the Offload iOS app — Release simulator build for screenshots/walkthroughs, or the real-device OTA loop for behavioral verification. Use when asked to run the app, take screenshots, drive the UI, or confirm a change actually works on a device.
---

# Running and verifying Offload

Two lanes. Pick by what the verification needs:

- **Simulator** — screenshots, UI walkthroughs, driving flows that don't need
  geofences/background location/push. Fast, scriptable.
- **Real iPhone (Tui's)** — anything involving arrival triggers, background
  location, local notifications, or purchases. These do not behave in the
  simulator. You can't drive the phone; you publish and Tui exercises it.

There is no local backend in either lane — the app always talks to the deployed
Railway API.

## Lane 1: Simulator

**Build & launch** (Release embeds the JS bundle — no Metro, no dev-client
chrome in screenshots; `ios/` is gitignored so prebuild is safe):

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://brain-dump-production-895b.up.railway.app \
  npx expo run:ios --device "iPhone 17 Pro Max" --configuration Release --no-bundler
```

iPhone 17 Pro Max = 1320×2868 = the App Store 6.9" screenshot size.

**Screenshots**: `xcrun simctl io <UDID> screenshot out.png` — always works, no
macOS permissions. Never use `screencapture` (see pitfall below). For
walkthroughs, run a hash-dedup capture loop (~1.5 s interval, keep changed
frames only) and review every frame as contact sheets — skipping alternate
frames once missed a whole screen.

**Driving with cliclick** — the Simulator window is title bar + bezel + a
scaled-down screen, so never map coordinates ratio-wise across the window
bounds. Derive the transform from one measured landmark per session (window
position and zoom drift). Reference point from Aug 2026: window at (576,46)
size 455×974 → `screen = (627 + 0.2857·x, 131 + 0.2857·y)` where x,y are
pixel coords in the 1320×2868 screenshot. Rules:

- Focus the Simulator first (`osascript -e 'tell application "Simulator" to
  activate'`) or the first click is consumed by activation.
- Single taps only, long settles, screenshot-verify after every step. Never
  double-tap to "prime" — if the first tap navigates, the second lands on the
  new screen.
- **Clicks silently doing nothing = an invisible macOS modal** (e.g. a
  permission dialog raised by `screencapture`) sitting over the Simulator. It
  is invisible to `simctl io screenshot`, which captures only the device
  framebuffer. Dismiss with `cliclick kp:esc`; don't grant the permission.

**State gotchas**: Keychain survives uninstall — a "clean install" still
auto-logs-in via SecureStore; true fresh state needs `simctl erase` or a
different account. Location is simulated from the Simulator menu (Features →
Location → Custom Location…), not inside the app. Demo/reviewer credentials
and re-seeding: `docs/APP_STORE_REVIEW_NOTES.md`.

## Lane 2: Real device (OTA loop)

For JS-only changes. Native/config changes (entitlements, permissions, native
modules, `app.json` version bump) need a full `eas build` + install instead —
OTA cannot carry them.

1. Merge to `main` → Railway auto-deploys the API (~2 min).
2. `cd mobile && npx eas-cli update --branch preview --message "..."` —
   **published from the LOCAL env**: confirm `mobile/.env` has
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, and pass `--clear-cache` if any
   `EXPO_PUBLIC_*` value changed since the last bundle (Metro caches inlined
   values; both halves of this bit us on 2026-08-17).
3. Tui relaunches the app **once** — `checkForUpdate` fetches, reloads, and
   re-runs startup code on the new bundle within that same launch. Ordering is
   the constraint, not launch count: publish must precede the launch, and the
   launch needs network. A background/arrival event before that first launch
   still runs the old bundle.

The `production` branch serves TestFlight/App Store installs of the same
runtime version — update it deliberately, never automatically, and only from
merged `main` (the update record stamps the commit SHA).

## Confirming what's actually running

- **On the device**: account sheet (tap Home avatar) footnotes
  `v<version> · <channel> · update <8-char id> · <time>`. This is the only
  ground truth; `eas update:list` says what was *published*, not what
  launched. Quote the **iOS update ID** from the publish output, not the
  headline group ID — same publish, different hex.
- **Inside a build**: `npx eas-cli build:list --platform ios --limit 5`, then
  download the `.ipa` from its Application Archive URL. The `Commit` field
  lies by omission — EAS uploads the working tree, so a build routinely
  contains uncommitted code. Decisive check for a JS change:
  `strings Payload/*.app/main.jsbundle | grep -F "<string unique to the new code>"`.
  Icon assets are loose `AppIcon*.png` in `Payload/*.app/` (CgBI format —
  `sips -s format png` converts them viewable).
