# The Hub - Architecture Document

## Executive Summary

"The Hub" is a **Proactive Cognitive Inbox** that transforms passive note-taking into an active, context-aware second brain. The system automatically categorizes, cross-references, and surfaces information based on user context (GPS, Time, and Past Behavior).

## Core Technical Pillars

### 1. High-Fidelity Voice Intake ("Atomic Dump")
- **Technology**: OpenAI Whisper-v3 (or equivalent) for near-instant voice-to-text
- **Capability**: Handles "Multimodal Rants" - single recordings containing business tasks, gym updates, and family reminders
- **Parsing Engine**: Splits transcripts into "Atomic Objects" based on context (Business vs. Personal vs. Fitness)

### 2. Semantic Memory & Knowledge Graph
- **Storage**: Vector Database (Pinecone or Weaviate) for Long-Term Memory
- **Intelligence**: RAG (Retrieval-Augmented Generation) for AI "sparring"
- **Constraint Checking**: Validates new entries against historical data (e.g., injury history vs. new gym routine)

### 3. Proactive Trigger Engine ("Active" Layer)
- **Geofencing**: Notes pinned to GPS coordinates
- **Smart Notifications**: Context-aware push notifications when entering geofences
- **Background Processing**: Continuous location monitoring with minimal battery impact

### 4. Cross-Domain Synthesis ("Insight" Layer)
- **Agentic Workflow**: Weekly pattern analysis
- **Semantic Bridges**: Finds patterns across domains (construction fleet management → personal life → gym habits)
- **Proactive Suggestions**: Applies efficiencies from one domain to another

### 5. Zero-UI Interaction
- **Lock Screen Access**: Full functionality from lock screen
- **Back-Tap Triggers**: iOS/Android gesture-based activation
- **Background Listening**: Minimizes "Time-to-Capture"

---

## Technology Stack

### Backend Services

#### Core Runtime
- **Primary**: **Node.js 20+** (TypeScript)
  - Fast async I/O for voice processing pipelines
  - Excellent ecosystem for real-time features
  - Strong support for background workers

#### Alternative Consideration
- **Python 3.11+** (FastAPI)
  - Better ML/AI library ecosystem
  - Native support for Whisper models
  - Strong vector database integrations

**Decision**: **Hybrid Approach**
- Node.js for API layer and real-time features
- Python microservice for voice processing and ML tasks
- Communication via gRPC or message queue (Redis/RabbitMQ)

### Voice Processing

#### Speech-to-Text
- **Primary**: **OpenAI Whisper-v3** (via API or local model)
  - **Local Option**: `whisper.cpp` for on-device processing (privacy)
  - **Cloud Option**: OpenAI API for higher accuracy
  - **Hybrid**: Local for quick capture, cloud for final processing

#### Real-time Processing
- **WebRTC** for streaming audio
- **Audio Chunking**: 30-second segments for low-latency feedback
- **Streaming Transcription**: Show partial results as user speaks

### Vector Database

#### Options Evaluated

1. **Pinecone**
   - ✅ Managed service, zero ops
   - ✅ Excellent performance
   - ✅ Built-in metadata filtering
   - ❌ Cost at scale
   - ❌ Vendor lock-in

2. **Weaviate**
   - ✅ Self-hostable
   - ✅ GraphQL API
   - ✅ Built-in vectorization
   - ✅ Good for knowledge graphs
   - ❌ Requires infrastructure management

3. **Qdrant**
   - ✅ Open source
   - ✅ Excellent performance
   - ✅ Self-hostable or cloud
   - ✅ Good filtering capabilities

**Decision**: **Weaviate** (Primary)
- Self-hostable for privacy
- Excellent for knowledge graphs (cross-referencing)
- Built-in vectorization reduces complexity
- Can migrate to Pinecone for scale if needed

**Fallback**: **Qdrant** for on-device/local-first option

### Frontend

#### Mobile (Primary Platform)
- **React Native** with **Expo**
  - Cross-platform (iOS + Android)
  - Excellent background task support
  - Native module access for back-tap, geofencing
  - Lock screen widgets support

#### Web Dashboard (Secondary)
- **Next.js 14** (App Router)
  - Server-side rendering for performance
  - API routes for backend integration
  - Real-time updates via WebSockets

### Location Services

