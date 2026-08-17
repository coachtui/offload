# 1.2.0 — Subscription paywall ($4.99/mo, 14-day free trial)

**Status: PLANNED** — drafted 2026-08-17 while 1.1.0 (build 6) awaits review.
Decision made with 1.1.0: submit it for review now with **manual release**,
build this as 1.2.0, launch publicly paid. Nothing here touches the 1.1.0
binary.

Product decision log:
- $4.99/month, 14-day free trial (Apple Introductory Offer, not home-rolled).
  14 days = the shortest trial that shows the Sunday-18:00 weekly digest twice.
  (Settled 2026-08-17 — was $3.99 in the first draft. $4.99 nets ~$4.24/mo
  under the Small Business Program, a comfortable margin over the ~$1.30–1.80
  marginal cost of a moderate user, while staying the cheapest serious product
  in the category — Voicenotes ~$9.99/mo, AudioPen ~$75/yr, Otter ~$17/mo.)
- Annual tier $49.99 alongside monthly (same subscription group, so upgrade/
  downgrade is Apple-managed). $4.99 × 12 = $59.88, so $49.99 is the clean
  "2 months free" anchor; nets ~$3.54/mo-equivalent.
- Accounts created before the 1.2.0 cutoff are **grandfathered free forever**
  (TestFlight testers gave us free QA; also the demo account must never hit a
  paywall mid-review).
- The app itself stays **Free** in ASC pricing. The $4.99 is an auto-renewable
  subscription product. Do not touch the app price tier.

## The one architectural rule

**Entitlement is decided server-side, always.** The client asks Apple/RevenueCat
to buy; the API decides what a user may do. The app never tells the backend it
is premium — the backend hears it from RevenueCat's webhook and from nothing
else. Client-side gating exists only as UX (show the paywall before a doomed
request), never as enforcement.

## What lapsing must NOT break (product rules, easy to violate)

1. **Armed reminders keep firing.** Reminders fire from the device
   (`timeReminderSync.ts`, `arrivalLedger.ts`) precisely so they work with no
   network. A lapsed subscription must not reap geofences or cancel scheduled
   notifications — "say it once, it's handled" is a promise already made for
   those notes. Gate the *creation* of new notes, never the delivery of old
   ones. Concretely: `noteLifecycle` re-syncs and the trigger sync jobs run
   regardless of entitlement.
2. **Reading your own data stays free.** A lapsed user can still open the app,
   list/search notes and places, mark done, delete, and delete their account.
   Their data is theirs. (Also the posture Apple review likes to see.)
3. **Deleting the account deletes the RevenueCat customer** (`accountService`
   addition) — same completeness promise as the Weaviate purge.

## Gated vs. open (server-side)

| Gated (requireEntitlement) | Open (auth only) |
|---|---|
| `POST /voice/*` (deepgram-token, transcribe-audio, save-transcript) | `GET /objects`, `GET /objects/:id` |
| `POST /rag/*` (search stays debatable — gate `spar`, leave `search` open) | object state changes, deletes (noteLifecycle paths) |
| `POST /conversations/*` (threads, resume) | `GET/DELETE` places & geofences (delete must work to keep OS sync honest) |
| `POST /synthesis/*` triggers | `GET /dashboard`, `GET /synthesis` (reading past digests) |
| `POST /geofences` (new places) | push token registration, diagnostics |

Background jobs (weekly digest, monthly synthesis, importance, retention):
skip generation for `entitlement = 'none'` users, run for everyone else
including grandfathered. Embedding retry runs for all (their data, our
consistency).

## Phase A — ASC + RevenueCat setup (manual, do first, has lead time)

- [ ] Paid Applications Agreement: Business → Agreements, Tax, and Banking.
      Bank + tax forms. **Start immediately — multi-day lead time, nothing
      ships without it.**
- [ ] Small Business Program enrollment (15% instead of 30%).
- [ ] Subscription group `Offload Pro`, products:
      `offload_pro_monthly` $4.99 w/ 14-day free Introductory Offer,
      `offload_pro_annual` $49.99. They sit in "Ready to Submit" — attach to
      the 1.2.0 version, **not** 1.1.0.
- [ ] Localized subscription display name/description (shows in the system
      purchase sheet).
- [ ] RevenueCat project: iOS app w/ bundle id `com.talailima.offload`, App
      Store Connect API key, entitlement `pro` mapped to both products.
      `app_user_id` = our `hub.users.id` UUID (never email).
- [ ] RevenueCat webhook → `POST /api/v1/webhooks/revenuecat` with an
      `Authorization` header secret (env: `REVENUECAT_WEBHOOK_SECRET`).

## Phase B — Backend

**Migration `024_entitlements.sql`** (new-style SQL dir, per CLAUDE.md):
```sql
ALTER TABLE hub.users
  ADD COLUMN entitlement text NOT NULL DEFAULT 'none'
    CHECK (entitlement IN ('none','trialing','active','grandfathered')),
  ADD COLUMN entitlement_expires_at timestamptz NULL,
  ADD COLUMN revenuecat_customer_id text NULL;
-- Grandfather everyone who existed before the paywall shipped.
UPDATE hub.users SET entitlement = 'grandfathered';
```
The `UPDATE` grandfathers at migration time — anyone registered after deploy
starts at `'none'` and gets `trialing` via their first purchase event. The demo
account is covered automatically (it predates the migration); assert that in
the pre-submission checklist anyway.

