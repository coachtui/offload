# Current Phase: Semantic Intelligence (Phase 5)

## Phase Overview
**Phase**: 5 of 11
**Status**: 🔄 READY TO START
**Previous Phase**: Phase 4 (User Interface) - ✅ Complete
**Dependencies**: All previous phases complete

## Phase Goal
Implement AI-powered semantic understanding features including:
- Automatic transcript parsing into categorized atomic objects
- Vector embeddings for semantic search
- RAG (Retrieval-Augmented Generation) for AI sparring
- Relationship detection and contradiction checking

## What Was Completed in Phase 4
✅ React Native mobile app with voice recording
✅ Real-time transcription display via WebSocket
✅ Session history with audio playback
✅ Basic atomic object CRUD operations
✅ Authentication and user management
✅ Complete UI for all core features

## Phase 5 Objectives

### 1. Atomic Object Parser (Priority 1) 🎯
**Goal**: Automatically split voice transcripts into categorized atomic objects

**Tasks**:
- [ ] Design atomic object parser API contract
  - Input: transcript text + metadata (timestamp, location, user context)
  - Output: array of atomic objects with categories, entities, sentiment
- [ ] Implement ML service endpoint in Python FastAPI
  - `POST /api/ml/parse-transcript`
- [ ] Build prompt engineering for LLM-based parsing
  - Use GPT-4 or Claude for splitting transcripts
  - Multi-label classification (Business, Personal, Fitness, Health, Family)
  - Entity extraction (people, places, tasks, dates)
  - Sentiment analysis (positive, neutral, negative)
  - Urgency detection (low, medium, high)
- [ ] Integrate ML service with Node.js API
  - Call ML service after transcript completion
  - Store resulting atomic objects in PostgreSQL
  - Generate embeddings for each object
- [ ] Add retry logic and error handling
- [ ] Write unit tests for parsing logic

**Files to Create/Modify**:
- `backend/ml-service/app/services/parser.py` - Core parsing logic
- `backend/ml-service/app/routes/parse.py` - API endpoint
- `backend/ml-service/app/prompts/transcript_parser.py` - LLM prompts
- `backend/api/src/services/mlService.ts` - ML service client
- `backend/api/src/services/voiceSessionService.ts` - Integration point

**Success Criteria**:
- Single transcript successfully split into multiple atomic objects
- Categories assigned with >80% accuracy
- Entities extracted correctly
- Processing time <5 seconds per transcript

---

### 2. Vector Embeddings (Priority 2) 🔢
**Goal**: Generate and store embeddings for semantic search

**Tasks**:
- [ ] Implement embedding generation service
  - Use OpenAI text-embedding-3-small (cost-effective)
  - Or text-embedding-3-large (higher quality)
- [ ] Integrate with Weaviate
  - Store embeddings alongside atomic objects
  - Update Weaviate schema if needed
- [ ] Batch embedding generation
  - Script to generate embeddings for existing objects
  - Queue-based processing for new objects
- [ ] Optimize embedding strategy
  - Cache embeddings to reduce API calls
  - Implement embedding refresh logic (when content changes)
- [ ] Add embedding service to API
  - `POST /api/v1/embeddings/generate` (admin/background use)
  - Automatic embedding on atomic object creation

**Files to Create/Modify**:
- `backend/api/src/services/embeddingService.ts` - Embedding generation
- `backend/api/src/db/weaviate.ts` - Update with embedding operations
- `backend/api/src/routes/embeddings.ts` - Embedding routes (admin)
- `backend/api/scripts/generate-embeddings.ts` - Batch processing script

**Success Criteria**:
- Embeddings generated for all atomic objects
- Weaviate stores embeddings successfully
- Batch processing script works for existing data
- Embedding generation <1 second per object

---

### 3. Semantic Search (Priority 3) 🔍
**Goal**: Enable vector similarity search across atomic objects

**Tasks**:
- [ ] Implement semantic search endpoint
  - `POST /api/v1/search/semantic`
  - Query: natural language text
  - Returns: ranked list of similar atomic objects
- [ ] Build hybrid search (semantic + keyword)
  - Combine Weaviate vector search with PostgreSQL full-text search
  - Weighted scoring (e.g., 70% semantic, 30% keyword)
- [ ] Add filtering capabilities
  - Filter by category (Business, Personal, etc.)
  - Filter by date range
  - Filter by location (if available)
  - Filter by user
- [ ] Implement search result ranking
  - Combine similarity scores
  - Boost recent results
  - Personalization based on user patterns
- [ ] Add search UI to mobile app
  - Search bar component
  - Real-time search suggestions
  - Search results display
  - Filter UI

**Files to Create/Modify**:
- `backend/api/src/routes/search.ts` - Search endpoints
- `backend/api/src/services/searchService.ts` - Search logic
- `mobile/src/screens/SearchScreen.tsx` - New search screen
- `mobile/src/hooks/useSearch.ts` - Search hook

