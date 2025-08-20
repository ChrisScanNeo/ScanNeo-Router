"""
ScanNeo Worker Service
Processes coverage jobs and generates navigable routes
"""

import os
import json
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from redis import Redis
from dotenv import load_dotenv
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="ScanNeo Worker",
    description="Coverage processing worker service",
    version="1.0.0"
)

# Configuration from environment
DATABASE_URL = os.getenv('DATABASE_URL')
ORS_API_KEY = os.getenv('ORS_API_KEY')
REDIS_URL = os.getenv('UPSTASH_REDIS_REST_URL')
REDIS_TOKEN = os.getenv('UPSTASH_REDIS_REST_TOKEN')

# Initialize Redis client
redis_client = None
if REDIS_URL and REDIS_TOKEN:
    try:
        # For Upstash REST API, we'll use requests instead of redis-py
        # This is a simplified approach for the REST API
        logger.info("Redis configuration found, queue processing will be enabled")
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")

# Database connection pool
def get_db_connection():
    """Create a database connection"""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        raise

# Pydantic models
class JobStatus(BaseModel):
    job_id: str
    status: str
    progress: int
    stage: str
    area_id: Optional[str] = None
    error: Optional[str] = None

class HealthCheck(BaseModel):
    status: str
    service: str
    database: bool
    redis: bool
    timestamp: str

# Background task for processing jobs
async def process_jobs():
    """Main job processing loop"""
    logger.info("Starting job processor")
    
    while True:
        try:
            # Check queue for jobs (simplified for Phase 1)
            # In Phase 2, this will be expanded with actual coverage algorithm
            await asyncio.sleep(5)
            
        except Exception as e:
            logger.error(f"Job processing error: {e}")
            await asyncio.sleep(10)

# API Endpoints
@app.on_event("startup")
async def startup_event():
    """Initialize background tasks on startup"""
    logger.info("Worker service starting up")
    
    # Test database connection
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        conn.close()
        logger.info("Database connection successful")
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
    
    # Start background job processor
    asyncio.create_task(process_jobs())

@app.get("/health", response_model=HealthCheck)
async def health_check():
    """Health check endpoint"""
    
    # Check database
    db_healthy = False
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        conn.close()
        db_healthy = True
    except:
        pass
    
    # Check Redis
    redis_healthy = bool(REDIS_URL and REDIS_TOKEN)
    
    return HealthCheck(
        status="healthy" if db_healthy else "degraded",
        service="scanneo-worker",
        database=db_healthy,
        redis=redis_healthy,
        timestamp=datetime.utcnow().isoformat()
    )

@app.get("/status/{job_id}", response_model=JobStatus)
async def get_job_status(job_id: str):
    """Get status of a specific job"""
    
    # For Phase 1, return a mock status
    # This will be connected to Redis in production
    return JobStatus(
        job_id=job_id,
        status="pending",
        progress=0,
        stage="Waiting in queue",
        area_id=None
    )

@app.post("/process/test")
async def test_processing():
    """Test endpoint to verify worker is functional"""
    
    # Test database connection
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT COUNT(*) as count FROM areas")
        result = cur.fetchone()
        conn.close()
        
        return JSONResponse({
            "status": "success",
            "message": "Worker is functional",
            "areas_count": result['count'] if result else 0,
            "timestamp": datetime.utcnow().isoformat()
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "ScanNeo Worker",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "status": "/status/{job_id}"
        }
    }

# Placeholder for coverage algorithm (Phase 2)
class CoverageProcessor:
    """Placeholder for coverage processing logic"""
    
    def __init__(self, area_id: str):
        self.area_id = area_id
        
    async def process(self):
        """Process coverage for an area"""
        # This will be implemented in Phase 2 with:
        # 1. OSM data extraction
        # 2. Graph building
        # 3. Coverage path calculation
        # 4. ORS routing
        # 5. Chunking
        logger.info(f"Processing coverage for area {self.area_id}")
        return {"status": "completed", "area_id": self.area_id}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("WORKER_PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)