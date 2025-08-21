"""
ScanNeo Worker Service
Main FastAPI application for route processing
Version: 1.0.0
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings
from app.database import db
from app.services import JobProcessor

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Job processor instance
job_processor = JobProcessor()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    logger.info(f"Starting {settings.service_name} v{settings.service_version}")
    
    # Start job processor in background
    asyncio.create_task(job_processor.start())
    
    yield
    
    # Shutdown
    logger.info("Shutting down worker service")
    await job_processor.stop()


# Initialize FastAPI app
app = FastAPI(
    title=settings.service_name,
    description="Coverage route generation worker service",
    version=settings.service_version,
    lifespan=lifespan
)


# Request/Response models
class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: bool
    environment: str


class ManualJobRequest(BaseModel):
    area_id: str
    profile: str = "driving-car"
    chunk_duration: int = 3600


@app.get("/", response_model=HealthResponse)
async def root():
    """Root endpoint - health check"""
    return await health()


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    db_healthy = db.health_check()
    
    return {
        "status": "healthy" if db_healthy else "degraded",
        "service": settings.service_name,
        "version": settings.service_version,
        "database": db_healthy,
        "environment": settings.environment
    }


@app.post("/process/manual")
async def trigger_manual_job(request: ManualJobRequest):
    """
    Manually trigger job processing (for testing)
    Only available in development environment
    """
    if settings.environment == "production":
        raise HTTPException(
            status_code=403,
            detail="Manual job triggering not allowed in production"
        )
    
    try:
        # Create a mock job
        job = {
            'id': f'manual_{request.area_id}',
            'area_id': request.area_id,
            'profile': request.profile,
            'params': {
                'chunkDuration': request.chunk_duration,
                'manual': True
            }
        }
        
        # Process immediately
        await job_processor.process_job(job)
        
        return {
            "success": True,
            "message": "Job processed",
            "job_id": job['id']
        }
    
    except Exception as e:
        logger.error(f"Manual job failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@app.get("/status")
async def status():
    """Get worker status and statistics"""
    # Could add metrics here
    return {
        "status": "running",
        "processor_active": job_processor.running,
        "environment": settings.environment
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8080,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower()
    )