**Success Criteria**:
- Semantic search returns relevant results
- Hybrid search outperforms pure keyword search
- Filters work correctly
- Search latency <1 second
- Mobile UI is intuitive

---

### 4. RAG Implementation (Priority 4) 🤖
**Goal**: Build AI sparring capabilities with retrieval-augmented generation

**Tasks**:
- [ ] Design RAG query flow
  - User asks question → semantic search → retrieve context → LLM generates answer
- [ ] Implement RAG endpoint
  - `POST /api/v1/ai/query`
  - Input: user question + optional context filters
  - Output: AI-generated answer + source citations
- [ ] Build context retrieval
  - Use semantic search to find relevant atomic objects
  - Rank and filter results (top 5-10 most relevant)
  - Format context for LLM prompt
- [ ] Integrate with LLM (GPT-4 or Claude)
  - Craft prompts with retrieved context
  - Include source citations in response
  - Handle conversation history for follow-up questions
- [ ] Add AI query UI to mobile app
  - Chat interface screen
  - Display answers with source links
  - Show which atomic objects were used
- [ ] Implement constraint checking
  - Example: "Check if this gym plan conflicts with my injury history"
  - Query relevant context → LLM analyzes for contradictions

**Files to Create/Modify**:
- `backend/api/src/routes/ai.ts` - AI query endpoints
- `backend/api/src/services/ragService.ts` - RAG logic
- `backend/api/src/prompts/` - Directory for LLM prompts
- `mobile/src/screens/AIQueryScreen.tsx` - Chat interface
- `mobile/src/hooks/useAI.ts` - AI query hook

**Success Criteria**:
- RAG returns accurate answers with citations
- Context retrieval includes relevant atomic objects
- Answers are helpful and coherent
- Response time <3 seconds
- Constraint checking detects contradictions

---

### 5. Relationship Detection (Priority 5) 🔗
**Goal**: Find connections between atomic objects

**Tasks**:
- [ ] Implement relationship detection algorithm
  - Use vector similarity to find related objects
  - Detect temporal relationships (sequences, cause-effect)
  - Identify contradictions (conflicting information)
- [ ] Build knowledge graph structure
  - Store relationships in PostgreSQL or Weaviate
  - Node: atomic object
  - Edges: relationship type (mentions, references, contradicts, similar_to)
- [ ] Add relationship API endpoints
  - `GET /api/v1/objects/:id/related` - Get related objects
  - `GET /api/v1/objects/:id/contradictions` - Find conflicts
- [ ] Background job for relationship detection
  - Cron job to analyze new objects
  - Update relationships as new data arrives
- [ ] Add relationship visualization to mobile app
  - Show related objects on detail screen
  - Visual knowledge graph (optional, advanced)

**Files to Create/Modify**:
- `backend/api/src/services/relationshipService.ts` - Relationship logic
- `backend/api/src/models/Relationship.ts` - New model (if using PostgreSQL)
- `backend/api/src/routes/relationships.ts` - Relationship routes
- `backend/api/src/jobs/detectRelationships.ts` - Background job
- `mobile/src/screens/ObjectDetailScreen.tsx` - Show related objects

**Success Criteria**:
- System finds meaningful relationships
- Contradictions are detected accurately
- Related objects are relevant
- Background job runs efficiently
- UI displays relationships clearly

---

## Technical Architecture Updates

### New Services
```
┌─────────────────────────────────────────────┐
│ Mobile App                                  │
│ - Search Screen (new)                       │
│ - AI Query Screen (new)                     │
│ - Enhanced Object Detail (relationships)    │
└──────────────┬──────────────────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────────────────┐
│ Node.js API Service                         │
│ - Search routes (new)                       │
│ - AI routes (new)                           │
│ - Relationship routes (new)                 │
│ - ML service client (new)                   │
└──────┬──────────────┬───────────────────────┘
       │              │
       │              ▼
       │     ┌─────────────────────┐
       │     │ Python ML Service   │
       │     │ - Transcript parser │
       │     │ - Entity extraction │
       │     │ - Classification    │
       │     └─────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ Data Layer                                  │
│ - Weaviate (vector search + embeddings)     │
│ - PostgreSQL (relationships, metadata)      │
│ - OpenAI API (embeddings, GPT-4/Claude)     │
└─────────────────────────────────────────────┘
```

### Data Flow: Transcript → Atomic Objects
```
1. User completes voice recording
   ↓
2. Transcript saved to session
   ↓
3. Node.js API calls ML service
   POST /api/ml/parse-transcript
   ↓
4. ML service (Python):
   - Calls GPT-4/Claude to split transcript
   - Extracts entities, categories, sentiment
   - Returns array of atomic objects
   ↓
5. Node.js API:
   - Stores atomic objects in PostgreSQL
   - Generates embeddings (OpenAI)
   - Stores embeddings in Weaviate
   ↓
6. Background job:
   - Detects relationships
   - Updates knowledge graph
   ↓
7. Mobile app refreshes object list
```

