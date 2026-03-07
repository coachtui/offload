"""
The Hub ML Service
FastAPI service for voice processing, embeddings, and ML tasks
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="The Hub ML Service",
    description="Voice processing, embeddings, and ML services for The Hub",
    version="0.1.0"
)

# CORS middleware
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins if _allowed_origins else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service-to-service auth — all non-health routes require X-Service-Key
_ML_SERVICE_API_KEY = os.getenv("ML_SERVICE_API_KEY")

@app.middleware("http")
async def verify_service_key(request: Request, call_next):
    # Health and root endpoints are exempt
    if request.url.path in ("/health", "/"):
        return await call_next(request)
    if not _ML_SERVICE_API_KEY:
        # Key not configured — allow through but warn (dev mode)
        return await call_next(request)
    provided = request.headers.get("X-Service-Key")
    if provided != _ML_SERVICE_API_KEY:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    return await call_next(request)


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    from datetime import datetime
    return {
        "status": "ok",
        "service": "thehub-ml-service",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "The Hub ML Service",
        "version": "0.1.0",
        "endpoints": {
            "health": "/health",
            "parse": "/api/v1/parse-transcript",
            "transcribe": "/api/v1/transcribe",
            "embed": "/api/v1/embed"
        }
    }


# Import routers
from app.routes.parse import router as parse_router

# Register routers
app.include_router(parse_router)


# Placeholder endpoints (to be implemented later)
@app.post("/api/v1/transcribe")
async def transcribe_audio():
    """Transcribe audio using Whisper"""
    # TODO: Implement Whisper transcription
    raise HTTPException(status_code=501, detail="Not implemented yet")


@app.post("/api/v1/embed")
async def generate_embedding():
    """Generate vector embedding for text"""
    # TODO: Implement embedding generation
    raise HTTPException(status_code=501, detail="Not implemented yet")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