#### Geofencing
- **Native APIs**:
  - iOS: CoreLocation with Region Monitoring
  - Android: Geofencing API
- **Background Processing**:
  - iOS: Background Location Updates (significant location changes)
  - Android: WorkManager for background tasks
- **Battery Optimization**:
  - Significant location change monitoring (not continuous)
  - Adaptive geofence sizes based on user patterns
  - Smart wake-up intervals

### AI/ML Services

#### Embeddings
- **OpenAI text-embedding-3-large** (or **small** for cost)
- **Alternative**: **Cohere Embed** or **Voyage AI**
- **Local Option**: **sentence-transformers** (on-device)

#### LLM for RAG
- **OpenAI GPT-4 Turbo** (primary)
- **Anthropic Claude 3.5 Sonnet** (alternative)
- **Local Option**: **Llama 3** via Ollama (privacy-sensitive queries)

#### Atomic Object Classification
- **Fine-tuned Classification Model**:
  - Business, Personal, Fitness, Health, Family, etc.
  - Multi-label classification (one dump can have multiple categories)

### Data Storage

#### Vector Database
- Weaviate (semantic memory, knowledge graph)

#### Relational Database
- **PostgreSQL 15+** (metadata, user data, geofences)
  - JSONB columns for flexible schema
  - Full-text search for hybrid search
  - TimescaleDB extension for time-series data (location history)

#### Object Storage
- **S3-compatible** (MinIO for self-hosted, AWS S3 for cloud)
  - Audio recordings (encrypted)
  - Attachments
  - Backup snapshots

#### Caching
- **Redis 7+**
  - Session management
  - Real-time notification queue
  - Geofence proximity cache
  - Rate limiting

### Message Queue
- **Redis Streams** or **RabbitMQ**
  - Voice processing pipeline
  - Background job queue
  - Event-driven architecture

### Infrastructure

#### Deployment
- **Docker** + **Docker Compose** (development)
- **Kubernetes** (production, if needed)
- **Serverless Functions** (AWS Lambda / Vercel) for edge processing

#### Monitoring
- **Prometheus** + **Grafana**
- **Sentry** for error tracking
- **Logtail** or **Datadog** for log aggregation

---

## API Schema

### Core Entities

#### Atomic Object
```typescript
interface AtomicObject {
  id: string; // UUID
  userId: string;
  content: string;
  category: Category[]; // Multi-label: ['business', 'fitness', 'personal']
  confidence: number; // Classification confidence
  source: {
    type: 'voice' | 'text' | 'import';
    recordingId?: string;
    timestamp: number;
    location?: GeoPoint;
  };
  metadata: {
    entities: Entity[]; // Extracted entities (people, places, tasks)
    sentiment: 'positive' | 'neutral' | 'negative';
    urgency: 'low' | 'medium' | 'high';
    tags: string[];
  };
  relationships: {
    relatedObjects: string[]; // IDs of related atomic objects
    contradictions: string[]; // IDs of objects that contradict this
    references: string[]; // IDs of objects this references
  };
  createdAt: Date;
  updatedAt: Date;
  vectorEmbedding?: number[]; // Stored in vector DB
}
```

#### Geofence
```typescript
interface Geofence {
  id: string;
  userId: string;
  name: string;
  center: GeoPoint;
  radius: number; // meters
  type: 'home' | 'work' | 'gym' | 'custom';
  associatedObjects: string[]; // Atomic object IDs
  notificationSettings: {
    enabled: boolean;
    onEnter: boolean;
    onExit: boolean;
    quietHours?: { start: string; end: string }; // "22:00" - "07:00"
  };
  createdAt: Date;
}
```

#### Knowledge Graph Node
```typescript
interface KnowledgeNode {
  id: string;
  type: 'entity' | 'concept' | 'pattern';
  label: string;
  properties: Record<string, any>;
  connections: {
    nodeId: string;
    relationship: string; // 'mentions', 'contradicts', 'references', 'similar_to'
    strength: number; // 0-1
  }[];
  lastSeen: Date;
  frequency: number;
}
```

### REST API Endpoints

#### Voice Intake
```
POST /api/v1/voice/start
  Body: { deviceId, location?, metadata? }
  Response: { sessionId, uploadUrl }

POST /api/v1/voice/upload
  Body: { sessionId, audioChunk: Blob }
  Response: { transcript: string, partial: boolean }

POST /api/v1/voice/complete
  Body: { sessionId }
  Response: { atomicObjects: AtomicObject[] }
```

