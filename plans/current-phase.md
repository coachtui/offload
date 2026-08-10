# Current Phase: Phase 7 — Cross-Domain Synthesis

## Phase Overview
**Phase**: 7 (Cross-Domain Synthesis & AI Insights)
**Status**: 🔄 Up Next
**Previous Phase**: 5 & 6 (Semantic Intelligence + Geofencing) - ✅ Complete
**Current Date**: 2026-08-09
**Last Updated**: 2026-08-09

## Executive Summary

🎉 **Major Achievement**: Phase 5 and Phase 6 are **COMPLETE**! All backend services, mobile screens, infrastructure, and integration have been implemented and tested successfully.

**What's Working**:
- ✅ All backend services implemented and tested (2,500+ LOC)
- ✅ All mobile screens and hooks implemented (3,600+ LOC)
- ✅ Weaviate Cloud configured and connected
- ✅ Embeddings generated for test data (8 objects in 3.9s)
- ✅ Semantic search fully functional with relevance scoring
- ✅ AI sparring (RAG) operational with source citations
- ✅ Navigation added for Search and AI Query screens
- ✅ Geofencing with privacy controls fully implemented
- ✅ Bug fixes: entities.map error resolved
- ✅ Test data generation script created

**Latest Changes (2026-01-26)**:
- ✅ Fixed vectorService entities.map bug with Array.isArray check
- ✅ Added navigation buttons to HomeScreen (Search, AI Query, Geofences)
- ✅ Successfully generated 8 embeddings in Weaviate Cloud
- ✅ Created test data script for easy object generation
- ✅ Verified end-to-end semantic search pipeline
- ✅ **NEW**: Migrated storage from MinIO to AWS S3 for Railway deployment
- ✅ **NEW**: Updated storageService.ts to support both MinIO (local) and S3 (production)
- ✅ **NEW**: Created comprehensive Railway deployment guide with GitHub integration
- ✅ **NEW**: S3 bucket `brain-dump-api` created and tested successfully

---

## Phase 5 Status: Semantic Intelligence (100% Complete) ✅

### ✅ COMPLETED: Backend Implementation (100%)

#### 1. Atomic Object Parser ✅ COMPLETE
**Status**: Fully implemented and operational

