# Offload — Project Handoff

**Last Updated:** 2026-03-08
**Repository:** https://github.com/coachtui/brain-dump
**Production API:** https://brain-dump-production-895b.up.railway.app
**Latest Commit:** fix: eager OTA update check on launch (bdedb29)

---

## Current Status: Phase 6 Complete — AI Sparring Working ✅

All core features are implemented and working end-to-end on the preview build.

---

## What's Working

| Feature | Status |
|---|---|
| Auth (register/login/JWT refresh) | ✅ |
| Voice recording (Deepgram direct WebSocket) | ✅ |
| ML transcript parsing → atomic objects | ✅ |
| Auto-embedding on save (Weaviate Cloud) | ✅ |
| Embedding retry job (5-min interval) | ✅ |
| ObjectsScreen with domain/type filters | ✅ |
| Semantic search (RAG) | ✅ |
| AI Sparring (`/api/v1/rag/spar`) | ✅ Working beautifully as of 2026-03-08 |
| Weekly Synthesis | ✅ |
| Contradiction detection | ✅ |
| Stale actionables surfacing | ✅ |
| Geofencing (background OS monitoring) | ✅ |
| Geofence → Objects linking (join table) | ✅ (migration 004) |
| Push notifications on entry/exit | ✅ |

---

## Infrastructure

| Service | Details |
|---|---|
| Backend API | Railway, auto-deploys from `main` branch, root dir `backend/api` |
| PostgreSQL | Railway managed |
| Weaviate | Cloud cluster |
| AWS S3 | `brain-dump-api` bucket |
| Mobile builds | EAS, preview channel, runtime version 1.0.0 |

### Database Connection
- **Public URL** (local migrations): `postgresql://postgres:NXUQcCsnJqrLfsCxzGSbdnVfRuluXLCu@metro.proxy.rlwy.net:57046/railway`
- **Internal URL** (Railway): `postgresql://postgres:NXUQcCsnJqrLfsCxzGSbdnVfRuluXLCu@postgres.railway.internal:5432/railway`

---

## Deployment Workflow

| Change type | Command | Notes |
|---|---|---|
| Backend only | `git push` | Railway auto-deploys; only triggers if `backend/api/` files changed |
| Mobile JS only | `cd mobile && eas update --branch preview --message "..."` | OTA, no rebuild needed |
| Mobile native/deps | `cd mobile && eas build --profile preview --platform ios` | Required for native changes |
| Both | Both above | Independent steps |

### Current Mobile Build
- Build ID: `1af667db` — commit `6a5e4c8`
- Fingerprint: `9ee0cdd` (iOS + Android match — OTA compatible)
- **TODO:** Run `eas build --profile preview --platform ios` to bake in eager `checkForUpdate()` (added to `App.tsx` in commit `bdedb29`)
- After that new build, OTA updates apply in a single relaunch

---

## Recent Fixes (2026-03-08)

1. **AI sparring app crash** — `gaps` field was `string | null` from backend but mobile typed it as `string[]` and called `.map()` on it → `TypeError` → app close. Fixed types in `SparResponse`, `AIMessage`, and renderer.
2. **fetch timeout** — `api.ts` request helper had no timeout; added `AbortController` (default 30s, 90s for `/spar`).
3. **Example question chips** — called `setInputText(question); handleSend()` but state is async → always sent empty string. Now calls `askQuestion(question)` directly.
4. **Geofence-objects join table** — migration 004, backend model/route/service, `ManageGeofenceObjectsScreen`, navigation wiring.
5. **Eager OTA update check** — `App.tsx` now calls `checkForUpdate()` on launch (non-dev only) — one relaunch instead of two once new build is installed.

---

## Environment Variables (Railway)

```
NODE_ENV=production
PORT=3000
JWT_SECRET=53f9f86337069243235c4195ad4618d104c8199255c4110b74a480b0dde5f0a9
JWT_EXPIRES_IN=7d
DEEPGRAM_API_KEY=edc2e892afa6e8d52195de15703bbd5f8b70d265
ANTHROPIC_API_KEY=(set)
OPENAI_API_KEY=(set)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
WEAVIATE_URL=(set)
WEAVIATE_API_KEY=(set)
AWS_ACCESS_KEY_ID=(set)
AWS_SECRET_ACCESS_KEY=(set)
AWS_REGION=(set)
AWS_S3_BUCKET=brain-dump-api
```

---

## Key File Map

### Mobile
- `mobile/App.tsx` — app entry, notification routing, OTA check
- `mobile/src/screens/RecordScreen.tsx` — record UI
- `mobile/src/hooks/useDeepgramTranscription.ts` — recording + Deepgram + save
- `mobile/src/services/api.ts` — HTTP client (30s default timeout, 90s for /spar)
- `mobile/src/context/AuthContext.tsx` — auth state
- `mobile/src/screens/AIQueryScreen.tsx` — AI sparring UI
- `mobile/src/hooks/useAI.ts` — AI sparring hook
- `mobile/src/screens/ObjectsScreen.tsx` — objects browser with filters
- `mobile/src/screens/GeofencesScreen.tsx` + `CreateGeofenceScreen.tsx`
- `mobile/src/screens/ManageGeofenceObjectsScreen.tsx` — link objects to geofences

### Backend
- `backend/api/src/routes/rag.ts` — `/spar`, `/search`, `/context-pack`
- `backend/api/src/services/sparringService.ts` — RAG pipeline + LLM (Claude/GPT-4o)
- `backend/api/src/services/vectorService.ts` — Weaviate semantic search
- `backend/api/src/services/mlService.ts` — transcript → atomic objects
- `backend/api/src/jobs/embeddingRetry.ts` — auto-retry failed embeddings
- `backend/api/src/routes/geofences.ts` — geofence CRUD + objects linking
- `backend/api/migrations/` — 001 base, 002 atomic v2, 003 geofences, 004 geofence-objects join

---

## What's NOT Built

- ❌ Audio storage — Deepgram flow bypasses backend; audio never hits S3
- ❌ WebSocket/Whisper voice path — scaffolded but skipped (stray files unused)
- ❌ E2EE — designed, not implemented
- ❌ Lock screen / back-tap recording (P5)

---

## Next Steps (P5 — Zero-UI Enhancements)

- Lock screen access / back-tap trigger for recording
- Background audio capture (when permitted)
- Or: production hardening (rate limiting, Sentry, CI/CD)
