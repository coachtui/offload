# Project Context: The Hub - Proactive Cognitive Inbox

## Project Overview
"The Hub" is a **Zero-Friction** brain-dump application — a "Proactive Second Brain" that automatically categorizes, cross-references, and surfaces information based on user context (GPS, time, and past behavior).

---

## Current Status (as of 2026-03-06): Phase 6 — Proactive Surfacing

### What's Working
- ✅ **Backend API** (Node.js/TypeScript on Railway): auth, CRUD, voice, RAG, search, AI routes
- ✅ **Voice Pipeline**: Mobile → Deepgram WebSocket directly (temp token from backend), then saves transcript to API
- ✅ **Atomic Object v2 Parser**: ML service parses transcripts into typed, domain-tagged atomic objects with full metadata
- ✅ **Atomic Object Schema v2**: `object_type`, `domain`, `temporal_*`, `location_*`, `is_actionable`, `next_action`, `linked_object_ids`, `sequence_index`, `embedding_status`
- ✅ **JWT Auth**: Secure sign/verify with expiry; mobile decodes client-side; 401 recovery + logout flow
- ✅ **RAG Endpoints**: `/api/v1/rag/search`, `/api/v1/rag/spar`, `/api/v1/rag/context-pack`
- ✅ **Sparring Service**: Retrieve → context pack → grounded LLM response (Claude sonnet-4-6 or GPT-4o fallback)
- ✅ **Vector Embeddings**: Auto-embedded on every object save; Weaviate Cloud; backfill script + 5-min auto-retry for `embedding_status = 'failed'` objects
- ✅ **Mobile wired to new RAG**: `SearchScreen` → `/api/v1/rag/search`, `AIQueryScreen` → `/api/v1/rag/spar`; old duplicate system deleted
- ✅ **Contradiction detection**: Post-recording, contradictions between new objects and existing ones are detected and surfaced
- ✅ **Related notes surfacing**: After recording, semantically related existing objects are shown
- ✅ **Stale actionable surfacing**: `GET /api/v1/objects/stale-actionables` — objects with `is_actionable=true`, older than 7 days, no linked resolution; shown as collapsible amber banner in ObjectsScreen
- ✅ **Geofencing**: OS-level background monitoring, CRUD, eval engine (pinned objects + ML `location_geofence_candidate`), local push notifications on entry/exit, notification tap → Objects screen
- ✅ **Mobile UI**: Auth, RecordScreen, SessionsScreen, ObjectsScreen, SearchScreen, AIQueryScreen, GeofencesScreen, CreateGeofenceScreen
- ✅ **Object Storage**: AWS S3 (`brain-dump-api` bucket)
- ✅ **Database**: PostgreSQL on Railway, migrations 001 (base) + 002 (atomic v2 schema)

### What's NOT Working / Not Yet Built
- ❌ **Audio storage**: S3 upload path exists but Deepgram flow bypasses it — audio never hits the backend. Audio is not stored. (The new WebSocket flow via Whisper would fix this — audio goes through backend.)
- ❌ **Cross-domain synthesis**: Weekly agentic workflow not implemented.
- ❌ **E2EE**: Designed, not implemented.

---

## Architecture

### Tech Stack
| Layer | Tech |
|---|---|
| Mobile | React Native (Expo SDK 54) |
| Backend API | Node.js/TypeScript (Express) on Railway |
| ML Service | Python/FastAPI (parsing transcripts → atomic objects) |
| Relational DB | PostgreSQL on Railway |
| Vector DB | Weaviate Cloud |
| Object Storage | AWS S3 (`brain-dump-api` bucket) |
| Auth | JWT (HS256, stored in SecureStore) |
| Voice STT | Deepgram (direct WebSocket from mobile, temp token from backend) |
| LLM (Sparring) | Claude claude-sonnet-4-6 (primary) or GPT-4o (fallback) |

### Voice Recording Flow
```
RecordScreen
  → useDeepgramTranscription (NOT useVoice — that hook is unused)
  → GET /api/v1/voice/deepgram-token      # backend mints temp Deepgram token
  → Mobile opens WSS to wss://api.deepgram.com
  → Streams PCM 16kHz audio via ExpoPlayAudioStream
  → stopRecording() → POST /api/v1/voice/save-transcript
  → Backend: create session → ML parse → create atomic_objects → session='completed'
```

