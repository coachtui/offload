# Offload

**Say it once. It's handled.**

Offload is a voice-first second brain for iOS. You hold a button and talk — a
rambling stream of unrelated things — and Offload splits it into separate notes,
files each one, and then gives it back to you at the moment it's actually
useful: when you walk into the store, or when the time you mentioned arrives.

Most note apps are filing cabinets. You have to remember you wrote something
down. Offload is built the other way around: the note finds you.

> *"Pick up chicken and soda from Costco, remind me to call the accountant
> Tuesday at 3, my knee's been bothering me since the run."*

One recording. Three notes. The Costco one wakes up when you park at Costco. The
accountant one fires Tuesday at 3:00 — to the second, through Focus. The knee
one is kept as context, and surfaces later if it turns into a pattern.

---

## What it does

**Talk, don't type.** Live transcription while you speak, then a
higher-accuracy pass on the saved text. One recording can hold as many unrelated
thoughts as you want.

**Notes split themselves.** Each transcript is parsed into typed atomic
objects — tasks, reminders, commitments, ideas, concerns, decisions — with
categories, people, places, and dates pulled out.

**Arrival reminders.** Mention a place and Offload geocodes it, drops a
geofence, and notifies you when you physically get there. Fires from the device,
so it works with no signal.

**Time reminders.** Natural dates in speech become real scheduled reminders,
accurate to the second, and they break through Focus and Do Not Disturb.

**Ask Offload.** Ask questions about your own notes in plain language. Answers
are grounded in what you actually said, with citations back to the source notes.

**Insights.** Recurring background synthesis looks for patterns across domains —
noticing something in your work notes that applies to your training, or a
commitment you've now made three times and never closed.

## Status

Live to external testers on TestFlight. Pending public App Store release.

Current work and detailed state: [`plans/current-phase.md`](plans/current-phase.md).

## Architecture

Four deployables:

| Component | Stack | Hosted on |
|---|---|---|
| `backend/api` | Node · TypeScript · Express | Railway |
| `backend/ml-service` | Python · FastAPI | Railway |
| `mobile` | React Native · Expo (iOS) | EAS / TestFlight |
| `frontend/web` | Next.js — marketing site only | Vercel |

Backed by PostgreSQL (relational) and Weaviate Cloud (vectors). Speech via
Deepgram (live preview) and OpenAI `gpt-4o-transcribe` (final). Parsing and
answering via GPT-4o / Claude.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pieces fit and why.

## Development

Setup, commands, and the deploy loop are in [CLAUDE.md](./CLAUDE.md) and
[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

Quick version:

```bash
# API
cd backend/api && npm install && npm run migrate && npm run dev

# ML service
cd backend/ml-service && pip install -r requirements.txt && uvicorn main:app --reload

# Mobile — needs an EAS dev build on a real device, not Expo Go
cd mobile && npm install && npm start

# Marketing site
cd frontend/web && npm install && npm run dev
```

Mobile features depend on background location, geofence monitoring, and local
notifications. None of those work correctly in Expo Go — test on a real iPhone
using an EAS internal build.

## Documentation

- [CLAUDE.md](./CLAUDE.md) — how the system works, and the rules that are easy to break
- [ARCHITECTURE.md](./ARCHITECTURE.md) — components, data model, trigger design
- [plans/current-phase.md](./plans/current-phase.md) — living project state
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — local setup
- [docs/IOS_LOCATION_PRIVACY.md](./docs/IOS_LOCATION_PRIVACY.md) — location handling and privacy posture
- [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow and conventions
- [docs/archive/](./docs/archive/) — superseded planning docs, kept for history

## Privacy

Location is used to trigger reminders you asked for, and for nothing else. The
app uses iOS region monitoring, not continuous tracking — it never streams your
position. Recorded audio is transcribed and discarded; only the text is kept.
Details in
[docs/IOS_LOCATION_PRIVACY.md](./docs/IOS_LOCATION_PRIVACY.md) and the
[privacy policy](./frontend/web/app/privacy/page.tsx).

## License

Proprietary. All rights reserved.
