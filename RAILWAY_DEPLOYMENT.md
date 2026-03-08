# Deploy Offload to Railway

Complete guide to deploying both API and ML services to Railway with AWS S3 storage.

## Prerequisites

- Railway account: https://railway.app
- AWS account (for S3 storage): https://aws.amazon.com
- OpenAI API key
- Weaviate Cloud account (optional): https://console.weaviate.cloud

## Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

## Step 2: Create Railway Project

### Via Dashboard:
1. Go to https://railway.app
2. Sign up/login with GitHub
3. Click "New Project"
4. Select "Empty Project"
5. Name it: "offload" or "thehub"

### Via CLI:
```bash
cd /Users/tui/Desktop/brain_dump
railway init
```

## Step 3: Add PostgreSQL Database

In Railway dashboard:
1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway auto-provisions the database
3. Copy the `DATABASE_URL` from variables (we'll need this later)

## Step 4: Deploy API Service

### 4a. Push to GitHub (Recommended)

```bash
# Commit all changes
git add .
git commit -m "Configure for Railway deployment with S3"
git push origin main
```

### 4b. Connect GitHub to Railway

1. In Railway dashboard, click "New" → "GitHub Repo"
2. Select your repository (e.g., `your-username/brain-dump`)
3. Railway will detect it's a monorepo
4. **Configure root directory**: Set to `backend/api`
5. Click "Deploy"

Railway will automatically:
- Detect it's a Node.js project
- Use the `railway.toml` configuration
- Build and deploy on every push to main

### Alternative: Deploy via CLI

If you prefer CLI deployment:

```bash
cd backend/api
railway service create api
railway link
npm run build
railway up
```

### 4c. Configure API Environment Variables

In Railway dashboard → `api` service → Variables:

**Required Variables:**
```env
NODE_ENV=production
PORT=3000

# Database (use Railway's DATABASE_URL)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Parse DATABASE_URL manually if needed:
POSTGRES_HOST=${{Postgres.PGHOST}}
POSTGRES_PORT=${{Postgres.PGPORT}}
POSTGRES_USER=${{Postgres.PGUSER}}
POSTGRES_PASSWORD=${{Postgres.PGPASSWORD}}
POSTGRES_DB=${{Postgres.PGDATABASE}}

# JWT Authentication (generate secure random strings)
JWT_SECRET=<generate-secure-32-char-string>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# OpenAI API
OPENAI_API_KEY=<your-openai-api-key>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_WHISPER_MODEL=whisper-1

# CORS (add your frontend URL)
ALLOWED_ORIGINS=https://your-frontend-url.com,https://your-mobile-app.com

# Weaviate (use Weaviate Cloud or local)
WEAVIATE_URL=<your-weaviate-cloud-url>
WEAVIATE_API_KEY=<your-weaviate-api-key>

# AWS S3 Storage (see Step 5 for setup)
S3_ENDPOINT=s3.amazonaws.com
S3_ACCESS_KEY=<your-aws-access-key>
S3_SECRET_KEY=<your-aws-secret-key>
S3_BUCKET=<your-bucket-name>
S3_REGION=us-east-1

# ML Service URL (we'll update this after ML service is deployed)
ML_SERVICE_URL=https://thehub-ml.up.railway.app
```

### 4d. Generate Public URL

1. Go to Settings tab in Railway
2. Click "Generate Domain"
3. Copy the URL (e.g., `https://thehub-api.up.railway.app`)

## Step 5: Deploy ML Service

### 5a. Deploy from Same GitHub Repo

1. In Railway dashboard, click "New" → "GitHub Repo"
2. Select the **same repository** again
3. **Configure root directory**: Set to `backend/ml-service`
4. Click "Deploy"

Railway will:
- Detect it's a Python project
- Use `railway.toml` and `requirements.txt`
- Auto-deploy on every push

### Alternative: Deploy via CLI

```bash
cd backend/ml-service
railway service create ml-service
railway link
railway up
```

### 5c. Configure ML Service Environment Variables

In Railway dashboard → `ml-service` → Variables:

```env
PORT=8000

# OpenAI API
OPENAI_API_KEY=<your-openai-api-key>
LLM_MODEL=gpt-4-turbo

# CORS (use your API service URL)
ALLOWED_ORIGINS=https://thehub-api.up.railway.app,https://your-frontend-url.com
```

### 5d. Generate Public URL

1. Go to Settings tab
2. Click "Generate Domain"
3. Copy the URL (e.g., `https://thehub-ml.up.railway.app`)
4. **Update API service's `ML_SERVICE_URL` variable with this URL**

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

**Option B: Use external services** (recommended)
- Weaviate Cloud: https://console.weaviate.cloud
- Upstash Redis: https://upstash.com
- AWS S3 instead of MinIO (see detailed setup below)

**Option C: Deploy as Railway services**
- Deploy Docker images manually (more complex)

### Setting Up AWS S3 for Audio Storage

1. **Create an S3 Bucket**
   - Go to https://console.aws.amazon.com/s3
   - Click "Create bucket"
   - Bucket name: `your-app-name-audio` (must be globally unique)
   - Region: Choose closest to your users (e.g., `us-east-1`)
   - Block all public access: **Keep enabled** (we'll use presigned URLs)
   - Click "Create bucket"

2. **Create IAM User for API Access**
   - Go to https://console.aws.amazon.com/iam
   - Click "Users" → "Create user"
   - Username: `brain-dump-api`
   - Select "Attach policies directly"
   - Search and select: `AmazonS3FullAccess` (or create custom policy below)
   - Click "Create user"

3. **Generate Access Keys**
   - Click on the newly created user
   - Go to "Security credentials" tab
   - Click "Create access key"
   - Choose "Application running outside AWS"
   - Copy the **Access Key ID** and **Secret Access Key** (save these securely!)

4. **Add S3 Variables to Railway**

   In Railway dashboard → API Service → Variables, add:
   ```
   S3_ENDPOINT=s3.amazonaws.com
   S3_ACCESS_KEY=your-access-key-id
   S3_SECRET_KEY=your-secret-access-key
   S3_BUCKET=your-bucket-name
   S3_REGION=us-east-1
   ```

5. **Optional: Custom IAM Policy (More Secure)**

   Instead of `AmazonS3FullAccess`, create a custom policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::your-bucket-name",
           "arn:aws:s3:::your-bucket-name/*"
         ]
       }
     ]
   }
   ```

**Cost Estimate:**
- First 5GB stored: Free tier (12 months)
- After free tier: ~$0.023/GB/month
- For voice notes: ~$1-5/month depending on usage

## Step 6: Run Database Migrations

### Option A: Via Railway CLI

```bash
cd backend/api

