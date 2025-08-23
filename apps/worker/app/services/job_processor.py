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
from .ors_client import ORSClient

logger = logging.getLogger(__name__)


class JobProcessor:
    """Processes coverage generation jobs"""
    
    def __init__(self):
        self.osm_fetcher = OSMFetcher()
        # Initialize ORS client with Redis cache if available
        cache = None  # TODO: Add Redis cache when available
        self.ors_client = ORSClient(cache=cache)
        self.route_calculator = RouteCalculator(ors_client=self.ors_client, cache=cache)
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
            
            # 3. Calculate optimal route with proper CPP algorithm
            route_result = await self.route_calculator.calculate_route(
                streets,
                profile=job.get('profile', 'driving-car')
            )
            
            if not route_result:
                raise ValueError("Failed to calculate route")
            
            # Extract diagnostics
            diagnostics = route_result.get('diagnostics', {})
            is_valid = route_result.get('valid', False)
            
            logger.info(f"Calculated route: {route_result['length_m']}m, {route_result['drive_time_s']}s")
            
            # Update progress: Generating chunks
            db.update_job_status(job_id, 'processing', 80, metadata={
                'stage': 'Splitting route into chunks'
            })
            
            # 4. Split into chunks
            chunk_duration = params.get('chunkDuration', 3600)
            route_coords = route_result['geometry']['coordinates']
            chunks = self.route_calculator.split_into_chunks(
                route_coords,
                chunk_duration,
                profile=job.get('profile', 'driving-car')
            )
            
            logger.info(f"Generated {len(chunks)} chunks")
            
            # Update progress: Saving results with diagnostics
            db.update_job_status(job_id, 'processing', 90, metadata={
                'stage': 'Saving route to database',
                'diagnostics': diagnostics
            })
            
            # 5. Save results
            db.save_route_result(
                job_id,
                json.dumps(route_result['geometry']),
                route_result['length_m'],
                route_result['drive_time_s'],
                chunks
            )
            
            # Determine final status based on validation
            final_status = 'completed' if is_valid else 'completed_with_warnings'
            
            # Mark as completed with full diagnostics
            total_time = asyncio.get_event_loop().time() - start_time
            logger.info(f"⏳ Marking job as {final_status} (100%)")
            db.update_job_status(job_id, final_status, 100, metadata={
                'stage': 'Route generation complete',
                'valid': is_valid,
                'stats': {
                    'streets': len(streets['features']),
                    'length_km': round(route_result['length_m'] / 1000, 1),
                    'time_hours': round(route_result['drive_time_s'] / 3600, 1),
                    'chunks': len(chunks),
                    'processing_time_s': round(total_time, 1)
                },
                'diagnostics': {
                    'graph_nodes': diagnostics.get('graph_nodes', 0),
                    'graph_edges': diagnostics.get('graph_edges', 0),
                    'components_before': diagnostics.get('components_before', 0),
                    'components_after': diagnostics.get('components_after', 0),
                    'odd_nodes': diagnostics.get('odd_nodes', 0),
                    'matched_pairs': diagnostics.get('matched_pairs', 0),
                    'deadhead_ratio': diagnostics.get('deadhead_ratio', 0),
                    'max_gap_m': diagnostics.get('max_gap_m', 0),
                    'continuity_valid': diagnostics.get('continuity_valid', True),
                    'violations': diagnostics.get('continuity_violations', 0)
                }
            })
            
            logger.info(f"🎉 Job {job_id} completed successfully ({final_status}) in {total_time:.1f}s")
            
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