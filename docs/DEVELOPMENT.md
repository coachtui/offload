# Development Guide

## Getting Started

### Prerequisites

- **Node.js** 20+ (with npm)
- **Python** 3.11+
- **Docker** & **Docker Compose**
- **PostgreSQL** 15+ (or use Docker)
- **Redis** 7+ (or use Docker)
- **Git**

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd brain_dump
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start infrastructure services**
   ```bash
   docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d
   ```

4. **Install dependencies**

   Backend API:
   ```bash
   cd backend/api
   npm install
   ```

   ML Service:
   ```bash
   cd backend/ml-service
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

   Frontend (when ready):
   ```bash
   cd frontend/mobile
   npm install
   ```

5. **Run database migrations**
   ```bash
   cd backend/api
   npm run migrate
   ```

6. **Start development servers**

   Terminal 1 - API Service:
   ```bash
   cd backend/api
   npm run dev
   ```

   Terminal 2 - ML Service:
   ```bash
   cd backend/ml-service
   source venv/bin/activate
   python main.py
   ```

## Project Structure

```
brain_dump/
├── backend/
│   ├── api/                 # Node.js API service
│   │   ├── src/
│   │   │   ├── routes/      # API routes
│   │   │   ├── services/    # Business logic
│   │   │   ├── models/      # Data models
│   │   │   ├── middleware/  # Express middleware
│   │   │   └── utils/       # Utilities
│   │   ├── migrations/      # Database migrations
│   │   └── tests/           # Tests
│   └── ml-service/          # Python ML service
│       ├── app/
│       │   ├── services/    # ML services (Whisper, embeddings)
│       │   ├── models/      # ML models
│       │   └── utils/       # Utilities
│       └── tests/
├── frontend/
│   ├── mobile/              # React Native app
│   └── web/                 # Next.js dashboard
├── shared/
│   ├── types/               # TypeScript types
│   └── utils/               # Shared utilities
└── infrastructure/
    ├── docker/              # Docker configs
    └── k8s/                 # Kubernetes manifests
```

## Development Workflow

### Code Style

**TypeScript/JavaScript:**
- Use ESLint and Prettier
- Run `npm run lint` and `npm run format` before committing

**Python:**
- Use Black for formatting
- Use Ruff for linting
- Follow PEP 8

### Testing

Run tests:
```bash
# Backend API
cd backend/api
npm test

# ML Service
cd backend/ml-service
pytest
```

### Database Migrations

Create a new migration:
```bash
cd backend/api
npm run migrate:create <migration-name>
```

Run migrations:
```bash
npm run migrate
```

Rollback:
```bash
npm run migrate:down
```

## API Development

### Adding a New Endpoint

1. Create route file in `backend/api/src/routes/`
2. Add route handler
3. Add service logic in `backend/api/src/services/`
4. Add validation using Zod schemas
5. Add tests

Example:
```typescript
// routes/objects.ts
import { Router } from 'express';
import { createObject } from '../services/objectService';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const object = await createObject(req.body);
    res.json({ object });
  } catch (error) {
    next(error);
  }
});

export default router;
```

## ML Service Development

### Adding a New ML Feature

1. Create service in `backend/ml-service/app/services/`
2. Add FastAPI endpoint in `main.py`
3. Add tests

Example:
```python
# app/services/classifier.py
from typing import List
from app.models.classification import Category

async def classify_text(text: str) -> List[Category]:
    # Classification logic
    pass
```

## Debugging

### API Service
- Use `console.log` for development (use proper logger in production)
- Debug with Node.js inspector: `node --inspect dist/index.js`

### ML Service
- Use Python debugger: `import pdb; pdb.set_trace()`
- Check logs in `backend/ml-service/logs/`

### Database
- Connect to PostgreSQL:
  ```bash
  psql -h localhost -U hub_user -d thehub_dev
  ```

### Redis
- Connect to Redis CLI:
  ```bash
  redis-cli
  ```

## Common Tasks

### Reset Development Environment

```bash
# Stop services
docker-compose -f infrastructure/docker/docker-compose.dev.yml down -v

# Restart
docker-compose -f infrastructure/docker/docker-compose.dev.yml up -d

# Re-run migrations
cd backend/api && npm run migrate
```

### View Logs

```bash
# Docker services
docker-compose -f infrastructure/docker/docker-compose.dev.yml logs -f

# API service
cd backend/api && npm run dev

# ML service
cd backend/ml-service && python main.py
```

## Troubleshooting

### Port Already in Use
- Change ports in `.env` file
- Or kill the process using the port

### Database Connection Issues
- Ensure PostgreSQL is running: `docker ps`
- Check connection string in `.env`
- Verify database exists

### ML Service Not Starting
- Check Python version: `python --version` (should be 3.11+)
- Ensure virtual environment is activated
- Install dependencies: `pip install -r requirements.txt`

## Next Steps

- Read [ARCHITECTURE.md](../ARCHITECTURE.md) for system design
- Check [plans/current-phase.md](../plans/current-phase.md) for current tasks
- Review API documentation in [docs/api/](./api/)