# Run migrations through Railway
railway run npm run migrate

# Or manually with psql
railway connect Postgres
# Then run your SQL migrations
```

### Option B: Via Database Management Tool

1. Copy the `DATABASE_URL` from Railway
2. Use TablePlus, pgAdmin, or similar tool
3. Connect and run SQL migrations manually

## Step 7: Test Deployment

### Test API Health

```bash
# Health check
curl https://your-api-url.railway.app/health

# Expected response:
{
  "status": "healthy",
  "database": true,
  "weaviate": true,
  "storage": true,
  "timestamp": "2025-01-26T..."
}
```

### Test ML Service Health

```bash
# Health check
curl https://your-ml-url.railway.app/health

# Expected response:
{
  "status": "ok",
  "service": "thehub-ml-service",
  "timestamp": "2025-01-26T..."
}
```

### Test Full Integration

```bash
# Create a test user (via API)
curl -X POST https://your-api-url.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'

# Login
curl -X POST https://your-api-url.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

## Step 8: Monitor and Debug

### View Logs

```bash
# API service logs
railway logs --service api

# ML service logs
railway logs --service ml-service

# Database logs
railway logs --service Postgres
```

### Common Issues

**Issue: API can't connect to database**
- Check `DATABASE_URL` is correctly set
- Verify database service is running
- Check network connectivity between services

**Issue: MinIO connection failed**
- This is expected on Railway!
- Ensure S3 variables are set correctly
- Verify S3 bucket exists and credentials are valid

