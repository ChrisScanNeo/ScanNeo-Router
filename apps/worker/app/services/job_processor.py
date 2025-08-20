"""
Main job processing logic
"""

import asyncio
import logging
from typing import Dict, Any, Optional
import json
import traceback

from app.database import db
from app.config import settings
from .osm_fetcher import OSMFetcher
from .route_calculator import RouteCalculator

logger = logging.getLogger(__name__)


class JobProcessor:
    """Processes coverage generation jobs"""
    
    def __init__(self):
        self.osm_fetcher = OSMFetcher()
        self.route_calculator = RouteCalculator()
        self.running = False
    
    async def start(self):
        """Start the job processing loop"""
        self.running = True
        logger.info("Job processor started")
        
        while self.running:
            try:
                # Check for pending jobs
                job = db.get_pending_job()
                
                if job:
                    await self.process_job(job)
                else:
                    # No jobs, wait before checking again
                    logger.debug(f"No pending jobs, waiting {settings.poll_interval}s")
                    await asyncio.sleep(settings.poll_interval)
            
            except Exception as e:
                logger.error(f"Error in job processing loop: {e}")
                await asyncio.sleep(10)  # Brief pause before retrying
    
    async def stop(self):
        """Stop the job processor"""
        self.running = False
        logger.info("Job processor stopped")
    
    async def process_job(self, job: Dict[str, Any]):
        """Process a single job"""
        job_id = job['id']
        area_id = job['area_id']
        params = job.get('params', {})
        
        logger.info(f"Processing job {job_id} for area {area_id}")
        
        try:
            # Update progress: Starting
            db.update_job_status(job_id, 'processing', 10, metadata={
                'stage': 'Fetching area data'
            })
            
            # 1. Fetch area data
            area = db.get_area_data(area_id)
            if not area:
                raise ValueError(f"Area {area_id} not found")
            
            logger.info(f"Processing area: {area['name']}")
            
            # Update progress: Fetching streets
            db.update_job_status(job_id, 'processing', 20, metadata={
                'stage': 'Fetching street network from OpenStreetMap'
            })
            
            # 2. Fetch street network from OSM
            streets = await self.osm_fetcher.fetch_streets(
                area['geojson'],
                area.get('buffer_m', 0)
            )
            
            if not streets or len(streets['features']) == 0:
                raise ValueError("No streets found in area")
            
            logger.info(f"Fetched {len(streets['features'])} street segments")
            
            # Update progress: Calculating route
            db.update_job_status(job_id, 'processing', 50, metadata={
                'stage': 'Calculating optimal coverage route'
            })
            
            # 3. Calculate optimal route
            route_result = self.route_calculator.calculate_route(
                streets,
                profile=job.get('profile', 'driving-car')
            )
            
            if not route_result:
                raise ValueError("Failed to calculate route")
            
            logger.info(f"Calculated route: {route_result['length_m']}m, {route_result['drive_time_s']}s")
            
            # Update progress: Generating chunks
            db.update_job_status(job_id, 'processing', 80, metadata={
                'stage': 'Splitting route into chunks'
            })
            
            # 4. Split into chunks
            chunk_duration = params.get('chunkDuration', 3600)
            chunks = self.route_calculator.split_into_chunks(
                route_result['route'],
                chunk_duration
            )
            
            logger.info(f"Generated {len(chunks)} chunks")
            
            # Update progress: Saving results
            db.update_job_status(job_id, 'processing', 90, metadata={
                'stage': 'Saving route to database'
            })
            
            # 5. Save results
            db.save_route_result(
                job_id,
                json.dumps(route_result['geometry']),
                route_result['length_m'],
                route_result['drive_time_s'],
                chunks
            )
            
            # Mark as completed
            db.update_job_status(job_id, 'completed', 100, metadata={
                'stage': 'Route generation complete',
                'stats': {
                    'streets': len(streets['features']),
                    'length_km': round(route_result['length_m'] / 1000, 1),
                    'time_hours': round(route_result['drive_time_s'] / 3600, 1),
                    'chunks': len(chunks)
                }
            })
            
            logger.info(f"Job {job_id} completed successfully")
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Job {job_id} failed: {error_msg}")
            logger.error(traceback.format_exc())
            
            # Mark as failed
            db.update_job_status(
                job_id,
                'failed',
                0,
                error=error_msg,
                metadata={'stage': 'Error during processing'}
            )