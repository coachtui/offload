# Deployment Checklist

## ✅ Completed
- [x] Database schema created and tested
- [x] Authentication working (register/login)
- [x] Git repository initialized
- [x] Initial commit created
- [x] .env files excluded from git

## 📋 Next Steps - GitHub

1. **Create GitHub Repository**
   ```bash
   # Go to: https://github.com/new
   # Name: offload
   # Visibility: Public or Private
   # DO NOT initialize with README
   ```

2. **Push to GitHub**
   ```bash
   # Replace YOUR_USERNAME with your GitHub username
   git remote add origin https://github.com/YOUR_USERNAME/offload.git
   git push -u origin main
   ```

## 🚂 Railway Deployment

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### 2. Create Railway Project
```bash
railway init
# Follow prompts to create new project
```

### 3. Add PostgreSQL Database
```bash
# In Railway dashboard or CLI:
railway add --database postgres
```

### 4. Set Environment Variables

**API Service** (`backend/api`):
```bash
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set JWT_SECRET=$(openssl rand -hex 32)
railway variables set OPENAI_API_KEY=your-key-here
railway variables set JWT_EXPIRES_IN=7d
railway variables set JWT_REFRESH_EXPIRES_IN=30d
railway variables set OPENAI_EMBEDDING_MODEL=text-embedding-3-small
railway variables set WHISPER_MODEL=whisper-1
```

**ML Service** (`backend/ml-service`):
```bash
railway variables set PORT=8000
railway variables set OPENAI_API_KEY=your-key-here
railway variables set LLM_MODEL=gpt-4-turbo
```

### 5. Run Database Migrations
```bash
cd backend/api
railway run node run-migration.js
```

### 6. Deploy Services
```bash
# From backend/api
railway up

# From backend/ml-service
railway up
```

### 7. Update Mobile App
After deployment, update the mobile app's API URL:

```bash
# Edit mobile/.env
EXPO_PUBLIC_API_URL=https://your-api.railway.app
EXPO_PUBLIC_WS_URL=wss://your-api.railway.app
```

## ⚠️ Important Notes

### Current Features Working
- ✅ User authentication (register/login)
- ✅ Database with all tables
- ✅ Health check endpoints
- ✅ WebSocket for voice streaming
- ✅ Mobile app with auth screens

### Optional Services (Can Add Later)
- ⏳ **Weaviate** (vector search) - Use Weaviate Cloud
- ⏳ **Redis** (caching) - Use Upstash Redis
- ⏳ **MinIO** (audio storage) - Use AWS S3 or Railway volumes

### For MVP, these can be disabled:
- Comment out Weaviate checks in health endpoint
- Disable audio upload features temporarily
- Skip Redis caching

## 🧪 Testing After Deployment

```bash
# Test API health
curl https://your-api.railway.app/health

# Test registration
curl -X POST https://your-api.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Test login
curl -X POST https://your-api.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## 📝 Useful Commands

```bash
# View logs
railway logs

# Open Railway dashboard
railway open

# Check service status
railway status

# Run commands in Railway environment
railway run <command>

# Link to existing project
railway link
```

## 🔐 Security Notes

1. **JWT_SECRET** - Generate a strong random secret:
   ```bash
   openssl rand -hex 32
   ```

2. **Database** - Railway PostgreSQL comes with SSL enabled

3. **CORS** - Update `ALLOWED_ORIGINS` to match your frontend URL

4. **OpenAI API Key** - Keep secure, monitor usage

## 💰 Estimated Costs

- **Railway Starter**: $5/month
- **PostgreSQL**: ~$5/month
- **API + ML Service**: ~$10-15/month
- **Total**: ~$20-25/month

## 📚 Documentation Links

- Railway Docs: https://docs.railway.app
- Railway CLI: https://docs.railway.app/develop/cli
- Node.js on Railway: https://docs.railway.app/guides/nodejs
- Python on Railway: https://docs.railway.app/guides/python

---

**Current Status**: Ready for GitHub push and Railway deployment! 🚀
