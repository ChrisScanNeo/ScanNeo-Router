"""
OpenRouteService client with retry logic and caching
"""

import logging
import hashlib
import json
import time
import random
import asyncio
from typing import Dict, Any, Tuple, Optional, List
import httpx
from httpx import Response
import polyline

from app.config import settings

logger = logging.getLogger(__name__)


class ORSClient:
    """Client for OpenRouteService API with caching and retry logic"""
    
    def __init__(self, cache=None):
        self.api_key = settings.ors_api_key
        self.directions_url = settings.ors_directions_url
        self.matrix_url = settings.ors_matrix_url
        self.timeout = settings.ors_timeout
        self.max_retries = settings.ors_max_retries
        self.retry_delay = settings.ors_retry_delay
        self.cache = cache  # Redis cache instance
        self.enabled = bool(self.api_key)  # ORS is only enabled if we have an API key
        
        # Log ORS status for debugging
        if self.enabled:
            logger.info(f"ORS client initialized with API key (length: {len(self.api_key)})")
        else:
            logger.warning("ORS client initialized WITHOUT API key - using fallback mode")
        
    def _cache_key(self, start: Tuple[float, float], end: Tuple[float, float], profile: str = "driving-car") -> str:
        """Generate deterministic cache key for route"""
        key_str = f"{start[0]:.6f},{start[1]:.6f}|{end[0]:.6f},{end[1]:.6f}|{profile}"
        return f"ors:route:{hashlib.sha1(key_str.encode()).hexdigest()}"
    
    def _matrix_cache_key(self, locations: List[List[float]], profile: str = "driving-car") -> str:
        """Generate deterministic cache key for matrix"""
        loc_str = json.dumps(locations, sort_keys=True)
        key_str = f"{loc_str}|{profile}"
        return f"ors:matrix:{hashlib.sha1(key_str.encode()).hexdigest()}"
    
    async def _make_request_with_retry(
        self,
        method: str,
        url: str,
        headers: Dict[str, str],
        json_data: Dict[str, Any]
    ) -> Response:
        """Make HTTP request with exponential backoff retry"""
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            for attempt in range(self.max_retries):
                try:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        json=json_data
                    )
                    
                    # Handle rate limiting
                    if response.status_code == 429:
                        retry_after = response.headers.get('Retry-After', str(self.retry_delay * (2 ** attempt)))
                        wait_time = float(retry_after)
                        logger.warning(f"Rate limited, waiting {wait_time}s before retry")
                        await asyncio.sleep(wait_time)
                        continue
                    
                    # Success or non-retryable error
                    if response.status_code < 500:
                        response.raise_for_status()
                        return response
                    
                    # Server error - retry with backoff
                    logger.warning(f"Server error {response.status_code}, attempt {attempt + 1}/{self.max_retries}")
                    
                except httpx.TimeoutException:
                    logger.warning(f"Request timeout, attempt {attempt + 1}/{self.max_retries}")
                except httpx.NetworkError as e:
                    logger.warning(f"Network error: {e}, attempt {attempt + 1}/{self.max_retries}")
                
                # Exponential backoff with jitter
                if attempt < self.max_retries - 1:
                    wait_time = self.retry_delay * (2 ** attempt) + (random.random() * 0.1)
                    await asyncio.sleep(wait_time)
            
            raise Exception(f"Failed after {self.max_retries} attempts")
    
    async def get_route(
        self,
        start: Tuple[float, float],
        end: Tuple[float, float],
        profile: str = "driving-car",
        waypoints: Optional[List[Tuple[float, float]]] = None
    ) -> Tuple[List[List[float]], float]:
        """
        Get driving route between two points
        
        Args:
            start: (lon, lat) tuple
            end: (lon, lat) tuple
            profile: routing profile (driving-car, driving-hgv, etc)
            waypoints: optional intermediate waypoints
        
        Returns:
            (coordinates, distance_meters) tuple
        """
        
        # If ORS is not enabled, return straight line
        if not self.enabled:
            logger.warning(f"ORS not enabled (key present: {bool(self.api_key)}, length: {len(self.api_key) if self.api_key else 0}), returning straight line")
            return [list(start), list(end)], self._haversine(start, end)
        
        # Check cache first
        if self.cache and not waypoints:
            cache_key = self._cache_key(start, end, profile)
            cached = await self._get_cached(cache_key)
            if cached:
                logger.debug(f"Cache hit for route {start} -> {end}")
                return cached['coordinates'], cached['distance']
        
        # Build coordinates list
        coords = [list(start)]
        if waypoints:
            coords.extend([list(wp) for wp in waypoints])
        coords.append(list(end))
        
        # Prepare request
        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        json_data = {
            "coordinates": coords,
            "instructions": False
        }
        
        # Make request with retry
        try:
            response = await self._make_request_with_retry(
                method="POST",
                url=self.directions_url.replace("driving-car", profile),
                headers=headers,
                json_data=json_data
            )
            
            data = response.json()
            
            # Extract route geometry and distance (JSON format)
            if 'routes' not in data or len(data['routes']) == 0:
                raise ValueError("No route found")
            
            route = data['routes'][0]
            
            # Get distance from summary  
            distance = route.get('summary', {}).get('distance', 0)
            
            # Decode the polyline geometry to get actual route coordinates
            if 'geometry' in route and isinstance(route['geometry'], str):
                # Decode polyline (ORS uses precision 5)
                decoded = polyline.decode(route['geometry'], 5)
                # Convert from (lat, lon) to (lon, lat) format
                coordinates = [[lon, lat] for lat, lon in decoded]
            else:
                # Fallback to waypoints if no geometry
                logger.warning("No geometry in route, using waypoints")
                coordinates = coords
            
            # Mark that we successfully used ORS (not fallback)
            self.last_success = True
            logger.info(f"ORS route found: {distance:.0f}m")
            
            # Cache result
            if self.cache and not waypoints:
                cache_key = self._cache_key(start, end, profile)
                cache_value = {
                    'coordinates': coordinates,
                    'distance': distance
                }
                await self._set_cached(cache_key, cache_value, ttl=86400)  # 24 hour TTL
            
            # Return the actual ORS distance (not haversine)
            # The coordinates may be simplified but distance is accurate
            return coordinates, distance
            
        except Exception as e:
            error_msg = f"Failed to get route from {start} to {end}: {e}"
            logger.error(error_msg)
            # Store last error for debugging
            self.last_error = str(e)
            self.last_success = False
            # Return straight line as fallback (will be flagged in validation)
            return [list(start), list(end)], self._haversine(start, end)
    
    async def get_distance_matrix(
        self,
        locations: List[Tuple[float, float]],
        profile: str = "driving-car"
    ) -> List[List[float]]:
        """
        Get distance matrix between multiple points
        
        Args:
            locations: List of (lon, lat) tuples
            profile: routing profile
        
        Returns:
            2D matrix of distances in meters
        """
        
        # If ORS is not enabled, return haversine distances
        if not self.enabled:
            logger.debug("ORS not enabled, using haversine distances")
            n = len(locations)
            matrix = [[0.0] * n for _ in range(n)]
            for i in range(n):
                for j in range(n):
                    if i != j:
                        matrix[i][j] = self._haversine(locations[i], locations[j])
            return matrix
        
        # Check cache
        if self.cache:
            cache_key = self._matrix_cache_key([[loc[0], loc[1]] for loc in locations], profile)
            cached = await self._get_cached(cache_key)
            if cached:
                logger.debug(f"Cache hit for matrix with {len(locations)} locations")
                return cached
        
        # Prepare request
        headers = {
            "Authorization": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        json_data = {
            "locations": [[loc[0], loc[1]] for loc in locations],
            "metrics": ["distance"],
            "units": "m"
        }
        
        # Make request
        try:
            response = await self._make_request_with_retry(
                method="POST",
                url=self.matrix_url.replace("driving-car", profile),
                headers=headers,
                json_data=json_data
            )
            
            data = response.json()
            distances = data['distances']
            
            # Cache result
            if self.cache:
                cache_key = self._matrix_cache_key([[loc[0], loc[1]] for loc in locations], profile)
                await self._set_cached(cache_key, distances, ttl=86400)
            
            return distances
            
        except Exception as e:
            logger.error(f"Failed to get distance matrix: {e}")
            # Return haversine distances as fallback
            n = len(locations)
            matrix = [[0.0] * n for _ in range(n)]
            for i in range(n):
                for j in range(n):
                    if i != j:
                        matrix[i][j] = self._haversine(locations[i], locations[j])
            return matrix
    
    async def route_between_points(
        self,
        start: List[float],
        end: List[float],
        profile: str = "driving-car",
        steps: bool = False
    ) -> List[List[float]]:
        """
        Get route coordinates between two points for stitching SCC circuits.
        
        Args:
            start: [lon, lat] list
            end: [lon, lat] list  
            profile: routing profile
            steps: whether to include turn-by-turn steps
        
        Returns:
            List of [lon, lat] coordinates for direct stitching
        """
        
        # Trivial case - same point
        if start == end:
            return [start]
        
        # If ORS is not enabled, return straight line with warning
        if not self.enabled:
            logger.warning("ORS not enabled (no API key), using straight-line connector")
            return [start, end]
        
        # Try to get route from ORS
        try:
            coords, _ = await self.get_route(
                tuple(start),
                tuple(end),
                profile=profile
            )
            return coords
            
        except Exception as e:
            logger.warning(f"Failed to get route between points: {e}")
            logger.warning("Falling back to straight-line connector")
            return [start, end]
    
    def _haversine(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calculate haversine distance in meters"""
        from math import radians, sin, cos, atan2, sqrt
        
        lon1, lat1 = p1
        lon2, lat2 = p2
        
        R = 6371000  # Earth radius in meters
        
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        lat1_rad = radians(lat1)
        lat2_rad = radians(lat2)
        
        a = sin(dlat/2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c
    
    async def _get_cached(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.cache:
            return None
        
        try:
            value = await self.cache.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.warning(f"Cache get error: {e}")
        
        return None
    
    async def _set_cached(self, key: str, value: Any, ttl: int = 3600):
        """Set value in cache with TTL"""
        if not self.cache:
            return
        
        try:
            await self.cache.set(key, json.dumps(value), ex=ttl)
        except Exception as e:
            logger.warning(f"Cache set error: {e}")