#### Atomic Objects
```
GET /api/v1/objects
  Query: { category?, dateFrom?, dateTo?, location?, search? }
  Response: { objects: AtomicObject[], total: number }

GET /api/v1/objects/:id
  Response: { object: AtomicObject, related: AtomicObject[] }

POST /api/v1/objects
  Body: AtomicObject (without id)
  Response: { object: AtomicObject }

PUT /api/v1/objects/:id
  Body: Partial<AtomicObject>
  Response: { object: AtomicObject }

DELETE /api/v1/objects/:id
  Response: { success: boolean }
```

#### Geofencing
```
GET /api/v1/geofences
  Response: { geofences: Geofence[] }

POST /api/v1/geofences
  Body: Geofence (without id)
  Response: { geofence: Geofence }

PUT /api/v1/geofences/:id
  Body: Partial<Geofence>
  Response: { geofence: Geofence }

DELETE /api/v1/geofences/:id
  Response: { success: boolean }

POST /api/v1/geofences/check
  Body: { location: GeoPoint }
  Response: { activeGeofences: Geofence[], relevantObjects: AtomicObject[] }
```

#### RAG / AI Interaction
```
POST /api/v1/ai/query
  Body: { query: string, context?: { location?, time?, category? } }
  Response: { answer: string, sources: AtomicObject[], confidence: number }

POST /api/v1/ai/validate
  Body: { objectId: string }
  Response: { contradictions: AtomicObject[], suggestions: string[] }

POST /api/v1/ai/synthesize
  Body: { domain?: string, timeframe?: string }
  Response: { insights: Insight[], patterns: Pattern[] }
```

#### Search
```
POST /api/v1/search/semantic
  Body: { query: string, limit?: number, filters?: Filter[] }
  Response: { results: AtomicObject[], scores: number[] }

POST /api/v1/search/hybrid
  Body: { query: string, limit?: number }
  Response: { results: AtomicObject[], scores: { semantic: number, keyword: number }[] }
```

### WebSocket Events

```
Connection: wss://api.thehub.app/v1/ws
Auth: { type: 'auth', token: string }

Events:
- location_update: { location: GeoPoint, activeGeofences: Geofence[] }
- geofence_entered: { geofence: Geofence, relevantObjects: AtomicObject[] }
- transcription_update: { sessionId: string, transcript: string, partial: boolean }
- object_created: { object: AtomicObject }
- insight_ready: { insight: Insight }
```

---

## Privacy Architecture

### Encryption Strategy

#### End-to-End Encryption (E2EE)

**At Rest:**
- **Database Encryption**: PostgreSQL with `pgcrypto` extension
- **Vector Database**: Encrypted embeddings (homomorphic encryption or field-level encryption)
- **Object Storage**: Server-side encryption (SSE) + client-side encryption for sensitive data

**In Transit:**
- **TLS 1.3** for all API communications
- **Certificate Pinning** in mobile apps
- **WebSocket over WSS** for real-time features

**Client-Side Encryption:**
- **Sensitive Fields**: Encrypted before leaving device
  - Audio recordings (AES-256-GCM)
  - Personal notes (field-level encryption)
  - Location data (optional, user-configurable)
- **Key Management**:
  - User's master key derived from password (PBKDF2, 100k iterations)
  - Key stored in device keychain (iOS Keychain, Android Keystore)
  - Never transmitted to server

#### Zero-Knowledge Architecture

**Principle**: Server cannot read user data without user's key

**Implementation:**
1. **Encryption Keys**: Generated client-side, never sent to server
2. **Encrypted Blobs**: Server stores encrypted data only
3. **Searchable Encryption**: 
   - **Option A**: Encrypted search indices (order-preserving encryption)
   - **Option B**: Client-side search (download encrypted, decrypt locally)
   - **Option C**: Homomorphic encryption for vector search (experimental)

**Trade-off Decision**: 
- **Hybrid Approach**: 
  - Metadata (categories, timestamps, non-sensitive tags) stored unencrypted for search
  - Content (transcripts, notes) encrypted
  - User can opt-in to full encryption (with reduced search capabilities)

### Data Minimization

