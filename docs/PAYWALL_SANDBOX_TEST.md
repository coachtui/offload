# 1.2.0 Paywall — sandbox test script (Phase D)

Run on a real iPhone with the 1.2.0 TestFlight build. Nobody gets charged:
TestFlight always runs StoreKit in **sandbox**, and sandbox compresses time —
the 14-day trial lasts ~3 minutes, a month ~5 minutes. That compression is the
feature: the full subscribe → lapse loop fits in one sitting.

## Setup (once)

1. ASC → Users and Access → **Sandbox** → Testers → **+** — make a sandbox
   Apple ID (any unused email; it never needs a real inbox).
2. On the iPhone: Settings → App Store → scroll to **Sandbox Account** →
   sign in with it. (Your real Apple ID stays signed in above; sandbox is a
   separate slot.)
3. Server prep: `ENFORCE_ENTITLEMENTS=true` must be set on Railway for the
   lapse tests below to mean anything. Set it for the test session; it can
   stay on afterward IF the 1.2.0 build is about to be the released app —
   otherwise flip it back off so pre-1.2.0 TestFlight users aren't gated.

## The loop

### A. Fresh trial
- [ ] Register a fresh account in the app (post-migration signup → `'none'`).
- [ ] Settings → Subscription shows "Start your 14-day free trial" → opens the
      paywall; both packages render with real localized prices. *(If it shows
      "Subscriptions aren't available", the offering/key chain is broken —
      stop and debug before anything else.)*
- [ ] **Screenshot the paywall here** — this is the ASC review screenshot for
      both subscription products (upload afterward; clears Missing Metadata).
- [ ] Start the trial (monthly). Apple's sandbox purchase sheet completes.
- [ ] The paywall shows "One moment…" then dismisses with the welcome toast —
      that's the /auth/me poll confirming the WEBHOOK arrived, not the SDK.
      Verify server-side: user's entitlement is `trialing`, and the RevenueCat
      webhook shows 200s in its event history.
- [ ] Record a note → it saves (gated route passes).
- [ ] Settings → Subscription now reads "Offload Pro — free trial".

### B. Lapse (sandbox trial ≈ 3 min; auto-renews ~6× then expires ≈ 30 min total)
- [ ] In the App Store sandbox settings, cancel the subscription (or just wait
      out the compressed renewals until EXPIRATION fires).
- [ ] After expiry: recording a note → paywall appears over the app (403 →
      paywallBus → modal). The generic error toast under it is acceptable.
- [ ] **The promise check**: before lapsing, attach a note to a nearby saved
      place and confirm after lapse that simulating arrival still fires the
      banner/notification. Armed reminders must survive a lapse. Reads,
      Done/delete, and Places all still work signed-in and lapsed.
- [ ] Weekly digest check (optional, server-side): lapsed user absent from
      `listDigestCandidates` while the flag is on.

### C. Restore
- [ ] With an active sandbox sub: delete the app, reinstall from TestFlight,
      sign in, paywall → **Restore Purchases** → entitled without a new
      purchase sheet.

### D. Grandfathered
- [ ] Sign into your own (pre-paywall) account: no paywall anywhere, Settings
      shows "Free forever — early supporter", recording works with the
      enforcement flag ON.
- [ ] Demo account (`demo@useoffload.app`): same — it must never see a paywall
      or App Review walks into it.

### E. Annual + cancel-keeps-access
- [ ] Fresh account #2: buy annual. Cancel immediately. Access persists until
      the (compressed) period ends — CANCELLATION is not EXPIRATION.

### F. Account deletion with a live sub
- [ ] Delete one of the test accounts while subscribed. Deletion succeeds
      (RevenueCat purge is best-effort; check logs for ORPHANED_REVENUECAT —
      absence of that line means the customer delete worked or was skipped).

## After the loop
- [ ] Upload the paywall screenshot to both products in ASC → "Ready to Submit".
- [ ] Decide the enforcement flag's resting state (see Setup #3).
- [ ] Attach both subscription products to the 1.2.0 version page and submit,
      with review notes: sandbox steps, "demo account is grandfathered — to
      see the paywall, register a fresh account", and the existing location
      walkthrough from docs/APP_STORE_REVIEW_NOTES.md.