**`services/entitlementService.ts`** — header comment explaining the
server-side-only rule and the lapse-must-not-break-reminders rule (repo
convention: the *why* and the failure mode). Exposes:
- `isEntitled(user)`: `grandfathered` → true; `trialing`/`active` → true if
  `entitlement_expires_at` is null or in the future (small grace skew, +24h,
  so a webhook delay never locks out a paying user);
- `applyWebhookEvent(event)`: idempotent upsert keyed on RevenueCat event id
  (store processed ids in `hub.revenuecat_events(event_id pk, received_at)` —
  RevenueCat retries webhooks, and a re-delivered EXPIRATION after a
  RENEWAL must not regress state; apply by event *timestamp*, not arrival
  order).

**`routes/webhooks.ts`** — verify the shared secret, 200 fast, log every
event type. Map: `INITIAL_PURCHASE` (trial start) → `trialing`;
`RENEWAL`/`UNCANCELLATION`/`PRODUCT_CHANGE` → `active`; `CANCELLATION` →
no state change (auto-renew off, still entitled until expiry);
`EXPIRATION`/`BILLING_ISSUE` past grace → `none`. Always write
`entitlement_expires_at` from the event's expiry.

**`auth/requireEntitlement.ts`** middleware — after auth, `isEntitled` else
`403 { error: 'ENTITLEMENT_REQUIRED' }` (distinct code the client maps to the
paywall; not 401, which the client treats as sign-out). Apply per the table
above in `index.ts`.

**Tests**: webhook idempotency + out-of-order delivery; grace skew; the
gated/open route split; grandfathered bypass. Target the existing jest suite.

## Phase C — Mobile (native change → new EAS build required)

- `react-native-purchases` (RevenueCat SDK). Config-plugin install; this alone
  makes 1.2.0 a **build**, not an OTA.
- `services/purchases.ts`: configure at app start with the RC public key;
  `logIn(userId)` after auth, `logOut()` on sign-out (before SecureStore
  clear); expose `getOfferings`, `purchase`, `restore`.
- **PaywallScreen** (Deep Lagoon tokens; coral stays record-only):
  Guideline 3.1.2 requirements — product title, price *per period*, trial
  terms ("14 days free, then $4.99/month"), auto-renew disclosure, links to
  Privacy + Terms (useoffload.app/privacy, /terms), and a **Restore
  Purchases** button (its absence is a stock rejection).
- Central handling in `apiService`: `ENTITLEMENT_REQUIRED` → emit a bus event
  → root navigator presents PaywallScreen. No per-screen handling.
- Post-purchase: RC confirms → webhook updates server → client refetches
  `GET /auth/me` (add `entitlement` to its payload) and retries. Optimistic
  unlock on RC success is fine *as UX*; server remains the authority.
- Settings: "Manage subscription" → `Linking.openURL` to Apple's manage page;
  show current state incl. "Free forever — early supporter" for grandfathered.
- Registration flow for new users: paywall with trial CTA after onboarding,
  before first recording ("Start free" = start the trial). Skippable browse-
  only mode is acceptable v1 polish, not required.

## Phase D — Verify (TestFlight = sandbox, nobody is charged)

Sandbox compresses time: the 14-day trial lasts minutes — that's the feature,
use it to test the full lifecycle in one sitting.
- [ ] New sandbox account: trial starts, gated routes open, banner shows trial.
- [ ] Let sandbox trial lapse → `EXPIRATION` webhook → gated routes 403 →
      paywall appears; **existing armed reminder still fires** (the rule above,
      verified on device, not inferred).
- [ ] Restore Purchases on a reinstall.
- [ ] Cancel mid-trial → still entitled until expiry, then lapses.
- [ ] Grandfathered account (any pre-migration account) sees no paywall
      anywhere; demo account included.
- [ ] Delete account with an active sandbox sub → RC customer deleted.
- [ ] Version bump to 1.2.0 changes `runtimeVersion` → confirm OTA channels
      target the new runtime after release; 1.1.0 OTAs no longer apply.

## Phase E — Ship

1. Backend PRs first (migration + webhook + middleware are inert until the
   app sends purchases; grandfathering-by-default means deploying early is
   safe for existing users **but flips new signups to 'none'** — so deploy the
   *enforcement* (`requireEntitlement` wiring) only alongside the app that can
   pay, or every fresh install between backend deploy and app release is
   locked out. Migration early = fine; middleware wiring = last.
2. `eas build --profile production --platform ios`, TestFlight, run Phase D.
3. Submit 1.2.0 **with both subscription products attached** (their first
   review rides the binary). Review notes: sandbox steps + the demo account is
   grandfathered so the reviewer sees the full product; add a paragraph on how
   to see the paywall (fresh signup).
4. Release. Site pricing section (frontend/web) gains a pricing blurb —
   marketing only, no product features (PR #40 rule).

## Open questions (decide before Phase C is finished)

- Does `rag/search` stay open or gate with `spar`? (Plan says open; cheap and
  it sells the product.)
- Fair-use ceiling on transcription minutes: decide *before* launch whether
  "unlimited" is promised. A quota column is cheap now, a retrofit is not.
- Hold 1.1.0's manual release and launch paid-only as 1.2.0, or release 1.1.0
  free briefly? (Current lean: hold; avoid the $0 anchor.)