#### What We Store
- ✅ Atomic objects (encrypted content)
- ✅ Vector embeddings (for semantic search)
- ✅ Geofence definitions
- ✅ User preferences
- ✅ Location history (optional, user-configurable)

#### What We Don't Store
- ❌ Raw audio files (deleted after processing, unless user opts in)
- ❌ Passwords (only hashed)
- ❌ Encryption keys (client-side only)
- ❌ Third-party API keys (encrypted, user-managed)

### Privacy Controls

#### User Settings
```typescript
interface PrivacySettings {
  encryption: {
    level: 'standard' | 'enhanced' | 'maximum';
    encryptLocation: boolean;
    encryptMetadata: boolean;
  };
  dataRetention: {
    audioRetention: number; // days, 0 = delete immediately
    locationHistory: number; // days
    autoDeleteAfter: number; // days
  };
  sharing: {
    allowCloudSync: boolean;
    allowAnalytics: boolean;
    allowCrashReporting: boolean;
  };
  aiProcessing: {
    useLocalModels: boolean; // Prefer on-device processing
    allowCloudAI: boolean;
    anonymizeForTraining: boolean;
  };
}
```

### Compliance

#### GDPR
- Right to access
- Right to deletion
- Data portability (export in standard format)
- Consent management

#### HIPAA (if health data)
- BAA with cloud providers
- Audit logging
- Access controls

### Security Measures

#### Authentication
- **OAuth 2.0** + **PKCE** for mobile apps
- **JWT** tokens (short-lived, refresh tokens)
- **Biometric Auth** (Face ID, Touch ID, fingerprint)
- **2FA** (optional, TOTP)

#### Authorization
- **RBAC** (Role-Based Access Control)
- **Resource-level permissions**
- **API rate limiting**

#### Audit Logging
- All data access logged (who, what, when)
- Encryption key access events
- Failed authentication attempts
- Data export/deletion events

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Mobile App                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Voice Intake │  │ Geofencing   │  │ Lock Screen  │      │
│  │   Module     │  │   Module     │  │   Widget     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            │
                            │ HTTPS/WSS
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                    API Gateway (Kong/Nginx)                    │
│              Rate Limiting | Auth | Routing                    │
└───────────────────────────┬───────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
│  Node.js API   │  │ Python ML      │  │  WebSocket    │
│    Service     │  │   Service      │  │    Service    │
│                │  │                │  │                │
│ - REST API     │  │ - Whisper      │  │ - Real-time    │
│ - Auth         │  │ - Embeddings   │  │   Updates      │
│ - Business     │  │ - Classification│ │ - Notifications│
│   Logic        │  │ - RAG          │  │                │
└───────┬────────┘  └───────┬────────┘  └───────┬────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
│  PostgreSQL    │  │   Weaviate     │  │     Redis      │
│  (Metadata)    │  │  (Vectors)     │  │   (Cache/MQ)   │
└────────────────┘  └────────────────┘  └────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Object Store  │
                    │  (S3/MinIO)    │
                    └────────────────┘
```

### Data Flow: Voice Intake → Atomic Objects

```
1. User starts recording (back-tap or lock screen)
   ↓
2. Audio streamed to API (chunked, 30s segments)
   ↓
3. Python ML Service:
   - Whisper transcription (streaming)
   - Entity extraction (NER)
   - Sentiment analysis
   ↓
4. Classification Service:
   - Multi-label category classification
   - Context detection (business/personal/fitness)
   ↓
5. Atomic Object Parser:
   - Split transcript into atomic objects
   - Extract relationships
   - Check for contradictions (RAG query)
   ↓
6. Vector Embedding:
   - Generate embeddings for each atomic object
   - Store in Weaviate
   ↓
7. Knowledge Graph Update:
   - Create/update nodes
   - Establish connections
   ↓
8. Notification (if geofence match):
   - Check current location
   - Find relevant objects
   - Push notification
```

### Background Processing

#### Geofence Monitoring
```
Mobile App (Background):
  - Significant location change detected
  - Send location to API
  ↓
API Service:
  - Check geofence proximity (Redis cache)
  - Query relevant objects (vector search)
  - Queue notification
  ↓
Push Notification Service:
  - Format notification
  - Send to device
```

#### Weekly Synthesis Agent
```
Cron Job (Weekly):
  ↓
