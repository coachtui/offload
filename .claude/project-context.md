# Project Context: The Hub - Proactive Cognitive Inbox

## Project Overview
"The Hub" is a **Zero-Friction** brain-dump application that moves beyond passive note-taking. It's a "Proactive Second Brain" that automatically categorizes, cross-references, and surfaces information based on user context (GPS, Time, and Past Behavior).

## Current Status: Phase 4 Complete - UI & Voice Pipeline Operational

### What's Working
- ✅ **Backend API** (Node.js/TypeScript): Fully functional with authentication, CRUD operations, WebSocket support
- ✅ **Voice Processing Pipeline**: Real-time WebSocket-based audio streaming with OpenAI Whisper integration
- ✅ **Database Layer**: PostgreSQL with migrations, models for users, sessions, atomic objects, geofences
- ✅ **Vector Database**: Weaviate schema configured for semantic search
- ✅ **Mobile App** (React Native/Expo): Complete with authentication, voice recording, transcription display, session history
- ✅ **Object Storage**: MinIO integration for audio file storage
- ✅ **Real-time Features**: WebSocket for live transcription updates

### Core Features Implemented
1. **High-Fidelity Voice Intake**: Whisper-v3 for near-instant voice-to-text with streaming support
2. **User Authentication**: JWT-based auth with secure token storage
3. **Voice Sessions**: Record, stream, transcribe, and store voice sessions with audio playback
4. **Atomic Objects**: CRUD operations for categorized atomic objects
5. **Real-time Transcription**: Live streaming transcription display during recording
6. **Session History**: Browse past sessions, play audio, view transcripts

### What's Next (Phase 5+)
1. **Semantic Memory**: RAG implementation with vector search across atomic objects
2. **Atomic Object Parsing**: AI-powered splitting of transcripts into categorized atomic objects
3. **Proactive Triggers**: Geofencing-based context-aware notifications
4. **Cross-Domain Synthesis**: Weekly agentic workflow for pattern finding
5. **Zero-UI Enhancements**: Lock screen access, back-tap triggers, background listening
6. **Advanced AI Features**: Constraint checking, contradiction detection, semantic bridges

## Architecture

### Tech Stack (Implemented)
- **Backend API**: Node.js 20+ (TypeScript, Express)
- **ML Service**: Python 3.11+ (FastAPI) - skeleton ready
- **Voice Processing**: OpenAI Whisper API (streaming via WebSocket)
- **Vector Database**: Weaviate (schema initialized)
- **Relational DB**: PostgreSQL 15+ (with migrations)
- **Caching**: Redis 7+ (configured)
- **Object Storage**: MinIO (S3-compatible)
- **Mobile**: React Native with Expo SDK 54
- **Navigation**: React Navigation v6
- **Audio**: expo-audio for recording and playback

### Key Services
```
Mobile App (React Native)
  ↓ HTTPS/WSS
API Gateway (Express)
  ├─ REST API (auth, objects, geofences, sessions)
  ├─ WebSocket (/ws/voice - real-time transcription)
  └─ Services Layer
      ├─ Voice Session Service (audio streaming management)
      ├─ Transcription Service (OpenAI Whisper integration)
      ├─ Storage Service (MinIO for audio files)
      └─ Database Service (PostgreSQL queries)

Data Stores
  ├─ PostgreSQL (users, sessions, objects, geofences)
  ├─ Weaviate (vector embeddings - schema ready)
  ├─ Redis (sessions, caching)
  └─ MinIO (audio files)
```

### Data Flow: Voice Recording → Transcription
1. User taps record button in mobile app
2. App initiates WebSocket connection to `/ws/voice?token=JWT`
3. Audio chunks stream from device to backend (PCM 16-bit, 16kHz)
4. Backend buffers audio, sends to OpenAI Whisper API
5. Partial transcripts stream back via WebSocket to mobile app
6. Final transcript saved to database as session
7. Audio file uploaded to MinIO storage
8. Mobile app displays real-time transcription and allows playback