### WebSocket Voice Flow (in progress — not yet wired into index.ts)
```
Mobile useVoice hook (excluded from commit — needs wiring)
  → wsService.connect(token)  → WSS wss://backend/ws/voice?token=JWT
  → WebSocket messages: start_session | audio_chunk (base64) | stop_session
  → voiceHandler.ts (auth + rate limiting)
  → voiceSessionService.ts: startSession → StreamingTranscriber → processAudioChunk
  → transcriptionService.ts: Whisper API (whisper-1) → TranscriptionResult
  → S3: upload chunks → merge on stop
  → ML parse → createObject → atomic_objects
  → WS response: { type: 'session_stopped', sessionId, transcript, audioUrl, objectId }
```
Key differences from current Deepgram flow:
- Audio goes through backend → S3 storage is preserved
- Transcription via OpenAI Whisper (not Deepgram WebSocket)
- Real-time partial transcripts streamed back over same WS connection
- Rate limiting: per-IP connection limit, per-message limit, per-user session limit

### RAG / Sparring Flow
```
User query (mobile or API)
  → POST /api/v1/rag/spar
  → sparringService.sparWithContext()
      → embed query → Weaviate semantic search (with filters)
      → hydrate full objects from PostgreSQL
      → buildContextPack() → structured RetrievalContextPack
      → LLM call (Claude/GPT) with grounded context
      → SparringResponse { answer, citedIds, themes, hasContradictions, gaps }
```

### Key Routes
| Route | Description |
|---|---|
| `POST /api/v1/voice/deepgram-token` | Mint temp Deepgram token |
| `POST /api/v1/voice/save-transcript` | Save session + trigger ML parse |
| `GET /api/v1/voice/sessions` | List user sessions |
| `GET /api/v1/voice/sessions/:id` | Session detail + transcript |
| `POST /api/v1/rag/search` | Semantic search with filters |
| `POST /api/v1/rag/spar` | AI sparring (retrieve + LLM) |
| `POST /api/v1/rag/context-pack` | Inspect retrieval without LLM |
| `GET/POST /api/v1/objects` | Atomic object CRUD |

---

## File Map (Key Files)

### Mobile
- `mobile/src/screens/RecordScreen.tsx` — record UI
- `mobile/src/hooks/useDeepgramTranscription.ts` — recording + Deepgram + save
- `mobile/src/services/api.ts` — HTTP client, `AuthError` class
- `mobile/src/context/AuthContext.tsx` — auth state, `handleAuthError()`
- `mobile/src/hooks/useSessions.ts` — sessions list
- `mobile/src/screens/SessionsScreen.tsx` — sessions UI
- `mobile/src/screens/ObjectsScreen.tsx` — atomic objects browser
- `mobile/src/screens/SearchScreen.tsx` — semantic search UI
- `mobile/src/screens/AIQueryScreen.tsx` — AI sparring UI
- `mobile/src/services/websocket.ts` — WS client service (unused — P1.6 skipped)

### Backend
- `backend/api/src/routes/voice.ts` — all voice endpoints
- `backend/api/src/routes/rag.ts` — RAG/sparring endpoints
- `backend/api/src/routes/objects.ts` — atomic object CRUD
- `backend/api/src/services/sparringService.ts` — RAG pipeline + LLM
- `backend/api/src/services/vectorService.ts` — Weaviate semantic search
- `backend/api/src/services/mlService.ts` — ML service client (parses transcripts)
- `backend/api/src/services/ragService.ts` — additional RAG utilities
- `backend/api/src/services/transcriptionService.ts` — OpenAI Whisper transcription (streaming + batch)
- `backend/api/src/services/voiceSessionService.ts` — in-memory active session management for WS flow
- `backend/api/src/websocket/voiceHandler.ts` — WS server handler (auth, rate limiting, message routing)
- `backend/api/src/utils/audioValidator.ts` — audio chunk validation
- `backend/api/src/utils/rateLimiter.ts` — connection/message/session rate limiters
- `backend/api/src/models/AtomicObject.ts` — AtomicObject DB model
- `backend/api/src/models/Session.ts` — Session DB model
- `backend/api/src/auth/jwt.ts` — JWT sign/verify
- `backend/api/src/auth/middleware.ts` — authenticate middleware
- `backend/api/src/jobs/embeddingRetry.ts` — auto-retry job for failed embeddings (5-min interval)
- `backend/api/src/scripts/generate-embeddings.ts` — manual backfill embeddings script
- `backend/api/db-config.ts` — pg-migrate DB config (moved from migrations/)