1. Query all objects from past week
   ↓
2. Generate embeddings for patterns
   ↓
3. Vector search for similar patterns across domains
   ↓
4. LLM analysis:
   - Find semantic bridges
   - Generate insights
   - Suggest optimizations
   ↓
5. Store insights
   ↓
6. Push notification to user
```

---

## Performance Requirements

### Latency Targets
- **Voice-to-Text**: < 2 seconds for first chunk
- **Atomic Object Creation**: < 5 seconds end-to-end
- **Geofence Check**: < 500ms
- **Semantic Search**: < 1 second
- **RAG Query**: < 3 seconds

### Scalability Targets
- **Concurrent Users**: 10,000+
- **Objects per User**: 100,000+
- **Vector Search QPS**: 1,000+
- **Audio Processing**: Real-time streaming

### Battery Optimization
- **Location Updates**: Significant change only (not continuous)
- **Background Processing**: Batch operations
- **Wake-up Intervals**: Adaptive based on user patterns

---

## Development Roadmap

### Phase 1: Foundation (Weeks 1-2)
- Project structure
- Tech stack setup
- Database schemas
- Basic API framework

### Phase 2: Voice Intake (Weeks 3-4)
- Whisper integration
- Streaming transcription
- Atomic object parser
- Classification model

### Phase 3: Semantic Memory (Weeks 5-6)
- Weaviate setup
- Vector embeddings
- RAG implementation
- Knowledge graph

### Phase 4: Geofencing (Weeks 7-8)
- Location services
- Geofence management
- Background processing
- Push notifications

### Phase 5: Proactive Features (Weeks 9-10)
- Trigger engine
- Cross-domain synthesis
- Weekly agent
- Insight generation

### Phase 6: Zero-UI (Weeks 11-12)
- Lock screen widgets
- Back-tap triggers
- Background listening
- Quick capture

### Phase 7: Privacy & Security (Weeks 13-14)
- E2EE implementation
- Key management
- Privacy controls
- Security audit

### Phase 8: Testing & Polish (Weeks 15-16)
- End-to-end testing
- Performance optimization
- UI/UX refinement
- Documentation

---

## Risk Mitigation

### Technical Risks
1. **Voice Processing Latency**
   - Mitigation: Hybrid local/cloud processing
   - Fallback: Progressive enhancement (show partial results)

2. **Vector Database Costs**
   - Mitigation: Start with self-hosted Weaviate
   - Optimization: Embedding compression, caching

3. **Battery Drain**
   - Mitigation: Significant location changes only
   - Optimization: Adaptive wake-up intervals

4. **Privacy Concerns**
   - Mitigation: E2EE by default
   - Transparency: Open-source core components

### Business Risks
1. **User Adoption**
   - Mitigation: Zero-friction onboarding
   - Strategy: Start with power users, iterate

2. **Data Privacy Regulations**
   - Mitigation: Privacy-first architecture
   - Compliance: GDPR, HIPAA-ready

---

## Next Steps

1. **Immediate (This Week)**:
   - Set up project structure
   - Initialize repositories
   - Configure development environment
   - Create database schemas

2. **Short-term (Next 2 Weeks)**:
   - Implement voice intake MVP
   - Set up vector database
   - Build basic API endpoints
   - Create mobile app shell

3. **Medium-term (Next Month)**:
   - Complete atomic object parsing
   - Implement RAG system
   - Build geofencing module
   - Add privacy controls

---

## Appendix

### Technology Decision Matrix

| Component | Option 1 | Option 2 | Decision | Rationale |
|-----------|----------|----------|----------|-----------|
| Backend | Node.js | Python | Hybrid | Node for API, Python for ML |
| Vector DB | Pinecone | Weaviate | Weaviate | Self-hostable, knowledge graphs |
| Mobile | React Native | Native | React Native | Cross-platform, faster dev |
| Voice | Whisper API | Local | Hybrid | Privacy + accuracy balance |

### References
- OpenAI Whisper: https://github.com/openai/whisper
- Weaviate: https://weaviate.io/
- React Native Background Tasks: https://reactnative.dev/docs/background-tasks
- iOS Geofencing: https://developer.apple.com/documentation/corelocation/clregion
- Android Geofencing: https://developer.android.com/training/location/geofencing
