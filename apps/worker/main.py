"""
ScanNeo Worker Service
Main FastAPI application for route processing
Version: 1.0.1
"""

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Configure basic logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Log startup
logger.info("Starting ScanNeo Worker Service...")
logger.info(f"Port: {os.environ.get('PORT', '8080')}")
logger.info(f"Database URL configured: {'DATABASE_URL' in os.environ}")

try:
    from app.config import settings
    from app.database import db
    from app.services import JobProcessor
    
    # Update logging level from settings
    logging.getLogger().setLevel(getattr(logging, settings.log_level))
    logger.info("Configuration loaded successfully")
except Exception as e:
    logger.error(f"Failed to load configuration: {e}")
    logger.error("Worker will run in degraded mode (health check only)")
    settings = None
    db = None
    JobProcessor = None

# Job processor instance
job_processor = JobProcessor() if JobProcessor else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    if settings:
        logger.info(f"Starting {settings.service_name} v{settings.service_version}")
    else:
        logger.info("Starting ScanNeo Worker in degraded mode")
    
    # Start job processor in background if available
    if job_processor:
        asyncio.create_task(job_processor.start())
        logger.info("Job processor started")
    else:
        logger.warning("Job processor not available - running in health check only mode")
    
    yield
    
    # Shutdown
    logger.info("Shutting down worker service")
    if job_processor:
        await job_processor.stop()


# Initialize FastAPI app
app = FastAPI(
    title="scanneo-worker" if not settings else settings.service_name,
    description="Coverage route generation worker service",
    version="1.0.0" if not settings else settings.service_version,
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
    # Check database health if available
    db_healthy = db.health_check() if db else False
    
    # Determine overall status
    if not settings or not db:
        status = "degraded"
    elif db_healthy:
        status = "healthy"
    else:
        status = "unhealthy"
    
    return {
        "status": status,
        "service": "scanneo-worker",
        "version": "1.0.0",
        "database": db_healthy,
        "environment": settings.environment if settings else "unknown"
    }


@app.post("/process/manual")
async def trigger_manual_job(request: ManualJobRequest):
    """
    Manually trigger job processing (for testing)
    Only available in development environment
    """
    if not settings or not job_processor:
        raise HTTPException(
            status_code=503,
            detail="Service not fully configured"
        )
    
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