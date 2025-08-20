"""
OpenStreetMap data fetcher using Overpass API
"""

import logging
import json
from typing import Dict, Any, List, Optional
import httpx
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import transform
import pyproj

from app.config import settings

logger = logging.getLogger(__name__)


class OSMFetcher:
    """Fetches street network data from OpenStreetMap"""
    
    def __init__(self):
        self.overpass_url = settings.overpass_url
        self.timeout = 180  # 3 minutes for large areas
    
    async def fetch_streets(
        self,
        area_geojson: Dict[str, Any],
        buffer_m: int = 0
    ) -> Dict[str, Any]:
        """
        Fetch street network from OSM for given area
        
        Args:
            area_geojson: GeoJSON geometry of the area
            buffer_m: Buffer distance in meters
        
        Returns:
            GeoJSON FeatureCollection of streets
        """
        try:
            # Convert GeoJSON to shapely geometry
            geom = shape(area_geojson)
            
            # Apply buffer if specified
            if buffer_m > 0:
                # Project to metric CRS for accurate buffering
                project = pyproj.Transformer.from_crs(
                    'EPSG:4326', 'EPSG:3857', always_xy=True
                ).transform
                geom_projected = transform(project, geom)
                geom_buffered = geom_projected.buffer(buffer_m)
                
                # Project back to WGS84
                project_back = pyproj.Transformer.from_crs(
                    'EPSG:3857', 'EPSG:4326', always_xy=True
                ).transform
                geom = transform(project_back, geom_buffered)
            
            # Get bounding box for Overpass query
            bounds = geom.bounds  # (minx, miny, maxx, maxy)
            bbox = f"{bounds[1]},{bounds[0]},{bounds[3]},{bounds[2]}"
            
            # Build Overpass query for driveable roads
            query = self._build_overpass_query(bbox)
            
            logger.info(f"Fetching streets for bbox: {bbox}")
            
            # Execute query
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.overpass_url,
                    data={'data': query},
                    headers={'Accept': 'application/json'}
                )
                response.raise_for_status()
                data = response.json()
            
            # Convert OSM data to GeoJSON
            features = self._osm_to_geojson(data, geom)
            
            return {
                'type': 'FeatureCollection',
                'features': features
            }
            
        except Exception as e:
            logger.error(f"Failed to fetch streets: {e}")
            raise
    
    def _build_overpass_query(self, bbox: str) -> str:
        """Build Overpass QL query for streets"""
        return f"""
        [out:json][timeout:180];
        (
          // Get all roads suitable for driving
          way["highway"]["highway"!~"footway|path|steps|pedestrian|track|service|cycleway"]({bbox});
        );
        out geom;
        """
    
    def _osm_to_geojson(
        self,
        osm_data: Dict[str, Any],
        area_geom: Any
    ) -> List[Dict[str, Any]]:
        """Convert OSM response to GeoJSON features"""
        features = []
        
        for element in osm_data.get('elements', []):
            if element['type'] != 'way':
                continue
            
            # Extract coordinates
            coords = []
            if 'geometry' in element:
                for node in element['geometry']:
                    coords.append([node['lon'], node['lat']])
            
            if len(coords) < 2:
                continue
            
            # Create LineString feature
            feature = {
                'type': 'Feature',
                'properties': {
                    'osm_id': element['id'],
                    'highway': element.get('tags', {}).get('highway', 'unknown'),
                    'name': element.get('tags', {}).get('name', ''),
                    'oneway': element.get('tags', {}).get('oneway', 'no') == 'yes',
                    'maxspeed': element.get('tags', {}).get('maxspeed', ''),
                    'lanes': element.get('tags', {}).get('lanes', ''),
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': coords
                }
            }
            
            features.append(feature)
        
        logger.info(f"Converted {len(features)} OSM ways to GeoJSON features")
        return features
    
    async def fetch_streets_mock(
        self,
        area_geojson: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Mock implementation for testing
        Returns a simple grid of streets
        """
        # Get bounds of area
        geom = shape(area_geojson)
        bounds = geom.bounds
        
        # Create a simple grid of streets
        features = []
        
        # Horizontal streets
        for i in range(5):
            lat = bounds[1] + (bounds[3] - bounds[1]) * i / 4
            features.append({
                'type': 'Feature',
                'properties': {
                    'osm_id': f'mock_h_{i}',
                    'highway': 'residential',
                    'name': f'Street {i+1}',
                    'oneway': False
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [
                        [bounds[0], lat],
                        [bounds[2], lat]
                    ]
                }
            })
        
        # Vertical streets
        for i in range(5):
            lon = bounds[0] + (bounds[2] - bounds[0]) * i / 4
            features.append({
                'type': 'Feature',
                'properties': {
                    'osm_id': f'mock_v_{i}',
                    'highway': 'residential',
                    'name': f'Avenue {chr(65+i)}',
                    'oneway': False
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [
                        [lon, bounds[1]],
                        [lon, bounds[3]]
                    ]
                }
            })
        
        return {
            'type': 'FeatureCollection',
            'features': features
        }