---

## Implementation Order

### Week 1: ML Service & Atomic Parser
**Days 1-2**: Design API contract, set up ML service routes
**Days 3-4**: Implement LLM-based parsing with prompt engineering
**Days 5-7**: Integration with Node.js API, testing, refinement

### Week 2: Embeddings & Vector Search
**Days 8-9**: Embedding generation service
**Days 10-11**: Weaviate integration and batch processing
**Days 12-14**: Semantic search API and testing

### Week 3: RAG & UI
**Days 15-16**: RAG service implementation
**Days 17-18**: Search UI in mobile app
**Days 19-21**: AI query UI and chat interface

### Week 4: Relationships & Polish
**Days 22-23**: Relationship detection service
**Days 24-25**: Background job for relationship updates
**Days 26-28**: Testing, bug fixes, performance optimization

---

## Dependencies

### External Services
- **OpenAI API**: For embeddings (text-embedding-3) and LLM (GPT-4)
- **Weaviate**: Already set up, needs schema updates
- **PostgreSQL**: Already set up, may need new tables for relationships

### Internal Prerequisites
- ✅ Backend API operational
- ✅ Voice transcription working
- ✅ Database models defined
- ✅ Mobile app functional

---

## Testing Strategy

### Unit Tests
- [ ] ML service parsing logic
- [ ] Embedding generation
- [ ] Search service (semantic + hybrid)
- [ ] RAG service
- [ ] Relationship detection

### Integration Tests
- [ ] ML service API endpoints
- [ ] End-to-end transcript → atomic objects flow
- [ ] Search with filters
- [ ] RAG with context retrieval
- [ ] Relationship detection job

### Manual Testing
- [ ] Test with real voice transcripts (multimodal rants)
- [ ] Verify categories are accurate
- [ ] Check semantic search quality
- [ ] Validate RAG answers make sense
- [ ] Review relationship detection results

---

## Success Criteria for Phase 5

### Functional Requirements
- ✅ Transcripts automatically parsed into atomic objects
- ✅ Categories assigned accurately (>80%)
- ✅ Semantic search returns relevant results
- ✅ RAG provides helpful answers with sources
- ✅ System detects relationships and contradictions

### Performance Requirements
- ✅ Parsing latency: <5 seconds per transcript
- ✅ Embedding generation: <1 second per object
- ✅ Semantic search: <1 second
- ✅ RAG response: <3 seconds
- ✅ Relationship detection: runs in background without blocking

### User Experience
- ✅ Search UI is intuitive and fast
- ✅ AI query interface is conversational
- ✅ Related objects are easy to discover
- ✅ Categories make sense and are consistent

---

## Known Challenges

### 1. LLM Prompt Engineering
**Challenge**: Getting consistent, high-quality parsing from LLM
**Solution**: Iterative prompt refinement, few-shot examples, structured output

### 2. Embedding Costs
**Challenge**: OpenAI API costs for large-scale embedding generation
**Solution**: Use text-embedding-3-small, cache embeddings, batch processing

### 3. Search Relevance
**Challenge**: Balancing semantic and keyword search
**Solution**: Experimentation with scoring weights, user feedback

### 4. RAG Context Window
**Challenge**: Fitting enough context in LLM prompt without exceeding limits
**Solution**: Smart context selection, summarization, prioritize recent/relevant

### 5. Relationship Accuracy
**Challenge**: Avoiding false positives in relationship detection
**Solution**: Confidence thresholds, manual review tools, iterative improvement

---

## Environment Variables to Add

```env
# ML Service
ML_SERVICE_URL=http://localhost:8000

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_LLM_MODEL=gpt-4-turbo

# Or Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Weaviate
WEAVIATE_URL=http://localhost:8080
WEAVIATE_API_KEY=  # if using cloud

# Feature Flags
ENABLE_SEMANTIC_SEARCH=true
ENABLE_RAG=true
ENABLE_RELATIONSHIP_DETECTION=true
```

---

## Next Steps After Phase 5

Once Phase 5 is complete, the system will have:
- ✅ AI-powered automatic categorization
- ✅ Semantic search capabilities
- ✅ AI sparring with RAG
- ✅ Knowledge graph with relationships

**Phase 6** will add:
- Geofencing and location-based triggers
- Proactive notifications
- Context-aware object surfacing

---

## Quick Start Commands

```bash
# Start ML service
cd backend/ml-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Start Node.js API (separate terminal)
cd backend/api
npm run dev

# Start mobile app (separate terminal)
cd mobile
npm start
```

---

**Phase Status**: Ready to Begin
**Estimated Duration**: 3-4 weeks
**Next Review**: End of Week 2 (check parsing and embedding progress)
**Last Updated**: January 24, 2026