**What Was Built**:
- ✅ ML service with GPT-4/Claude integration ([mlService.ts](backend/api/src/services/mlService.ts))
- ✅ Transcript parsing with category classification
- ✅ Multi-label categorization (Business, Personal, Fitness, Health, Family)
- ✅ Entity extraction (people, places, tasks, dates)
- ✅ Sentiment analysis (positive, neutral, negative)
- ✅ Urgency detection (low, medium, high)
- ✅ Automatic tag generation
- ✅ Integration with voice session service ([voiceSessionService.ts:183-226](backend/api/src/services/voiceSessionService.ts#L183-L226))

**Test Results**:
- ✅ Processing time: ~2-3 seconds per transcript
- ✅ Category accuracy: High (based on GPT-4/Claude quality)
- ✅ Error handling: Graceful fallback when ML service unavailable

**Files Created**:
- `backend/api/src/services/mlService.ts` - ML service client (137 LOC)
- `backend/ml-service/app/` - Python ML service with FastAPI
- Integration in `voiceSessionService.ts`

---

#### 2. Vector Embeddings ✅ COMPLETE
**Status**: Fully implemented, ready to use

**What Was Built**:
- ✅ Embedding generation service ([vectorService.ts](backend/api/src/services/vectorService.ts)) (334 LOC)
- ✅ OpenAI text-embedding-3-small integration
- ✅ Weaviate storage with complete schema
- ✅ Batch embedding generation script ([generate-embeddings.ts](backend/api/src/scripts/generate-embeddings.ts))
- ✅ Automatic embedding on object creation
- ✅ Embedding updates when content changes
- ✅ Rate limiting and error handling

**Features**:
- ✅ Embeddings generated for all new atomic objects
- ✅ Weaviate schema auto-initialized on startup
- ✅ Batch script processes existing objects (100 objects/minute)
- ✅ Skips objects that already have embeddings
- ✅ Detailed progress logging

**Files Created**:
- `backend/api/src/services/vectorService.ts` - Vector operations
- `backend/api/src/db/weaviate.ts` - Weaviate client and schema
- `backend/api/src/scripts/generate-embeddings.ts` - Batch processing

**NPM Script**:
```bash
npm run generate-embeddings
```

---

#### 3. Semantic Search ✅ COMPLETE
**Status**: Fully implemented with multiple search modes

**What Was Built**:
- ✅ Semantic search endpoint ([routes/search.ts](backend/api/src/routes/search.ts))
- ✅ Hybrid search (semantic + keyword)
- ✅ Similarity search (find related objects)
- ✅ Advanced filtering:
  - Category filtering (multi-select)
  - Date range filtering
  - Urgency level filtering
  - Search score thresholds
- ✅ Search result ranking with relevance scores
- ✅ Context-aware boosting

**API Endpoints**:
- ✅ `POST /api/v1/search/semantic` - Natural language search
- ✅ `POST /api/v1/search/hybrid` - Combined semantic + keyword
- ✅ `POST /api/v1/search/similar/:id` - Find similar objects

**Performance**:
- ✅ Search latency: ~300-500ms
- ✅ Relevance scoring working
- ✅ Filter combinations tested

**Files Created**:
- `backend/api/src/routes/search.ts` - Search endpoints
- Search logic in `vectorService.ts`

---

#### 4. RAG Implementation ✅ COMPLETE
**Status**: Fully operational with conversation history

**What Was Built**:
- ✅ RAG service with GPT-4/Claude integration ([ragService.ts](backend/api/src/services/ragService.ts)) (302 LOC)
- ✅ Context retrieval using semantic search
- ✅ AI-powered Q&A with source citations
- ✅ Conversation history support (last 5 messages)
- ✅ Contradiction detection
- ✅ Confidence scoring
- ✅ Multiple LLM support (OpenAI GPT-4 or Anthropic Claude)

**API Endpoints**:
- ✅ `POST /api/v1/ai/query` - RAG query with conversation history
- ✅ `POST /api/v1/ai/check-contradictions` - Detect conflicting information

**Features**:
- ✅ Retrieves top 5-10 relevant objects as context
- ✅ Formats context for LLM prompt
- ✅ Returns answers with numbered source citations [1], [2], etc.
- ✅ Includes source content, relevance, and object IDs
- ✅ Maintains conversation history for follow-ups

**Performance**:
- ✅ Response time: ~2-3 seconds
- ✅ Context retrieval working
- ✅ Source citations accurate

**Files Created**:
- `backend/api/src/services/ragService.ts` - RAG logic
- `backend/api/src/routes/ai.ts` - AI endpoints

---

#### 5. Relationship Detection ✅ COMPLETE
**Status**: Fully implemented

**What Was Built**:
- ✅ Relationship service ([relationshipService.ts](backend/api/src/services/relationshipService.ts))
- ✅ Entity relationship tracking in database
- ✅ Vector similarity for finding related objects
- ✅ Relationship types: mentions, references, contradicts, similar_to
- ✅ Knowledge graph structure in PostgreSQL

**API Endpoints**:
- ✅ `GET /api/v1/objects/:id/related` - Get related objects (via vectorService.findSimilar)

**Features**:
- ✅ Automatic relationship detection via vector similarity
- ✅ Relationship storage in hub.relationships table
- ✅ Entity extraction and linking

**Files Created**:
- `backend/api/src/services/relationshipService.ts` - Relationship logic
- `backend/api/src/models/Relationship.ts` - Relationship model
- Database schema includes relationships table

---

### ✅ COMPLETED: Mobile UI Implementation (100%)

#### Search Screen ✅ COMPLETE
**File**: [mobile/src/screens/SearchScreen.tsx](mobile/src/screens/SearchScreen.tsx)

**Features**:
- ✅ Real-time debounced search (300ms delay)
- ✅ Category filter chips with multi-select
- ✅ Search results with relevance scores (displayed as percentages)
- ✅ Result cards showing:
  - Category badges with color coding
  - Content preview (3 lines)
  - Tags display
  - Creation date
  - Search match score
- ✅ Empty states (no query, no results, loading, error)
- ✅ Error handling with retry button
- ✅ Navigation to ObjectDetail screen
- ✅ Clear button to reset search

**Custom Hook**: [mobile/src/hooks/useSearch.ts](mobile/src/hooks/useSearch.ts)
- ✅ `search(query, options)` - Semantic search
- ✅ `findSimilar(objectId, limit)` - Find related objects
- ✅ `clearResults()` - Reset state
- ✅ API integration with error handling

---

#### AI Query Screen ✅ COMPLETE
**File**: [mobile/src/screens/AIQueryScreen.tsx](mobile/src/screens/AIQueryScreen.tsx)

**Features**:
- ✅ Chat-style interface with message bubbles
- ✅ User messages (blue, right-aligned)
- ✅ AI responses (white, left-aligned)
- ✅ Source citations with expandable sources:
  - Number references [1], [2], etc.
  - Source content preview
  - Relevance percentage
  - Tap to view original object
- ✅ Example questions for first-time users
- ✅ Clear conversation button
- ✅ Auto-scroll to latest message
- ✅ Multi-line text input with max length
- ✅ Loading indicator ("Thinking...")
- ✅ Error banner with clear error messages
- ✅ Conversation history maintained

**Custom Hook**: [mobile/src/hooks/useAI.ts](mobile/src/hooks/useAI.ts)
- ✅ `askQuestion(question)` - Query with RAG
- ✅ `checkContradictions(statement)` - Detect conflicts
- ✅ `clearConversation()` - Reset chat
- ✅ Conversation history (last 5 messages for context)
- ✅ API integration with source parsing

---

#### Navigation Updates ✅ COMPLETE
**File**: [mobile/src/navigation/AppNavigator.tsx](mobile/src/navigation/AppNavigator.tsx)

**Changes**:
- ✅ SearchScreen integrated into MainStack
- ✅ AIQueryScreen integrated into MainStack
- ✅ Both screens accessible after authentication
- ✅ Proper navigation flow

---

### ✅ COMPLETED: Integration & Testing

#### End-to-End Flow ✅ TESTED
1. ✅ User records voice → transcribed via WebSocket
2. ✅ Transcript sent to ML service for parsing
3. ✅ ML service returns categorized atomic objects
4. ✅ Objects stored in PostgreSQL
5. ✅ Embeddings generated via OpenAI
6. ✅ Embeddings stored in Weaviate (when configured)
7. ✅ Objects searchable via semantic search
8. ✅ Objects queryable via AI sparring

#### Performance Benchmarks ✅ MET
- ✅ Parsing latency: ~2-3 seconds per transcript (target: <5s)
- ✅ Embedding generation: ~0.5s per object (target: <1s)
- ✅ Semantic search: ~300-500ms (target: <1s)
- ✅ RAG response: ~2-3s (target: <3s)

---

### ✅ COMPLETED TASKS (100%)

#### Task 1: Weaviate Cloud Setup ✅ COMPLETE

**What Was Done**:
1. ✅ Configured Weaviate Cloud cluster
2. ✅ Added credentials to backend/api/.env
3. ✅ Verified connection (health check shows "connected")
4. ✅ Schema auto-initialized on startup

**Weaviate Configuration**:
```env
WEAVIATE_URL=https://yz8gqbvuqbac4gwndhi83q.c0.us-west3.gcp.weaviate.cloud
WEAVIATE_API_KEY=<configured>
```

**Status**: ✅ Fully operational

---

#### Task 2: Generate Embeddings ✅ COMPLETE

**What Was Done**:
1. ✅ Fixed entities.map bug in vectorService.ts with Array.isArray check
2. ✅ Created 8 test atomic objects via API
3. ✅ Ran embedding generation script successfully
4. ✅ Verified all embeddings in Weaviate Cloud

**Actual Results**:
```
🎉 Embedding generation complete!
📊 Summary:
   Total objects: 8
   ✅ Successfully generated: 8
   ⏭️  Skipped (already exists): 0
   ❌ Failed: 0
   ⏱️  Total time: 3.9s
   ⚡ Average time per object: 0.49s
```

**Test Objects Created**:
- 3 Fitness objects (gym, bench press, running)
- 2 Business objects (meeting, report)
- 1 Personal object (mountain trip)
- 1 Family object (call mom)
- 1 Health object (doctor appointment)

**Status**: ✅ All embeddings generated and searchable

---

#### Task 3: Mobile Navigation ✅ COMPLETE

**What Was Done**:
1. ✅ Added Search button to HomeScreen
2. ✅ Added AI Query button to HomeScreen
3. ✅ Added Geofences button to HomeScreen
4. ✅ All screens properly wired in navigation

**Files Modified**:
- `mobile/src/screens/HomeScreen.tsx` - Added 3 new navigation cards

**Status**: ✅ All Phase 5/6 features accessible from home

---

## Phase 6 Status: Geofencing (100% Complete)

### ✅ COMPLETED: All Features Implemented

#### Core Geofencing ✅ COMPLETE
**Files**:
- [geofenceService.ts](backend/api/src/services/geofenceService.ts) - Backend service
- [GeofencesScreen.tsx](mobile/src/screens/GeofencesScreen.tsx) - List screen
- [CreateGeofenceScreen.tsx](mobile/src/screens/CreateGeofenceScreen.tsx) - Creation UI

**Features**:
- ✅ Geofence CRUD operations (Create, Read, Update, Delete)
- ✅ Location permission handling (privacy-first)
- ✅ OS-level geofence monitoring:
  - iOS: CoreLocation with CLCircularRegion
  - Android: Geofencing API with PendingIntent
- ✅ Local notifications on entry/exit
- ✅ Active/inactive geofence toggle
- ✅ Radius configuration (50m to 500m)

**Mobile Screens**:
- ✅ Geofences list with map preview
- ✅ Create geofence with address search
- ✅ Privacy dashboard showing permission status
- ✅ Edit and delete functionality

**Privacy Features**:
- ✅ Location permission prompts with explanations
- ✅ Privacy dashboard showing what's tracked
- ✅ Clear permission request flow
- ✅ Optional location services

**Testing Status**:
- ✅ Backend API tested and working
- ✅ Mobile UI tested on real device
- ✅ OS-level geofence triggers verified on device

**Phase 6 Polish (completed 2026-04-04)**:
- ✅ Edit Geofence screen (`EditGeofenceScreen.tsx`) — edit name, type, radius, notifications
- ✅ Quiet hours UI on both Create and Edit screens — preset time chips, wires to backend
- ⚠️ "Delete All Location Data" — **this claim is wrong** (found 2026-08-09). No such
  feature exists anywhere in `mobile/src` or `backend/api/src`; whatever was built here
  did not survive. Account-wide deletion is now covered by Settings → Delete account,
  and per-place deletion by EditGeofenceScreen.

**Documentation**:
- ✅ [PHASE_6_QUICKSTART.md](PHASE_6_QUICKSTART.md) - Setup guide
- ✅ [PHASE_6_HANDOFF.md](PHASE_6_HANDOFF.md) - Implementation details

---

## Production Deployment Status

### ✅ Railway Production Environment

**Deployment Method**: GitHub Integration (Auto-deploy on push)

**API Service**: https://brain-dump-production-895b.up.railway.app
- ✅ Deployed and running
- ✅ PostgreSQL database connected
- ✅ Database migrations complete
- ✅ Authentication working
- ✅ WebSocket connections operational
- ✅ Voice recording sessions saving successfully
- ✅ **AWS S3 storage configured and operational**

**ML Service**:
- ✅ Deployed and running
- ✅ Health check passing
- ✅ Connected to API service
- ✅ GPT-4 integration for transcript parsing

**Mobile App**:
- ✅ Configured with production URL
- ✅ End-to-end flow working:
  - Register → Login → Record → View Sessions
- ✅ WebSocket streaming functional
- ✅ All Phase 5/6 features accessible

### ✅ Storage Infrastructure (AWS S3)

**Configuration**:
- **Provider**: AWS S3
- **Bucket**: `brain-dump-api`
- **Region**: `us-east-1`
- **Endpoint**: `s3.amazonaws.com`
- **Status**: ✅ Tested and operational

**Features**:
- ✅ Automatic environment detection (S3 vs MinIO)
- ✅ Smart endpoint parsing
- ✅ Presigned URLs for secure audio access
- ✅ Bucket auto-creation on first connection
- ✅ Compatible with Minio client library

**Cost**: ~$1-5/month (first 5GB free for 12 months)

**Files Updated**:
- `backend/api/src/services/storageService.ts` - S3/MinIO abstraction
- `.env.example` - S3 configuration examples
- `RAILWAY_DEPLOYMENT.md` - Complete deployment guide

**Storage Configuration**:
- ✅ **AWS S3**: Configured and operational
  - Bucket: `brain-dump-api` (US East 1)
  - Storage service auto-detects S3 vs MinIO
  - Smart endpoint parsing for both environments
  - Audio files stored securely with presigned URLs
- ✅ **Local Development**: Docker MinIO support maintained
- ✅ **Automatic Deployment**: GitHub → Railway integration active

**Weaviate Vector Database**:
- ✅ Self-hosted on Railway as Docker service (`semitechnologies/weaviate:1.24.0`)
- ✅ Internal networking via `http://weaviate.railway.internal:8080`
- ✅ Anonymous access (no API key needed — internal only)
- ✅ Persistent volume mounted at `/var/lib/weaviate`
- ✅ Semantic search fully operational in production
- No expiry (replaces 14-day Weaviate Cloud sandbox)

**Known Limitations in Production**:
- ⚠️ Real-time transcription optional (Whisper requires audio processing)

---

## Documentation Status

### ✅ Comprehensive Documentation

**Phase 5 Documentation**:
- ✅ [PHASE5_SETUP.md](PHASE5_SETUP.md) (440 lines)
  - Weaviate Cloud setup instructions
  - Batch embedding script guide
  - Testing procedures
  - Troubleshooting guide
  - Cost estimates
- ✅ [PHASE5_IMPLEMENTATION_SUMMARY.md](PHASE5_IMPLEMENTATION_SUMMARY.md)
  - Backend implementation overview
  - Mobile UI features
  - Integration points
  - Testing checklist

**Phase 6 Documentation**:
- ✅ [PHASE_6_QUICKSTART.md](PHASE_6_QUICKSTART.md) (290 lines)
- ✅ [PHASE_6_HANDOFF.md](PHASE_6_HANDOFF.md) (150+ lines)

**General Documentation**:
- ✅ [plans/handoff.md](plans/handoff.md) - Current project status and deployment guide
- ✅ [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- ✅ [README.md](README.md) - Project overview

---

## Testing Checklist

### ✅ Backend Testing (Ready to Test)
- [ ] Semantic search with filters
- [ ] RAG query with conversation history
- [ ] Contradiction detection
- [ ] Similarity search
- [ ] Hybrid search
- [ ] Batch embedding generation
- [ ] Voice → ML → Embedding flow

**How to Test**:
```bash
# Get authentication token
TOKEN=$(curl -X POST https://brain-dump-production-895b.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@example.com","password":"your-password"}' \
  | jq -r '.token')

# Test semantic search
curl -X POST https://brain-dump-production-895b.up.railway.app/api/v1/search/semantic \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "workout plans", "limit": 5}'

# Test AI query
curl -X POST https://brain-dump-production-895b.up.railway.app/api/v1/ai/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "What workout plans do I have?"}'
```

### ✅ Mobile Testing (Ready to Test)
- [ ] Open SearchScreen and search for objects
- [ ] Test category filtering
- [ ] Test AIQueryScreen with example questions
- [ ] Verify source citations work
- [ ] Test conversation history
- [ ] Test error handling

**Test Flow**:
1. Open mobile app
2. Navigate to SearchScreen (via tab bar or menu)
3. Type "workout" in search bar
4. Verify results appear with relevance scores
5. Tap category filters
6. Navigate to AIQueryScreen
7. Tap an example question or type your own
8. Verify AI response with sources
9. Tap a source to view original object

### ✅ Infrastructure (Complete)
- ✅ Weaviate self-hosted on Railway (no expiry)
- ✅ Semantic search operational in production
- ✅ New recordings auto-embed on save

---

## Next Steps: Phase 7 — Cross-Domain Synthesis

### What Phase 7 Builds
Weekly agentic workflow that finds patterns across domains (business, personal, fitness, health) and surfaces insights the user wouldn't notice manually.

### Deliverables
1. **Pattern Analysis Agent** — weekly cron job, cross-domain semantic similarity search
2. **Insight Generation** — LLM finds "semantic bridges" between domains, generates actionable digest
3. **Constraint Checking** — detects contradictions (e.g. new gym plan vs injury history)
4. **Insight Storage & Delivery** — insights stored as special atomic objects, push notification digest

---

## Cost Estimate (Monthly)

### Infrastructure Costs
- **Railway**: ~$15-25/month
  - API service: ~$5-10
  - ML service: ~$5-10
  - PostgreSQL: Included in plan
- **Weaviate**: $0/month
  - Self-hosted on Railway (Docker service, no expiry)
- **OpenAI API**: ~$3-5/month
  - Embeddings: ~$2/month (1000 objects)
  - GPT-4 for RAG: ~$1.50/month (100 queries)

**Total Monthly Cost**: ~$18-30/month (development)

---

## Phase Completion Criteria

### Phase 5: Semantic Intelligence ✅ 100% Complete

**Functional Requirements**:
- ✅ Transcripts automatically parsed into atomic objects
- ✅ Categories assigned with high accuracy (GPT-4/Claude quality)
- ✅ Semantic search returns relevant results
- ✅ RAG provides helpful answers with sources
- ✅ System detects relationships via vector similarity
- ✅ Weaviate self-hosted on Railway, operational in production

**Performance Requirements**:
- ✅ Parsing latency: ~2-3s (target: <5s)
- ✅ Embedding generation: ~0.5s (target: <1s)
- ✅ Semantic search: ~300-500ms (target: <1s)
- ✅ RAG response: ~2-3s (target: <3s)

**User Experience**:
- ✅ Search UI intuitive and fast
- ✅ AI query interface conversational
- ✅ Related objects discoverable
- ✅ Categories consistent

### Phase 6: Geofencing ✅ 100% Complete

**Functional Requirements**:
- ✅ Geofence CRUD operations
- ✅ Location permission handling
- ✅ OS-level geofence monitoring (iOS + Android)
- ✅ Local notifications on entry/exit
- ✅ Privacy controls

**User Experience**:
- ✅ Geofence management UI
- ✅ Edit geofence screen (name, type, radius, notifications)
- ✅ Quiet hours UI (preset time chips, both create and edit)
- ✅ Privacy dashboard + Delete All (fully deletes from server)
- ✅ Real device testing complete

---

## Known Issues & Technical Debt

### High Priority
0. 🔧 **Geofence arming gap: brand-new place + immediately-killed app** (2026-08-08; **fix implemented 2026-08-09, PR #34 — dormant until next EAS build**)
   - Registering a region with iOS requires running JS. If the user records a note, kills the app within ~35s (before the post-save syncs), and drives straight to the *newly created* place without reopening, the region is never armed. (Existing, already-registered places are unaffected — iOS monitors them independently of app life; practical exposure is small, which is why this was downgraded from its original High framing.)
   - **Implemented**: backend sends a content-available silent push only when `resolveObjectPlaces` actually created a region; a guarded background `TaskManager` task runs `syncGeofencesWithOS('silent-push')` on wake; the cold-start tap handler now runs `handleSessionProcessed` too (live via OTA `b17e6a43` immediately); `UIBackgroundModes` declared explicitly as `["location", "remote-notification"]`.
   - **Remaining step**: the `remote-notification` entitlement is a native capability — the silent-push half activates on the **next EAS build** (App Store prep will force one anyway). No dedicated build needed; everything is inert-but-harmless until then.

1. ⚠️ **TypeScript Strict Mode Disabled**
   - Build command has `|| true` to bypass type errors
   - Need to fix type safety issues
   - Location: `backend/api/package.json`

### Medium Priority
2a. ⚠️ **No client-side enforcement of iOS's 20-region geofence cap** (2026-08-08, risk reduced 2026-08-09)
   - `syncRegions()` hands the OS every enabled geofence; past 20, iOS silently rejects the excess (`monitoringDidFailForRegion`). Growth risk, not a current failure.
   - **Risk sharply reduced by reap-on-resolve (2026-08-09)**: dead inferred geofences now free their slot when the last open note closes, so the set no longer grows monotonically. Enforcement (prioritize open-note regions, then nearest) still unimplemented. iOS's cap is 20 in both the legacy CLRegion API and the modern CLMonitor API; Android's is 100 — iOS is the binding constraint.
   - 3-geofences-per-place resolution is **intended product behavior** (nearest branches of a named store) — do not "fix" it. As of Aug 9, notes also *link* to every same-name branch (PR #33), which is what makes the fan-out actually deliver.
   - Related data issue: concurrent place resolution can create byte-identical coordinate duplicates (three pairs observed in prod logs 2026-08-08, "Hawaii State Federal Credit Union"). Wants a dedup pass + unique constraint on (user, rounded lat/lng).

2b. ✅ **No user-facing way to delete a geofence** — RESOLVED 2026-08-09
   - `deleteGeofence` existed in `api.ts` and `useGeofences` but no screen called it. Now wired into `EditGeofenceScreen` ("Delete this place", behind a ConfirmSheet), reachable via Places → place → Edit reminder settings.
   - On success it navigates to `Places` rather than `goBack()` — going back would land on the place's summary screen, which would then be rendering a geofence that no longer exists.

2c. ⚠️ **Quiet-hours/radius customized on an INFERRED geofence are lost if it's reaped** (2026-08-09, accepted trade-off)
   - Re-arm recreates with defaults (150m, no quiet hours). If it ever matters: persist quiet hours on the place row, or skip reaping customized geofences. Manual geofences unaffected.

2. ⚠️ **TypeScript Strict Mode Disabled**
   - Build command has `|| true` to bypass type errors

3. ⚠️ **Full-Text Search Filter Not Implemented**
   - TODO in `search.ts:159`
   - Feature: Hybrid search with full-text PostgreSQL search
   - Current: Semantic search working, keyword search basic

### Low Priority
0. ⚠️ **EAS Update channel must match the installed build's profile**
   - `eas update --branch <name>` only reaches devices whose installed build's `channel` (set per build profile in `eas.json`) points at that same branch
   - Discovered 2026-08-06: fix was published to `production` but the test device was running a `preview`-profile internal build, so the OTA silently never landed
   - Before publishing, check which profile/channel the target device is actually on (`eas build:list --limit 5`) rather than assuming `production`
4. ⚠️ **Audio Storage Disabled on Railway**
   - MinIO not configured in production
   - Audio files not stored long-term
   - Transcripts still saved in database

5. ⚠️ **Real-Time Transcription Disabled on Railway**
   - Whisper requires audio files (which require MinIO)
   - Not blocking core functionality
   - Can be added later if needed

---

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│ Mobile App (React Native + Expo)           │
│ ✅ SearchScreen (semantic search)           │
│ ✅ AIQueryScreen (RAG chat)                 │
│ ✅ GeofencesScreen (location-based)         │
│ ✅ RecordScreen (voice recording)           │
└──────────────┬──────────────────────────────┘
               │ HTTPS / WebSocket
               ▼
┌─────────────────────────────────────────────┐
│ Node.js API Service (Railway)              │
│ ✅ Search routes (/search/semantic)         │
│ ✅ AI routes (/ai/query)                    │
│ ✅ Voice routes (WebSocket)                 │
│ ✅ Geofence routes                          │
└──────┬──────────────┬───────────────────────┘
       │              │
       │              ▼
       │     ┌─────────────────────┐
       │     │ Python ML Service   │
       │     │ ✅ Transcript parser │
       │     │ ✅ GPT-4/Claude LLM  │
       │     └─────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ Data Layer                                  │
│ ✅ PostgreSQL (Railway)                     │
│    - Users, sessions, objects, geofences    │
│ ⏳ Weaviate Cloud (needs setup)             │
│    - Vector embeddings, semantic search     │
│ ✅ OpenAI API                               │
│    - Embeddings (text-embedding-3-small)    │
│    - RAG (GPT-4 Turbo)                      │
└─────────────────────────────────────────────┘
```

---

## Quick Reference Commands

### Backend Development
```bash
# Start API locally
cd backend/api
npm run dev

# Run migrations
npm run migrate

# Generate embeddings (after Weaviate setup)
npm run generate-embeddings

# Run tests
npm test
```

### Mobile Development
```bash
# Start Expo
cd mobile
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

### Railway Deployment
```bash
# Link to Railway project
railway link

# View logs
railway logs

# Run command on Railway
railway run npm run generate-embeddings

# Open Railway dashboard
railway open
```

### Testing
```bash
# Test health endpoint
curl https://brain-dump-production-895b.up.railway.app/health

# Test registration
curl -X POST https://brain-dump-production-895b.up.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test semantic search (requires auth token)
curl -X POST https://brain-dump-production-895b.up.railway.app/api/v1/search/semantic \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "workout plans", "limit": 5}'
```

---

## Summary: What's Next?

### Today (30 minutes total)
1. ✅ **Set up Weaviate Cloud** (15 min)
   - Create account and free cluster
   - Add credentials to .env and Railway
2. ✅ **Run embedding script** (10-30 min)
   - Generate embeddings for existing objects
   - Verify Weaviate storage
3. ✅ **Test semantic search** (5 min)
   - Test API endpoints
   - Test mobile UI

### This Week (Testing & Polish)
1. **End-to-End Testing**
   - Voice recording → ML parsing → Embeddings → Search
   - AI sparring with real questions
   - Geofence triggers on real devices
2. **Bug Fixes**
   - Fix any issues found during testing
   - Polish UI based on user experience
3. **Performance Optimization**
   - Monitor API response times
   - Optimize database queries if needed

### Next Phase: Phase 7 (Future Enhancements)
1. **Geofence-Object Linking**
   - Show relevant objects when entering locations
   - Context-aware notifications
2. **Advanced Features**
   - Weekly AI summaries
   - Smart notifications
   - Background relationship detection
3. **Production Readiness**
   - Add monitoring and logging
   - Implement rate limiting
   - Add error tracking (Sentry)
   - Set up CI/CD pipeline

---

**Phase Status**: 🎉 100% COMPLETE - All Features Operational
**Completed**: 2026-01-26 14:00 PST
**Next Phase**: Phase 7 (Geofence-Object Linking) or Production Hardening
**Last Updated**: 2026-01-26

---

## Session Summary (2026-01-26)

### 🎯 Objectives Completed
1. ✅ Configure Weaviate Cloud for vector storage
2. ✅ Fix embedding generation bugs
3. ✅ Create test data with embeddings
4. ✅ Add navigation for Phase 5/6 features
5. ✅ Verify end-to-end semantic search pipeline

### 🔧 Technical Changes
- **Fixed**: `entities.map` error in vectorService.ts with Array.isArray safety check
- **Added**: Navigation buttons to HomeScreen (Search, AI Query, Geofences)
- **Created**: Test data generation script (`create-test-data.sh`)
- **Generated**: 8 embeddings in Weaviate Cloud (3.9s, 100% success rate)
- **Verified**: Semantic search and AI sparring fully functional

### 📊 Test Results
```
Weaviate Objects: 8/8 (100%)
Embedding Speed: 0.49s per object
Categories: Fitness (3), Business (2), Personal (1), Family (1), Health (1)
Search: ✅ Working with relevance scoring
AI RAG: ✅ Working with source citations
```

### 🚀 Ready to Use
- **Semantic Search**: Search for "gym", "meeting", "mom birthday"
- **AI Sparring**: Ask "What are my fitness goals?" "What do I need this week?"
- **Atomic Objects**: Browse all 8 test objects with filters
- **Geofences**: Create location-based reminders

### 📝 Next Steps
- **Option A**: Start Phase 7 - Geofence-Object Linking
- **Option B**: Production Hardening (TypeScript fixes, monitoring, CI/CD)
- **Option C**: Create more test data and user testing

---

## Session Update (2026-01-26 Evening) - Railway + S3 Deployment

### 🎯 Objectives Completed
1. ✅ Migrate storage from MinIO to AWS S3 for Railway compatibility
2. ✅ Update storage service to support both MinIO (local) and S3 (production)
3. ✅ Create comprehensive Railway deployment guide
4. ✅ Test S3 connection and verify bucket creation
5. ✅ Push changes to GitHub for automatic Railway deployment

### 🔧 Technical Implementation

#### Storage Service Migration
**File**: `backend/api/src/services/storageService.ts`

**Changes Made**:
- Replaced `MINIO_*` environment variables with `S3_*` variables
- Added smart endpoint parser to handle both:
  - `http://localhost:9000` (MinIO)
  - `s3.amazonaws.com` (AWS S3)
  - `https://s3.us-west-2.amazonaws.com` (Regional S3)
- Automatic protocol detection (HTTP vs HTTPS)
- Automatic port detection (9000 for MinIO, 443 for S3)
- Regional support via `S3_REGION` variable

**Key Features**:
```typescript
const parseEndpoint = (endpoint: string) => {
  const url = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`);
  return {
    endPoint: url.hostname,
    port: url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80),
    useSSL: url.protocol === 'https:',
  };
};
```

#### AWS S3 Setup
- ✅ Created S3 bucket: `brain-dump-api` in `us-east-1`
- ✅ Configured IAM user with S3 access
- ✅ Generated access keys for Railway
- ✅ Tested connection successfully
- ✅ Verified bucket creation and listing

**Test Results**:
```
🔍 Testing S3 connection...
Endpoint: s3.amazonaws.com
Port: 443
SSL: true
Bucket: brain-dump-api

📡 Connecting to S3...
✅ Connection successful!
✅ Bucket created successfully!
🎉 S3 is ready for Railway deployment!
```

#### Railway Deployment Guide
**File**: `RAILWAY_DEPLOYMENT.md`

**Updates**:
- Added GitHub integration as primary deployment method
- Included complete AWS S3 setup instructions:
  - S3 bucket creation
  - IAM user setup
  - Access key generation
  - Custom IAM policy for security
- Added cost breakdown (~$20-35/month Railway + $1-5/month S3)
- Included troubleshooting section
- Added production checklist

#### Environment Configuration
**Files Updated**:
- `.env.example` - S3 configuration examples
- `backend/api/.env.example` - S3 configuration examples
- Both `.env` files updated (not committed - in .gitignore)

**Configuration Format**:
```env
# For local development with Docker MinIO:
# S3_ENDPOINT=http://localhost:9000
# S3_ACCESS_KEY=minioadmin
# S3_SECRET_KEY=minioadmin123
# S3_BUCKET=thehub-dev
# S3_REGION=us-east-1

# For Railway/Production with AWS S3 (ACTIVE):
S3_ENDPOINT=s3.amazonaws.com
S3_ACCESS_KEY=<your-aws-access-key>
S3_SECRET_KEY=<your-aws-secret-key>
S3_BUCKET=brain-dump-api
S3_REGION=us-east-1
```

### 📊 Deployment Status

**GitHub**:
- ✅ Committed: "feat: Configure AWS S3 storage for Railway deployment"
- ✅ Pushed to: `main` branch
- ✅ Commit hash: `b12e605`

**Railway**:
- ⏳ Automatic deployment triggered
- 📋 Environment variables ready to configure:
  - `S3_ENDPOINT=s3.amazonaws.com`
  - `S3_ACCESS_KEY=<key>`
  - `S3_SECRET_KEY=<secret>`
  - `S3_BUCKET=brain-dump-api`
  - `S3_REGION=us-east-1`

### 🎉 Benefits

1. **Production-Ready Storage**
   - No more "MinIO not available" warnings
   - Audio files stored reliably in S3
   - Scalable and cost-effective

2. **Seamless Development**
   - Local dev can use MinIO or S3
   - Production automatically uses S3
   - Same codebase, different configs

3. **Automatic Deployments**
   - Push to GitHub → Railway deploys
   - No manual CLI commands needed
   - Built-in CI/CD

4. **Professional Infrastructure**
   - Managed PostgreSQL
   - AWS S3 storage
   - SSL/HTTPS included
   - Cost-effective (~$25-30/month total)

### 📚 Documentation Updates

**Files Updated**:
1. `HANDOFF.md` - Added production deployment section
2. `plans/current-phase.md` - Added S3 configuration details
3. `RAILWAY_DEPLOYMENT.md` - Complete deployment guide
4. `.env.example` files - S3 configuration examples

### 🚀 Next Deployment Steps

1. **Configure Railway Environment Variables**:
   - Add S3 credentials to Railway dashboard
   - Verify deployment succeeds
   - Test storage service health

2. **Verify Production**:
   - Test audio upload/download
   - Verify S3 bucket access
   - Check Railway logs for "MinIO not available" (should be gone)

3. **Complete Weaviate Setup** (Optional - 15 min):
   - Add Weaviate Cloud credentials to Railway
   - Run embedding generation script
   - Enable semantic search in production

### 🔗 Related Links
- AWS S3 Console: https://console.aws.amazon.com/s3
- Railway Dashboard: https://railway.app/dashboard
- GitHub Repo: https://github.com/coachtui/brain-dump
- Deployment Guide: [RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md)

---

**Session Complete**: 2026-01-26 16:30 PST
**Status**: ✅ S3 configured, tested, and deployed to GitHub
**Next**: Add S3 credentials to Railway dashboard

---

## Session Update (2026-08-06) - Home Screen Bug Fix, OTA Channel Fix & Brand App Icon

### 🎯 Objectives Completed
1. ✅ Fixed home screen bug: completed notes stayed visible in "For you right now"
2. ✅ Diagnosed and fixed an EAS Update channel mismatch that was silently blocking OTA updates
3. ✅ Replaced the default Expo app icon with the brand mark; shipped a new build

### 🔧 Technical Changes

#### Bug: completed notes not disappearing from home
**File**: `mobile/src/hooks/useForYou.ts:98`

- Root cause: "Mark Done" sets `state: 'resolved'` ([ObjectsScreen.tsx](mobile/src/screens/ObjectsScreen.tsx)), which is a separate, unlinked state from `'archived'`. The home page's "For you right now" list only filtered out `state === 'archived'`, so resolved notes kept showing up.
- Fix: filter now excludes both `'archived'` and `'resolved'`.
- Archiving remains a distinct manual action (used for dormant ideas in `SynthesisScreen.tsx`) — completing a note does not archive it, it just now also hides it from the home feed.

#### OTA updates not reaching the test device
- Diagnosed: the installed build on the test iPhone is from the `preview` build profile (internal distribution), which checks the `preview` **channel** — not `production`. `eas update --branch production` was correctly publishing, it just never reached that device.
- Verified via `eas build:list` and `eas channel:view`.
- Fix: published the update to both `production` and `preview` branches. Logged as a known gotcha (see Known Issues, Low Priority #0) — always confirm the target device's channel with `eas build:list` before assuming `production`.

#### Brand app icon
- Replaced `mobile/assets/icon.png` and `mobile/assets/adaptive-icon.png` (previously default Expo placeholder icons) with the brand mark, rasterized at 1024×1024 from `frontend/web/app/icon.svg` (teal `#0F6B5F`, same mark used as the live web favicon).
- Updated `android.adaptiveIcon.backgroundColor` in `app.json` to `#0F6B5F` to match.
- Icon changes are compiled into the native binary and can't ship via OTA — kicked off a new `eas build --profile preview --platform all` and installed it on device.

### 📦 Commits
- `4e44445` — fix(mobile): hide resolved notes from home page
- `1c6afa0` — feat(mobile): use brand mark as app icon

### 🚀 Deployed
- EAS Update published to `production` and `preview` channels (runtime `1.1.0`)
- New `preview`-profile build (iOS + Android) built and installed, carrying both the fix and the new icon

---

**Session Complete**: 2026-08-06
**Status**: ✅ Home screen bug fixed, OTA channel mismatch resolved, brand icon shipped
**Next**: Continue Phase 7 planning (Cross-Domain Synthesis) or further mobile polish

---

## Session Update (2026-08-08) — App Store Privacy Hardening & Arrival-Reminder Regression Fix

### 🎯 Objectives Completed
1. ✅ Audited and hardened the iOS permission/privacy implementation for App Store submission (PR #28)
2. ✅ Diagnosed why arrival reminders went silent (root cause was NOT the region cap) and fixed it (PRs #29/#30)
3. ✅ Deployed both: Railway backend (`433f3a9`) + EAS OTA update to `preview` (group `0ed302c9`)

### 🔒 PR #28 — Privacy copy & submission config (strings/config/docs only, no logic)
- The "Always" consent sheet claimed *"Your location is never stored or sent anywhere"* — false on three counts (recordings persist coordinates, place resolution queries Nominatim with a coordinate-derived viewbox, arrivals POST a place id). Rewritten to the true, scoped claim: on-device region monitoring, no continuous tracking, no location history. All `locationService` explanation strings fixed too (they render in `CreateGeofenceScreen`).
- Plain-language iOS purpose strings; `NSAllowsArbitraryLoads` removed (all prod endpoints are TLS; localhost exception retained).
- **`UIBackgroundModes: location` must stay**: expo-location's `EXGeofencingTaskConsumer.m:74` sets `allowsBackgroundLocationUpdates = YES` unconditionally, and iOS throws without the declaration. Recorded in `docs/IOS_LOCATION_PRIVACY.md` so nobody "cleans it up".
- New `docs/APP_STORE_REVIEW_NOTES.md`: paste-ready reviewer notes with a deterministic verification path + pre-submission checklist (demo account placeholders `<<…>>` still need filling; Privacy Nutrition Label must declare Precise Location linked to user; Nominatim belongs in the privacy policy).
- Assurance copy capped at 3 lines: `AppSheet` is `maxHeight: 85%` with **no ScrollView** — longer copy pushed the consent CTA off-screen on 667pt devices.

### 🐛 PRs #29/#30 — Arrival reminders silent on a locked phone
**Symptom (Tui, field-tested twice)**: gym reminder fired only when opening the app (foreground proximity check), never in the background — even with Always granted and the region toggles on.

**Root cause** (proven via Railway HTTP logs — region wakes produced **zero** `/notify` and **zero** `/auth/refresh` calls):
- Auth tokens were keychain-stored with SecureStore's default `WHEN_UNLOCKED` accessibility. iOS wakes the app at a region boundary with the phone locked in a pocket → both token reads fail → `fetchPlaceNotify` returns `null` **before any network request**.
- Commit `2880a52` (Aug 6, "strictly gate arrival notifications on open notes") removed the generic fallback ping that used to fire in exactly this case. Pre-`2880a52`, users got "📍 You're at X" from the fallback — that's why it "used to work". Post-`2880a52`: total silence.
- Investigation dead-ends worth remembering: it was **not** the 20-region cap (~10 regions), **not** a permission gap (Always granted), and **not** my initial arming-gap theory for this case (regions re-register whenever RecordScreen mounts, via `useGeofences.fetchGeofences → syncMonitoring`).

**Fix** (keeps `2880a52`'s no-noteless-pings guarantee):
1. All token writes go through one helper with `keychainAccessible: AFTER_FIRST_UNLOCK`; `ApiService.init()` migrates existing tokens on launch. Primary notify path (note titles, backend cooldown, open-note gating) now works from a locked phone.
2. `listGeofences` returns `openObjectCount` per geofence (both link paths — manual join table, inferred place links — same "open" definition as the notify payloads; 4 new tests). Both client sync paths snapshot it into `geofence_regions.json`; `syncRegions` persists metadata even when the region set is geometrically unchanged so the snapshot can't go stale.
3. When `/notify` still can't answer (cold Railway past the 8s budget, no signal), the task notifies from the snapshot — real place name, last-known count — and stays silent when the snapshot shows nothing. All failure branches now log loudly.

### 📦 Merged (note the stacking hiccup)
- PR #28 → main (`f7a61fe`); PR #29 merged into its stacked base by mistake (base branch wasn't deleted, so no auto-retarget); PR #30 landed the identical commit on main (`433f3a9`). Main verified to contain everything.

### 🚀 Deployed
- Railway backend: `433f3a9`, SUCCESS at 18:03 UTC
- EAS Update → `preview` channel (runtime 1.1.0, group `0ed302c9`); `production` channel deliberately NOT updated until the field test passes

### ⏭️ Awaiting: Tui's field test
Protocol: open app once (~10s, OTA applies + auto-reloads), force-quit, reopen (token migration + region re-sync), then arrive at a place with an open note, phone locked, app closed. Full notification = primary path; "a note is waiting" = snapshot fallback (still success); silence = check the 1h backend cooldown first, then Console.app filtered `GeofenceMonitoring`.

### 📋 Known gaps logged (see Known Issues)
- **High #0**: arming gap — brand-new place + immediately-killed app never registers its region (fix: silent `content-available` push)
- **Medium #2a**: no 20-region cap enforcement (growth risk); coordinate-duplicate places from concurrent resolution want a dedup + unique constraint

---

**Session Complete**: 2026-08-08
**Status**: ✅ Privacy hardening + arrival-reminder fix merged and deployed; field test pending
**Next**: Read Tui's test result → then the silent-push arming fix, App Store demo-account seeding, or Phase 7

---

## Session Update (2026-08-09) — Geofence Budget Self-Cleaning (Reap/Re-arm) & the Chain-Branch Linking Bug

### 🎯 Objectives Completed
1. ✅ Mapped the real geofence/notification limits (answered "are we capped at 20 places?")
2. ✅ Built reap-on-resolve: inferred geofences are deleted when their last open note closes, freeing the budget (PR #32)
3. ✅ Ran a high-effort multi-agent review over the diff; fixed 9 of 10 verified findings before merge
4. ✅ Diagnosed a failed field test live from Railway logs → found and fixed a pre-existing chain-linking bug (PR #33)
5. ✅ **Field test PASSED**: arrival notifications at 2 different Foodland branches + the manual Home geofence, no phantom pings

### 📐 The limits, as actually verified
- iOS caps an app at **20 monitored regions** — same limit in legacy CLRegion and modern CLMonitor APIs; Android allows 100. iOS is the binding constraint, but its *behavioral* quirks (spurious ENTER on re-registration, no ENTER when already inside, ~10s locked wake window) matter more day-to-day than the count.
- Our own caps: `MAX_INFERRED_GEOFENCES = 15` (inferred only; manual uncapped), 3-branch fan-out per chain name, 0.45 confidence gate, 150m radius, 1h server cooldown + 30min device arrival ledger.
- **The bug this session existed to fix**: geofences outlived their notes. `countInferredGeofences` counted rows forever, so 15 ÷ 3 branches ≈ **5 place-notes permanently exhausted the budget**, after which geofence creation silently stopped (`GEOFENCE_LIMIT_REACHED`, invisible to the user).

### 🔧 PR #32 — Reap on resolve, re-arm on return
- **Reap** (`GeofenceModel.deleteEmptyInferred`): one DELETE removing inferred geofences with no open note via either link path (`object_place_links`, `geofence_objects`). "Open" matches `listGeofences`' open_count exactly — snoozed/dismissed notes keep their region. `created_by = 'manual'` is untouchable. Runs awaited on resolve/archive, delete, bulk delete, decision review, place done/unlink.
- **Re-arm**: places that lost their region get it back — when a new note lands (dedupe branches), on note reopen, and via `rearmStrandedInferredGeofences` after every reap (self-heals the READ COMMITTED reap-vs-link race without cross-query locking; also backfills places the cap had blocked once slots free).
- **Pure-shrink sync rule** (`syncRegions`): when regions are only *removed*, update metadata + persisted file but skip `startGeofencingAsync` — iOS answers re-registration with a spurious ENTER for every currently-inside region (phantom "you've arrived" from the couch). A dead OS region is provably silent: missing persisted metadata → backend notify 404 → snapshot openCount 0 → nothing. OS set converges on the next add/change.
- **`noteLifecycle.ts`** centralizes note mutations + region re-sync on mobile — screens must not call `apiService.updateObjectState/deleteObject/reviewDecision/bulkDeleteObjects` directly (the decision-review and bulk-delete paths were missed exactly that way pre-centralization).
- Review outcome: 19-agent workflow review, 10 verified findings → 9 fixed, 1 no-change-needed (awaited reap latency: bounded indexed queries, and responding before the reap commits would let the client re-register a dying region). Reap SQL predicates pinned by `geofenceDeleteEmptyInferred.test.ts` since service tests mock the model.

### 🐛 PR #33 — The failed field test and the real bug (pre-existing, not the reap)
**Symptom**: Foodland note, drove there, total silence — background AND foreground — though the place row existed.
**Diagnosis from Railway logs**: the note deduped by name onto place `9acd376d` (geofence `bad841d1`) — the *newest* same-name place — while Tui spent the whole visit inside geofence `1e717741` (place `c43d18a1`, **0 linked objects**). Every path was *correctly* silent: the region he was inside held no notes. Root cause: `matchPlaceName` returns a single best match (right for manual geofences, its original job); the inferred dedupe reused it, so only the FIRST note about a chain got the multi-branch fan-out — every later note linked to one arbitrary branch.
**Fix**: dedupe now links the note to **every** name-matching place (each re-armed), and if no matched branch is within 10km of where the note was recorded, falls through to the geocoder so the local branch gets covered (step-3 proximity dedupe prevents duplicates). Backend-only; no OTA needed.

### ✅ Field test result (same day, after delete + re-record)
- Deleting the old note → **first production reap** (log: `GEOFENCE_REAPED … bad841d1`)
- Re-record → note linked to all 3 Foodland branch places, **re-arm rebuilt all 3 regions** (they'd been reaped); device synced the new set 7s later
- Drive → **fired at 2 different Foodland branches**; arriving home → **manual geofence with waiting note fired normally** (manual path confirmed unaffected)
- No phantom pings after closing notes (pure-shrink rule holding)

### 🚀 Deployed
- Railway backend: PR #32 (`b52dd6b`) + PR #33 (`0795106`), both SUCCESS
- EAS Update → `preview` (runtime 1.1.0, group `484d5e56`) — carries pure-shrink sync + `noteLifecycle`; PR #33 needed no OTA
- Production channel still not updated (consistent with the Aug 8 hold)

### 📋 Known Issues updated
- Medium #2a (20-region cap): risk sharply reduced — budget is now self-cleaning; enforcement still unimplemented
- New Medium #2b: `deleteGeofence` exists but no screen calls it
- New Medium #2c (accepted): inferred-geofence quiet-hours/radius customizations are lost on reap
- Possible future nicety: per-note cross-branch cooldown (a chain note currently pings at each branch passed on one errand — Tui likes it for now)

---

### 🔕 Addendum (same day) — Silent-push arming implemented (PR #34)
After the field test passed, the silent-push arming fix for High #0 was implemented with a strict do-not-disrupt constraint: zero arrival-path changes, push invisible on all builds, triggered sync idempotent. Backend gates the push on "a region was actually created"; mobile adds a guarded background notification task + the missing `handleSessionProcessed` call in the cold-start tap path (that part is live now via OTA `b17e6a43`). The silent-push half is **dormant until the next EAS build** carries the `remote-notification` background mode — fold into App Store prep, no dedicated build needed. 338 tests green.

---

**Session Complete**: 2026-08-09
**Status**: ✅ Reap/re-arm/multi-link merged, deployed, and field-validated end-to-end; silent-push arming implemented (dormant until next build)
**Next**: next EAS build activates silent-push arming (fold into App Store prep) → region-cap enforcement + coordinate dedup, demo-account seeding, or Phase 7

---

## Session Update (2026-08-09, later) — App Store Submission Blockers

### 🎯 Why this session happened
Audited the app against Apple's actual requirements rather than our own
self-assessment, prompted by the question of whether the marketing site should
show an App Store badge or collect a waitlist. It found a **guaranteed
rejection** we had not logged anywhere.

### 🚫 The blocker: no in-app account deletion (Guideline 5.1.1(v))
Apple has required since June 2022 that any app supporting account creation let
the user delete that account **from inside the app**. Offload had:
- no Settings or Profile screen at all,
- no users route and no delete endpoint (`auth.ts` was register/login/refresh/me),
- a privacy policy directing users to *email support* — the exact pattern Apple
  names and rejects.

### ✅ What was built
- **`services/accountService.ts` + `DELETE /api/v1/auth/account`.** Password is
  re-confirmed (no undo). Postgres is the source of truth and every user-scoped
  table cascades from `hub.users`, so the row delete is what makes the account
  gone; it runs *first* so the 204 is honest. Weaviate embeddings and S3 audio
  are purged afterwards, **best-effort** — a downed Weaviate must not trap a user
  in an account they asked to leave. Orphans are logged as `ORPHANED_EMBEDDINGS` /
  `ORPHANED_AUDIO` with ids, recoverable from Railway logs.
- **Wrong password returns 403, not 401.** A 401 would have entered the client's
  silent-refresh path, retried, then force-signed-out the user for mistyping
  their own password. Also added `ApiError` (status + server `error` code) to
  `mobile/services/api.ts` so callers branch on codes, not display copy.
- **`SettingsScreen`** (avatar → Settings; it previously opened logout directly)
  and **`DeleteAccountScreen`**. Deletion is a full screen, not a sheet:
  `AppSheet` is capped at 85% height with no ScrollView, so password field +
  keyboard + consequences copy would push the CTA off-screen — the same trap the
  Always-location consent sheet hit in the Aug 8 session.
- **`AuthContext.deleteAccount`** runs the identical teardown as sign-out
  (geofence regions, onboarding flags, tokens) — but only *after* the server
  confirms, so a failure leaves the session intact to retry.
- **Privacy policy**: OpenStreetMap Nominatim disclosed (what's sent: place name
  + a coordinate-derived viewbox, no account identifier), on-device arrival
  checking stated, retention section rewritten around in-app deletion.
- **Geofence deletion wired up** (closes Known Issue 2b).

### ⚠️ `hub.user_categories` has no migration
It is the only table referenced in code (`UserCategory.ts`) that no migration
creates — so whatever exists in a given environment was made by hand and its FK
may not cascade, which would make `DELETE FROM hub.users` fail and no account
ever be deletable. `clearUserCategories()` deletes those rows first and tolerates
`42P01` (table absent). **Worth resolving properly**: either write the migration
or confirm the table is dead and drop the model.

### 🧪 Tests
13 new in `accountService.test.ts` (gating, ordering, best-effort purge,
`user_categories` guard). 351 backend tests green. Mobile typecheck clean —
the 3 remaining `tsc` errors are pre-existing on main (`api.ts` HeadersInit,
`locationService` re-export, `websocket` deviceId).

### ⏭️ Still blocking submission — needs Tui, not code
1. **Demo account** — `APP_STORE_REVIEW_NOTES.md` still has every `<<…>>`
   placeholder unfilled and its checklist unchecked. Without a seeded place +
   open note, a reviewer cannot verify the feature and the Always-location
   request gets rejected under 5.1.1.
2. **App Store screenshots** — none exist in the repo.
3. **`eas.json` `submit.production` is empty** — needs Apple ID / ASC app id / team.
4. **EAS production build** — also what finally activates the dormant
   silent-push arming from PR #34.
5. **Verify audio persistence in prod** — this doc contradicts itself (S3
   "operational" vs "audio storage disabled on Railway"). A reviewer recording a
   note and getting nothing back is a 2.1 rejection.

### 📌 Recommendation on record
TestFlight before public launch, not straight to the App Store. The decisive
reason: the silent-push arming path has **never executed on a real device** —
the App Store build would be the first one where it runs, in an app whose whole
value is a notification firing from a pocket. Field testing to date is n=1 (Tui,
one device, Oʻahu). Store reviews are permanent; TestFlight feedback is private.

---

**Session Complete**: 2026-08-09 (later)
**Status**: ✅ 5.1.1(v) account deletion shipped end-to-end; Nominatim disclosed; geofence deletion wired
**Next**: demo-account seeding + screenshots → EAS production build → TestFlight

---

## Session Update (2026-08-09, evening) — Deployment, Migration Runner, Honest Disclosures, and the Places/Notes Redesign

### 🎯 Objectives Completed
1. ✅ Deployed the App Store compliance work and **proved account deletion end to end against production** (PR #35)
2. ✅ Built the boot-time SQL migration runner that closes the outage class permanently (PR #36)
3. ✅ Rewrote the audio disclosures to match reality; `supportsTablet: false` (PR #37)
4. ✅ Seeded + verified the reviewer demo account; captured 8 App Store screenshots + 3 verification shots
5. ✅ Fixed the Place/Reminder naming and **redesigned the Places/Notes split** per Tui's product direction (PR #38)

### ✅ PR #35 deployed — account deletion proven in production
Against a throwaway account: wrong password → **403 INVALID_PASSWORD** (session
survives — a 401 would have force-signed-out the user for mistyping); correct
password → **204** (0-byte body); login afterwards → 401. Guideline 5.1.1(v) is
satisfied and *demonstrated*, not just implemented.

### ✅ PR #36 — migrations now run on boot
First production boot: `[migrate] applied 13: 000…017` in 230ms (idempotent SQL
made baselining unnecessary — the runner self-healed the 017 gap exactly as
designed). Second boot: `[migrate] schema up to date (13 already applied)`.
`hub.schema_migrations` is the tracking table; an advisory lock serialises
replicas; failure is fatal *before* the port binds, so a bad migration leaves
the previous deployment serving. `npm run build` now copies `*.sql` into
`dist/` (tsc doesn't). A test asserts every migration stays idempotent — a bare
`CREATE TABLE` now fails CI, not a deploy. 9 new tests; 360 → 362 total.

### ✅ PR #37 — audio described honestly; iPad claim dropped
The privacy policy claimed recordings were stored in S3. False **structurally**:
the only upload path (`processAudioChunk → uploadAudioChunk`) has no caller —
mobile's `sendAudioChunk` is dead code; the app transcribes via
`POST /voice/transcribe-audio` and audio is discarded. It also under-disclosed
that OpenAI receives the **raw audio** (gpt-4o-transcribe), not just transcript
text. Policy, DeleteAccountScreen consequences ("recorded audio" → "search
history"), accountService (probe storage once — no false ORPHANED_AUDIO per
session), and a Nutrition Label checklist item (declare the transcript as User
Content, NOT Audio Data) all moved together. Note: `/health`'s hardcoded
`storage: 'disabled'` is deliberate and documented — S3 has no live consumer.
`supportsTablet: false` — zero iPad handling exists in the UI; declaring
support obliged iPad screenshots and invited Guideline 4.0 review.

### ✅ Demo account + screenshots
`demo@useoffload.app` / `OffloadDemo2026!` (user `5d14b5f6…`, display name
"Sam" so the greeting doesn't read "Good afternoon, App"). Griffith Observatory
(34.1184, −118.3004, 150m, notifyOnEnter) with open note "Planetarium tickets"
linked; six varied notes; Insights generated. All review-notes placeholders
filled; provisioning runbook added. `docs/app-store/screenshots/6.9-inch/`
(8 shots, 1320×2868, Release build) + `verification/` (Settings,
Delete-account, Always-consent sheet). ⚠️ Screenshots must be retaken from the
EAS build — they predate the Place renames below.

### 🔧 PR #38 — Places manages places; Notes owns the notes
Found while walking the app on device (which also caught two wrong strings:
the Always-location sheet's confirm button said **"Enable Notifications"** while
requesting Always — now "Allow Always" — and `v1.1.0 · ·` from
`Updates.channel` being `''` not null).

Tui's design, now implemented: **Places is a home for places** (user-created or
inferred) — tapping one opens **Edit Place** (name/type/radius/notifications/
delete; delete was Known Issue 2b, now wired). **Notes owns the notes**, and
the filter sheet gains a single-select **Place** section (fed by
`/places/overview`), with a `sessionScope`-style banner "At {name} · N notes ·
Show all". An active scope swaps the list's data source to
`getGeofenceObjects`/`getPlaceObjects` (both link paths) and disables
pagination. The old "At this location" strip in Notes was dead code (nothing
passed `geofenceId` since arrival moved to PlaceSummary) and is gone.
**Arrival flow untouched**: notification taps / ProximityBanner still open
PlaceSummary; every geofence-engine file is byte-identical to `23fd1a2`.
Renames: New/Save/Edit Reminder → New/Save/Edit **Place**; "Edit reminder
settings" → "Edit place"; reviewer-script step 3 now states location simulation
happens **outside the app** (Simulator menu path verified in Xcode 26).

### ⚠️ Incidents (data, not code — both resolved)
- Production signups had been broken since Aug 6 (missing `terms_accepted_at`,
  migration 017 never applied). Found via the demo-account creation failing;
  fixed by hand, then permanently by PR #36.
- A cleanup loop mis-parsed place names and deleted the seeded Griffith
  Observatory geofence from the demo account. Note survived (objects don't
  cascade from geofences); recreated as `88921d87…` and relinked — review notes
  updated. Places created during walkthroughs were removed; demo account ends
  the day exactly: Griffith Observatory, 1 open note, reminders on.

### 🚀 Deployed
- Railway: PRs #35/#36/#37 all SUCCESS; migration runner verified live (apply
  pass + skip pass). PR #38 is mobile-JS + docs only — reaches devices with the
  next EAS build.
- Production channel still not updated (consistent hold since Aug 8).

---

**Session Complete**: 2026-08-09 (evening)
**Status**: ✅ All submission blockers deployed & proven; migrations automated; Places/Notes matches the product design
**Next**: EAS production build (activates silent-push arming + supportsTablet:false + Place renames) → retake screenshots → walk reviewer script → App Store Connect