## Project Structure
```
brain_dump/
├── backend/
│   ├── api/                 # Node.js API (IMPLEMENTED)
│   │   ├── src/
│   │   │   ├── auth/        # JWT auth + middleware
│   │   │   ├── db/          # PostgreSQL + Weaviate clients
│   │   │   ├── models/      # User, Session, AtomicObject, Geofence
│   │   │   ├── routes/      # auth, objects, geofences, voice
│   │   │   ├── services/    # transcription, storage, voice sessions
│   │   │   ├── utils/       # rate limiting, audio validation
│   │   │   ├── websocket/   # voice WebSocket handler
│   │   │   └── index.ts     # Express server with WebSocket
│   │   ├── migrations/      # Database migrations
│   │   └── package.json
│   └── ml-service/          # Python ML (SKELETON ONLY)
│       ├── main.py
│       └── requirements.txt
├── mobile/                  # React Native (IMPLEMENTED)
│   ├── src/
│   │   ├── components/      # AudioPlayer
│   │   ├── context/         # AuthContext
│   │   ├── hooks/           # useVoice, useSessions, useObjects
│   │   ├── navigation/      # AppNavigator (auth-aware)
│   │   ├── screens/         # Login, Register, Home, Record, Sessions, Objects
│   │   ├── services/        # api, websocket
│   │   └── types/
│   ├── App.tsx
│   └── package.json
├── shared/
│   └── types/               # TypeScript type definitions
├── infrastructure/
│   └── docker/              # Docker Compose (PostgreSQL, Redis, Weaviate, MinIO)
├── docs/                    # API docs, development guide
└── plans/                   # Phase tracking, master plan
```

## Technical Debt & Known Issues
1. **ML Service**: Python FastAPI skeleton exists but not integrated (no atomic object parsing yet)
2. **Semantic Search**: Weaviate schema ready but no RAG implementation
3. **Geofencing**: Database models exist but no background location tracking yet
4. **Atomic Object Parsing**: Transcripts saved as-is, no AI-powered splitting/categorization
5. **Error Recovery**: WebSocket reconnection logic could be more robust
6. **Testing**: Unit tests exist but integration test coverage is minimal
7. **E2EE**: Privacy architecture designed but not implemented

## Performance Metrics (Current)
- Voice-to-Text Latency: ~2-5 seconds (OpenAI API dependent)
- WebSocket Connection: Stable with real-time streaming
- Mobile App: Smooth on iOS/Android via Expo Go
- Database: Fast queries with proper indexing

## Development Workflow
```bash
# Start infrastructure
cd infrastructure/docker
docker-compose up -d

# Start backend API
cd backend/api
npm install
npm run dev  # Port 3000

# Start mobile app
cd mobile
npm install
npm start  # Expo CLI
```

## Environment Configuration
Key environment variables (see .env.example):
- `DATABASE_URL`: PostgreSQL connection
- `WEAVIATE_URL`: Vector database
- `REDIS_URL`: Cache/sessions
- `MINIO_*`: Object storage credentials
- `OPENAI_API_KEY`: Whisper + embeddings
- `JWT_SECRET`: Auth tokens

## Next Phase Focus (Phase 5+)
The immediate priorities for continued development:
1. **Atomic Object Parser**: Integrate ML service to split transcripts
2. **RAG Implementation**: Semantic search and AI sparring
3. **Geofencing**: Background location tracking + notifications
4. **Cross-Domain Synthesis**: Weekly pattern analysis agent
5. **Advanced UI**: Lock screen widgets, back-tap triggers

## Goals
- Enable zero-friction capture of thoughts (voice, text, multimodal) ✅
- Automatically categorize and cross-reference information ⏳ (next phase)
- Surface relevant information based on context (location, time, behavior) ⏳
- Provide AI "sparring" capabilities through RAG ⏳
- Maintain privacy with end-to-end encryption ⏳

## Success Criteria (Current Phase)
- ✅ User can register and login
- ✅ User can record voice and see real-time transcription
- ✅ Audio is streamed via WebSocket to backend
- ✅ Transcription appears in real-time
- ✅ User can view past sessions and playback audio
- ✅ User can browse atomic objects (basic CRUD)
- ⏳ Atomic objects automatically extracted from transcripts (next)
- ⏳ Semantic search across objects (next)
- ⏳ Geofence-based proactive notifications (next)