---

## Atomic Object v2 Schema
New columns on `hub.atomic_objects`:
- `raw_text`, `cleaned_text`, `title`
- `object_type`: task | reminder | idea | observation | question | decision | journal | reference
- `domain`: work | personal | health | family | finance | project | misc | unknown
- `temporal_has_date`, `temporal_date_text`, `temporal_urgency`
- `location_places[]`, `location_geofence_candidate`
- `is_actionable`, `next_action`
- `linked_object_ids[]`, `sequence_index`
- `embedding_status`: pending | complete | failed
- `content` kept for backward compat (set to `cleanedText` on new objects)

Embedding text: `[title, cleanedText, objectType, domain, tags].join(' ')`

---

## Environment
- Mobile `.env`: points to Railway production `https://brain-dump-production-895b.up.railway.app`
- Railway env vars needed: `JWT_SECRET`, `DATABASE_URL`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`), `WEAVIATE_*`, `AWS_*`
- `SPAR_MODEL` env var to override LLM model
- `WHISPER_MODEL` env var to override Whisper model (default: `whisper-1`)
- `EXPO_PUBLIC_WS_URL` mobile env var for WebSocket base URL (default: `ws://localhost:3000`)

---

## What's Next (Priority Order)

### ✅ P0 — Auto-Embedding on Save (DONE)
### ✅ P1 — Wire Mobile to RAG (DONE)
### ✅ P1.5 — Proactive Surfacing: Contradiction Detection + Related Notes + Stale Actionables (DONE)

### ~~P1.6~~ — WebSocket Voice Path — SKIPPED
Decided not to pursue. Deepgram direct flow works well; WS/Whisper adds complexity for marginal gain. Audio storage can be solved with a simpler presigned S3 upload if needed. Stray infrastructure files (`voiceHandler.ts`, `voiceSessionService.ts`, `transcriptionService.ts`, `websocket.ts`) remain committed but unused.

### ✅ P1.7 — ObjectsScreen Semantic Search + v2 Filters (DONE)
- Replaced category chips with domain + objectType chip rows
- Typing activates RAG hybrid mode (shows % match scores via useSearch)
- Browse mode uses domain/objectType filters against `/api/v1/objects`
- Cards show title, domain, objectType badges (v2 schema)
- Backend: `listObjects` + `findByUserId` now accept domain/objectType filters

### ✅ P2 — Geofencing + Proactive Triggers (DONE)
- OS-level background monitoring: `mobile/src/services/geofenceMonitoringService.ts` (iOS CoreLocation / Android Geofencing API — battery efficient, no continuous GPS)
- Mobile CRUD: `useGeofences.ts` hook + `GeofencesScreen.tsx` + `CreateGeofenceScreen.tsx` (map interface, radius picker, permission flow)
- Navigation: CreateGeofence registered in AppNavigator; notification taps → `Objects` screen with `geofenceId` param
- Notification tap handler wired in `App.tsx` (foreground + cold-start)
- Eval engine: `getGeofenceObjects` returns pinned `associated_objects` UNION all `location_geofence_candidate = true` user objects (ML-flagged by parser)
- `type: 'store'` mobile value mapped → `'custom'` at API layer (no migration needed)
- `ObjectsScreen` already handles `geofenceId` route param → fetches + shows relevant objects

### ✅ P3 — Embedding Retry (DONE)
- `jobs/embeddingRetry.ts`: `retryFailedEmbeddings()` queries `embedding_status = 'failed'` (batch 50), calls `storeInVector` + `updateEmbeddingStatus`
- `startEmbeddingRetryJob()` runs every 5 minutes; skips if previous run still in progress
- Wired into `index.ts` — starts automatically with the server
- Backfill script still available: `backend/api/src/scripts/generate-embeddings.ts`

### P4 — Cross-Domain Synthesis (Weekly Agent)
- Agentic workflow: scan all objects from past week
- Identify patterns, contradictions, open questions
- Generate a "weekly synthesis" session object

### P5 — Zero-UI Enhancements
- Lock screen access / back-tap trigger for recording
- Background audio capture (when permitted)