**Issue: ML service timeout**
- ML service may take 2-3 minutes to start (installing dependencies)
- Increase `healthcheckTimeout` in railway.toml if needed
- Check logs for specific errors

**Issue: CORS errors**
- Add your frontend URL to `ALLOWED_ORIGINS`
- Include both http://localhost and production URLs for testing

## Cost Breakdown

### Railway Costs
- **Hobby Plan**: $5/month (includes $5 usage credit)
- **PostgreSQL**: ~$5/month
- **API Service**: ~$5-10/month (depends on traffic)
- **ML Service**: ~$5-15/month (depends on usage)
- **Total Railway**: ~$20-35/month

### External Service Costs
- **AWS S3**: ~$1-5/month (5GB = free tier for 12 months, then $0.023/GB)
- **Weaviate Cloud**: Free tier available, ~$25/month for Standard
- **OpenAI API**: Pay-as-you-go (Whisper ~$0.006/min, Embeddings ~$0.0001/1K tokens)

### Total Estimated Monthly Cost
- **Minimum (without extras)**: ~$20-25/month
- **With S3 & Weaviate**: ~$50-60/month
- **Full production**: ~$75-100/month

## Quick Deploy via GitHub (Recommended)

**This is the easiest method - Railway auto-deploys on every push!**

1. **Commit and push your code**
   ```bash
   git add .
   git commit -m "Configure for Railway deployment"
   git push origin main
   ```

2. **In Railway dashboard:**
   - Create new project
   - Add PostgreSQL database
   - Click "New" → "GitHub Repo" → Select your repo
   - Set root directory to `backend/api` → Deploy
   - Click "New" → "GitHub Repo" → Select same repo again
   - Set root directory to `backend/ml-service` → Deploy

3. **Configure environment variables** (see Step 4c and 5c above)

4. **Done!** Every push to GitHub will auto-deploy

## Alternative: Quick Deploy via CLI

```bash
#!/bin/bash
# Manual CLI deploy script

railway init
railway add postgresql

cd backend/api
railway link
npm run build
railway up

cd ../ml-service
railway link
railway up

railway open  # Configure env vars
```

## Next Steps After Deployment

1. **Update Mobile App Configuration**
   ```typescript
   // In your mobile app config
   export const API_URL = "https://thehub-api.up.railway.app";
   export const WS_URL = "wss://thehub-api.up.railway.app";
   ```

2. **Test Full Flow**
   - Open mobile app
   - Create voice note
   - Verify transcription works
   - Check data appears in database
   - Test semantic search (if Weaviate configured)

3. **Set Up Custom Domain** (Optional)
   - Go to Service Settings in Railway
   - Click "Add Custom Domain"
   - Point your DNS records to Railway
   - Configure SSL (automatic with Railway)

4. **Enable Monitoring**
   - Set up Sentry (optional)
   - Configure alerts in Railway dashboard
   - Monitor usage and costs

5. **Production Checklist**
   - [ ] All environment variables set
   - [ ] Database migrations run
   - [ ] S3 bucket configured with proper permissions
   - [ ] CORS configured for frontend domains
   - [ ] JWT secrets generated securely
   - [ ] API rate limiting configured (if needed)
   - [ ] Backup strategy for database
   - [ ] Monitoring and logging set up

## Troubleshooting

### Service Won't Start

```bash
# Check build logs
railway logs --service api

# Common fixes:
# 1. Ensure package.json has correct start script
# 2. Verify TypeScript compiles without errors
# 3. Check all required env vars are set
```

### Database Connection Issues

```bash
# Test database connection
railway run psql $DATABASE_URL

# Verify connection string format:
# postgresql://user:pass@host:port/dbname
```

### High Memory Usage (ML Service)

The ML service can use significant memory due to ML models. If you hit limits:

1. Upgrade Railway plan
2. Use OpenAI API instead of local Whisper (recommended for Railway)
3. Reduce model sizes in configuration

---

## Support Resources

- **Railway Documentation**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Project Issues**: https://github.com/your-repo/issues
- **OpenAI API Docs**: https://platform.openai.com/docs
