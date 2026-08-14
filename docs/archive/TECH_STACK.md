# Technology Stack - The Hub

## Decision Summary

### Backend Services
- **Primary API**: Node.js 20+ (TypeScript)
- **ML Service**: Python 3.11+ (FastAPI)
- **Communication**: gRPC or Redis Streams

### Voice Processing
- **Primary**: OpenAI Whisper-v3 (API)
- **Local Option**: whisper.cpp (on-device)
- **Hybrid**: Local for quick capture, cloud for final processing

### Vector Database
- **Primary**: Weaviate (self-hostable, knowledge graphs)
- **Alternative**: Qdrant (for on-device option)

### Relational Database
- **PostgreSQL 15+** with extensions:
  - pgcrypto (encryption)
  - pg_trgm (fuzzy search)
  - TimescaleDB (time-series, optional)

### Frontend
- **Mobile**: React Native with Expo
- **Web**: Next.js 14 (App Router)

### Caching & Message Queue
- **Redis 7+** (caching, sessions, message queue)

### Object Storage
- **Development**: MinIO (S3-compatible)
- **Production**: AWS S3 or self-hosted MinIO

### Infrastructure
- **Development**: Docker Compose
- **Production**: Kubernetes (optional) or serverless

## Rationale

### Why Node.js for API?
- Fast async I/O for real-time features
- Excellent ecosystem for web APIs
- Strong WebSocket support
- Easy integration with frontend

### Why Python for ML?
- Best ML/AI library ecosystem
- Native Whisper support
- Strong vector database integrations
- Better for data processing pipelines

### Why Weaviate?
- Self-hostable (privacy)
- Excellent for knowledge graphs
- Built-in vectorization
- Good filtering capabilities

### Why React Native?
- Cross-platform (iOS + Android)
- Excellent background task support
- Native module access
- Faster development than native

## Alternatives Considered

| Component | Chosen | Alternative | Why Not? |
|-----------|--------|-------------|----------|
| Backend | Node.js | Python | Node better for real-time, WebSockets |
| Vector DB | Weaviate | Pinecone | Pinecone is managed (cost, lock-in) |
| Mobile | React Native | Native | Cross-platform, faster dev |
| Voice | Whisper API | Local only | Hybrid approach balances privacy/accuracy |

## Dependencies

### Critical Dependencies
- OpenAI API (Whisper, embeddings, GPT-4)
- Weaviate (vector database)
- PostgreSQL (metadata storage)
- Redis (caching, queues)

### Optional Dependencies
- Sentry (error tracking)
- Prometheus (monitoring)

## Version Pinning

All dependencies should be pinned to specific versions for reproducibility:
- `package.json`: Use exact versions (no `^` or `~`)
- `requirements.txt`: Pin all versions
- `Dockerfile`: Pin base image versions

## Security Considerations

- All external API keys stored in environment variables
- Never commit secrets to repository
- Use dependency scanning (npm audit, pip-audit)
- Regular security updates

## Performance Targets

- Voice-to-Text: < 2 seconds
- Atomic Object Creation: < 5 seconds
- Geofence Check: < 500ms
- Semantic Search: < 1 second
- RAG Query: < 3 seconds

## Cost Considerations

### Development
- All services self-hosted (Docker)
- Minimal cloud costs

### Production
- OpenAI API: Pay-per-use
- Weaviate: Self-hosted (no cost) or managed
- PostgreSQL: Self-hosted or managed (AWS RDS)
- Redis: Self-hosted or managed (AWS ElastiCache)
- Object Storage: S3 or MinIO

### Optimization Strategies
- Cache embeddings
- Batch processing
- Use smaller models when possible
- Compress audio before processing
