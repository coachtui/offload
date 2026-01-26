"""
The Hub ML Service
FastAPI service for voice processing, embeddings, and ML tasks
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
