# Deploy Brain Dump to Railway

## Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

## Step 2: Create Railway Project

1. Go to https://railway.app
2. Sign up/login with GitHub
3. Click "New Project"
4. Select "Empty Project"
5. Name it: "brain-dump"

## Step 3: Create Services

You'll deploy 3 services:
1. **PostgreSQL** (managed database)
2. **API Service** (Node.js backend)
3. **ML Service** (Python FastAPI)

### 3a. Add PostgreSQL Database

In Railway dashboard:
1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway will auto-provision and provide connection URL
3. Note: This replaces your local PostgreSQL, Redis, Weaviate, MinIO

### 3b. Deploy API Service

```bash
cd backend/api
railway link  # Link to your Railway project
railway up    # Deploy the API
```

After deployment, Railway will provide a URL like: `https://brain-dump-api.up.railway.app`

### 3c. Deploy ML Service

```bash
cd ../ml-service
railway up
```

## Step 4: Configure Environment Variables

In Railway dashboard → API Service → Variables, add:

```
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://your-frontend-url.com

# Database - Railway auto-injects these from PostgreSQL service
# DATABASE_URL will be available automatically

# Parse manually if needed:
POSTGRES_HOST=<from DATABASE_URL>
POSTGRES_PORT=5432
POSTGRES_USER=<from DATABASE_URL>
POSTGRES_PASSWORD=<from DATABASE_URL>
POSTGRES_DB=<from DATABASE_URL>

# JWT
JWT_SECRET=<generate-a-secure-random-string>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# OpenAI
OPENAI_API_KEY=<your-openai-key>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
WHISPER_MODEL=whisper-1

# Note: Weaviate, MinIO, Redis will need separate setup or use managed alternatives
# For MVP, you can disable these features temporarily
```

For ML Service → Variables:
```
PORT=8000
OPENAI_API_KEY=<your-openai-key>
LLM_MODEL=gpt-4-turbo
ALLOWED_ORIGINS=<your-api-url>
```

## Step 5: Add Services (Optional - Advanced)

Railway doesn't have managed Weaviate/MinIO/Redis yet. Options:

**Option A: Disable for now** (simplest)
- App will work without semantic search and audio storage
- Focus on core features first

**Option B: Use external services**
- Weaviate Cloud: https://console.weaviate.cloud
- Upstash Redis: https://upstash.com
- AWS S3 instead of MinIO

**Option C: Deploy as Railway services**
- Deploy Docker images manually (more complex)

## Step 6: Run Database Migrations

```bash
railway run npm run migrate  # If you have migration scripts
```

Or connect to Railway PostgreSQL and run migrations manually.

## Step 7: Test Deployment

```bash
# Test API
curl https://your-api-url.railway.app/health

# Test ML Service  
curl https://your-ml-url.railway.app/health
```

## Estimated Costs

- **Starter Plan**: $5/month + usage
- **PostgreSQL**: ~$5/month
- **2 Services**: ~$5-10/month each
- **Total**: ~$15-20/month

## Quick Deploy (Alternative)

If you have Railway CLI configured:

```bash
# From project root
railway init
railway up --service api -d backend/api
railway up --service ml -d backend/ml-service
```

## Next Steps

1. Update mobile app API URL to Railway URL
2. Test full flow: Mobile → API → ML Service
3. Monitor logs in Railway dashboard
4. Set up custom domain (optional)

---

**Need help?** Railway docs: https://docs.railway.app
