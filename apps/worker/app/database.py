"""
Database connection and models
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime
import json

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    """Database connection manager"""
    
    def __init__(self):
        self.pool: Optional[SimpleConnectionPool] = None
        self._connect()
    
    def _connect(self):
        """Initialize connection pool"""
        try:
            # Parse database URL and add SSL if needed
            db_url = settings.database_url
            
            # Neon requires SSL - add it if not present
            if 'neon.tech' in db_url and 'sslmode=' not in db_url:
                if '?' in db_url:
                    db_url += '&sslmode=require'
                else:
                    db_url += '?sslmode=require'
            
            self.pool = SimpleConnectionPool(
                1, 5,  # min and max connections
                db_url,
                cursor_factory=RealDictCursor
            )
            logger.info("Database connection pool created")
        except Exception as e:
            logger.error(f"Failed to create database pool: {e}")
            logger.error(f"Database URL pattern: {settings.database_url[:20]}...") 
            raise
    
    @contextmanager
    def get_connection(self):
        """Get a connection from the pool"""
        conn = None
        try:
            conn = self.pool.getconn()
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                self.pool.putconn(conn)
    
    def get_pending_job(self) -> Optional[Dict[str, Any]]:
        """Fetch a pending job and mark it as processing"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Find and lock a pending job
                cur.execute("""
                    UPDATE coverage_routes
                    SET params = jsonb_set(
                        params,
                        '{status}',
                        '"processing"'::jsonb
                    ),
                    updated_at = NOW()
                    WHERE id = (
                        SELECT id FROM coverage_routes
                        WHERE params->>'status' = 'pending'
                        ORDER BY created_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING 
                        id,
                        area_id,
                        profile,
                        params,
                        created_at
                """)
                
                job = cur.fetchone()
                if job:
                    logger.info(f"Claimed job: {job['id']}")
                    return dict(job)
                return None
    
    def get_area_data(self, area_id: str) -> Optional[Dict[str, Any]]:
        """Fetch area details including geometry"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id,
                        name,
                        ST_AsGeoJSON(geom) as geojson,
                        buffer_m,
                        params,
                        created_at
                    FROM areas
                    WHERE id = %s
                """, (area_id,))
                
                area = cur.fetchone()
                if area:
                    area_dict = dict(area)
                    area_dict['geojson'] = json.loads(area_dict['geojson'])
                    return area_dict
                return None
    
    def update_job_status(
        self,
        job_id: str,
        status: str,
        progress: int = 0,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Update job status and progress"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                params_update = {
                    'status': status,
                    'progress': progress,
                    'updatedAt': datetime.utcnow().isoformat()
                }
                
                if error:
                    params_update['error'] = error
                
                if metadata:
                    params_update.update(metadata)
                
                if status == 'completed':
                    params_update['completedAt'] = datetime.utcnow().isoformat()
                
                cur.execute("""
                    UPDATE coverage_routes
                    SET params = params || %s::jsonb,
                        updated_at = NOW()
                    WHERE id = %s
                """, (json.dumps(params_update), job_id))
                
                logger.info(f"Updated job {job_id}: status={status}, progress={progress}")
    
    def save_route_result(
        self,
        job_id: str,
        route_geom: str,  # WKT or GeoJSON string
        length_m: float,
        drive_time_s: float,
        chunks: list = None
    ):
        """Save the calculated route results"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Update the route with calculated data
                cur.execute("""
                    UPDATE coverage_routes
                    SET 
                        geom = ST_GeomFromGeoJSON(%s),
                        length_m = %s,
                        drive_time_s = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """, (route_geom, length_m, drive_time_s, job_id))
                
                # Insert chunks if provided
                if chunks:
                    for idx, chunk in enumerate(chunks):
                        cur.execute("""
                            INSERT INTO chunks (
                                route_id,
                                idx,
                                length_m,
                                time_s,
                                geom
                            ) VALUES (
                                %s, %s, %s, %s,
                                ST_GeomFromGeoJSON(%s)
                            )
                        """, (
                            job_id,
                            idx,
                            chunk.get('length_m', 0),
                            chunk.get('time_s', 0),
                            json.dumps(chunk['geometry'])
                        ))
                
                logger.info(f"Saved route results for job {job_id}")
    
    def health_check(self) -> bool:
        """Check database connectivity"""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    return True
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False


# Create database instance
db = Database()