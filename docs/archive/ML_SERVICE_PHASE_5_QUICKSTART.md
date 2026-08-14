# Phase 5 Quick Start Guide

## 🚀 Start Everything

### 1. Start Infrastructure (if not running)
```bash
cd infrastructure/docker
docker-compose -f docker-compose.dev.yml up -d
```

### 2. Start ML Service
```bash
cd backend/ml-service

# First time only
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn pydantic pydantic-settings python-dotenv httpx

# Every time
source venv/bin/activate
python main.py
```

**Verify:** http://localhost:8000/health

### 3. Start Backend API
```bash
cd backend/api
npm run dev
```

**Verify:** http://localhost:3000/health

### 4. Start Mobile App
```bash
cd mobile
npm start
```

---

## 🧪 Quick Tests

### Test ML Service Parser
```bash
cd backend/ml-service
source venv/bin/activate
python test_parser.py
```

### Test API Health
```bash
curl http://localhost:3000/health
curl http://localhost:8000/health
```

### Test Parsing Endpoint
```bash
curl -X POST http://localhost:8000/api/v1/parse-transcript \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Need to call Mom this weekend. Also my shoulder hurts.",
    "user_id": "test-123",
    "session_id": "session-456"
  }'
```

---

## 🔑 Required Environment Variables

### Backend API `.env`
```env
ML_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4-turbo
WEAVIATE_URL=http://localhost:8080
```

### ML Service `.env`
```env
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4-turbo
PORT=8000
```

---

## 📝 New API Endpoints

### Search
- `POST /api/v1/search/semantic` - Semantic search
- `POST /api/v1/search/similar/:id` - Find similar
- `POST /api/v1/search/hybrid` - Hybrid search

### AI (RAG)
- `POST /api/v1/ai/query` - Ask questions
- `POST /api/v1/ai/check-contradictions` - Check conflicts

---

## 📚 Full Documentation

- **Deployment Guide:** [plans/PHASE_5_DEPLOYMENT.md](plans/PHASE_5_DEPLOYMENT.md)
- **Completion Report:** [plans/PHASE_5_REPORT.md](plans/PHASE_5_REPORT.md)
- **Master Plan:** [plans/master-plan.md](plans/master-plan.md)

---

## 🎯 What Phase 5 Adds

✅ Automatic transcript parsing with LLM
✅ Category classification
✅ Entity extraction
✅ Sentiment & urgency detection
✅ Semantic vector search
✅ AI-powered Q&A (RAG)
✅ Relationship detection
✅ Contradiction checking

---

## 🐛 Common Issues

**ML service won't start:**
```bash
# Check Python version
python3 --version  # Need 3.8+

# Check if port is in use
lsof -i :8000

# Verify .env has API keys
cat backend/ml-service/.env
```

**Parsing returns errors:**
- Check OPENAI_API_KEY is valid
- Check API quota/billing
- Review ML service logs

**Search returns nothing:**
- Verify Weaviate is running
- Check if objects have embeddings
- Try querying Weaviate directly

---

## 💰 Costs

With OpenAI API:
- Per transcript parse: ~$0.01-0.03
- Per embedding: ~$0.0001
- Per RAG query: ~$0.01-0.02

**Monthly estimate (100 sessions):** $2-5

---

## ✅ Phase 5 Status: COMPLETE

Ready for Phase 6: Geofencing & Context-Aware Features
