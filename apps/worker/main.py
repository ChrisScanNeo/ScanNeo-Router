"""
ScanNeo Worker Service
Main FastAPI application for route processing
Version: 1.0.2
Last updated: 2025-08-21
"""

import asyncio
import logging
import os
import sys
import traceback
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
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

# Global error tracking
startup_error = None

try:
    from app.config import settings
    from app.database import db
    from app.services import JobProcessor
    
    # Update logging level from settings
    logging.getLogger().setLevel(getattr(logging, settings.log_level))
    logger.info("Configuration loaded successfully")
    logger.info(f"Environment: {settings.environment}")
    logger.info(f"Database URL present: {bool(settings.database_url)}")
except Exception as e:
    logger.error(f"Failed to load configuration: {e}")
    logger.error(f"Error type: {type(e).__name__}")
    import traceback
    error_traceback = traceback.format_exc()
    logger.error(f"Traceback: {error_traceback}")
    logger.error("Worker will run in degraded mode (health check only)")
    settings = None
    db = None
    JobProcessor = None
    # Store error for debugging
    startup_error = str(e)

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
    version="1.0.4-debug" if not settings else settings.service_version,
    lifespan=lifespan
)


# Request/Response models
class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: bool
    environment: str
    has_database_url: bool = False
    config_loaded: bool = False
    error: Optional[str] = None


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
        "version": settings.service_version if settings else "1.0.3",
        "database": db_healthy,
        "environment": settings.environment if settings else "unknown",
        "has_database_url": "DATABASE_URL" in os.environ,
        "config_loaded": settings is not None,
        "error": startup_error if 'startup_error' in globals() else None
    }


@app.get("/diagnostics")
async def diagnostics():
    """Get diagnostic information about the service configuration"""
    # Check if the key exactly matches what we expect
    expected_key_start = "eyJvcmci"
    actual_key = settings.ors_api_key if settings else ""
    
    diag_info = {
        "service": "scanneo-worker",
        "version": settings.service_version if settings else "unknown",
        "environment": settings.environment if settings else "unknown",
        "database": {
            "configured": "DATABASE_URL" in os.environ,
            "connected": db.health_check() if db else False
        },
        "ors": {
            "configured": bool(settings and settings.ors_api_key),
            "key_length": len(actual_key),
            "key_prefix": actual_key[:8] + "..." if len(actual_key) > 8 else "not_set",
            "starts_correctly": actual_key.startswith(expected_key_start) if actual_key else False,
            "has_equals": actual_key.endswith("=") if actual_key else False,
            "raw_env_present": "ORS_API_KEY" in os.environ,
            "raw_env_length": len(os.environ.get("ORS_API_KEY", ""))
        },
        "config": {
            "poll_interval": settings.poll_interval if settings else None,
            "job_timeout": settings.job_timeout if settings else None,
            "max_gap_meters": settings.max_gap_meters if settings else None
        }
    }
    
    return JSONResponse(content=diag_info)


@app.get("/test-ors")
async def test_ors():
    """Test ORS routing directly"""
    from app.services.ors_client import ORSClient
    
    # Create a fresh ORS client
    ors = ORSClient()
    
    # Test coordinates (same area as your test)
    start = (-1.06, 50.80)
    end = (-1.05, 50.81)
    
    try:
        # Try to get a route
        coords, distance = await ors.get_route(start, end)
        
        return {
            "success": True,
            "ors_enabled": ors.enabled,
            "api_key_present": bool(ors.api_key),
            "api_key_length": len(ors.api_key) if ors.api_key else 0,
            "route_points": len(coords),
            "distance_m": distance,
            "used_ors": getattr(ors, 'last_success', False),
            "used_fallback": len(coords) == 2 and distance < 1400,  # Haversine distance is ~1315m
            "last_error": getattr(ors, 'last_error', None)
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "ors_enabled": ors.enabled,
            "api_key_present": bool(ors.api_key),
            "api_key_length": len(ors.api_key) if ors.api_key else 0,
            "last_error": getattr(ors, 'last_error', None)
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
        "processor_active": job_processor.running if job_processor else False,
        "environment": settings.environment if settings else "unknown"
    }


@app.get("/debug/pending-jobs")
async def debug_pending_jobs():
    """Debug endpoint to check for pending jobs"""
    if not db:
        return {"error": "Database not configured"}
    
    try:
        # Get count of all jobs using direct database connection
        job_counts = []
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT status, COUNT(*) as count 
                    FROM coverage_routes 
                    GROUP BY status
                """)
                job_counts = [dict(row) for row in cur.fetchall()]
                
                # Also check for pending jobs directly
                cur.execute("""
                    SELECT id, area_id, status, created_at 
                    FROM coverage_routes 
                    WHERE status = 'pending'
                    ORDER BY created_at ASC
                    LIMIT 5
                """)
                pending_jobs = [dict(row) for row in cur.fetchall()]
        
        return {
            "pending_jobs": pending_jobs,
            "job_counts": job_counts,
            "poll_interval": settings.poll_interval if settings else 30,
            "processor_running": job_processor.running if job_processor else False
        }
    except Exception as e:
        return {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc() if settings and settings.environment == "development" else None
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