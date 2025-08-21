"""
Graph builder for street network with proper intersection detection
"""

import logging
from typing import Dict, Any, List, Tuple, Optional
import networkx as nx
from shapely.geometry import LineString, Point, MultiLineString
from shapely.ops import linemerge, unary_union, split, snap
from shapely.strtree import STRtree
from pyproj import Geod, Transformer
import numpy as np

from app.config import settings

logger = logging.getLogger(__name__)

# Geodesic calculator for accurate distances
GEOD = Geod(ellps="WGS84")


class GraphBuilder:
    """Builds proper street graph with intersection detection"""
    
    def __init__(self, snap_tolerance: float = None):
        self.snap_tolerance = snap_tolerance or settings.snap_tolerance
        
    def build_street_graph(
        self,
        streets_geojson: Dict[str, Any],
        area_center: Optional[Tuple[float, float]] = None
    ) -> nx.MultiDiGraph:
        """
        Build a proper street graph from GeoJSON features
        
        Args:
            streets_geojson: GeoJSON FeatureCollection of streets
            area_center: (lon, lat) center for projection selection
        
        Returns:
            NetworkX MultiDiGraph with proper topology
        """
        
        features = streets_geojson.get('features', [])
        if not features:
            logger.warning("No street features to process")
            return nx.MultiDiGraph()
        
        logger.info(f"Building graph from {len(features)} street features")
        
        # Step 1: Extract LineStrings and properties
        lines, props_list = self._extract_lines_and_props(features)
        
        if not lines:
            logger.warning("No valid LineStrings found")
            return nx.MultiDiGraph()
        
        # Step 2: Determine appropriate projection
        if not area_center:
            area_center = self._get_center(lines)
        
        # Step 3: Split streets at intersections
        segments = self._split_at_intersections(lines, area_center)
        logger.info(f"Split {len(lines)} streets into {len(segments)} segments")
        
        # Step 4: Build graph from segments
        G = self._build_graph_from_segments(segments, props_list)
        
        # Log graph statistics
        logger.info(f"Built graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
        
        # Validate graph
        if not G.number_of_nodes():
            logger.error("Graph has no nodes!")
        
        return G
    
    def _extract_lines_and_props(
        self,
        features: List[Dict[str, Any]]
    ) -> Tuple[List[LineString], List[Dict[str, Any]]]:
        """Extract LineString geometries and their properties"""
        
        lines = []
        props_list = []
        
        for feature in features:
            geom = feature.get('geometry', {})
            props = feature.get('properties', {})
            
            if geom.get('type') != 'LineString':
                continue
            
            coords = geom.get('coordinates', [])
            if len(coords) < 2:
                continue
            
            try:
                line = LineString(coords)
                if line.is_valid and line.length > 0:
                    lines.append(line)
                    props_list.append(props)
            except Exception as e:
                logger.warning(f"Invalid LineString: {e}")
        
        return lines, props_list
    
    def _get_center(self, lines: List[LineString]) -> Tuple[float, float]:
        """Get center point of all lines"""
        
        all_points = []
        for line in lines:
            all_points.extend(list(line.coords))
        
        if not all_points:
            return (0, 0)
        
        lons = [p[0] for p in all_points]
        lats = [p[1] for p in all_points]
        
        return (np.mean(lons), np.mean(lats))
    
    def _get_utm_zone(self, lon: float, lat: float) -> str:
        """Get appropriate UTM zone EPSG code for location"""
        
        zone_num = int((lon + 180) / 6) + 1
        
        if lat >= 0:
            epsg = f"EPSG:326{zone_num:02d}"  # Northern hemisphere
        else:
            epsg = f"EPSG:327{zone_num:02d}"  # Southern hemisphere
        
        return epsg
    
    def _split_at_intersections(
        self,
        lines: List[LineString],
        center: Tuple[float, float]
    ) -> List[LineString]:
        """Split LineStrings at all intersections"""
        
        if not lines:
            return []
        
        # Get appropriate UTM projection for accurate geometry operations
        utm_zone = self._get_utm_zone(center[0], center[1])
        
        # Create transformers
        to_utm = Transformer.from_crs("EPSG:4326", utm_zone, always_xy=True)
        from_utm = Transformer.from_crs(utm_zone, "EPSG:4326", always_xy=True)
        
        # Transform to projected coordinates
        projected_lines = []
        for line in lines:
            coords = list(line.coords)
            proj_coords = [to_utm.transform(x, y) for x, y in coords]
            projected_lines.append(LineString(proj_coords))
        
        # Snap nearby vertices to avoid hairline gaps
        snap_tolerance_m = 0.5  # 0.5 meter tolerance
        
        # Build spatial index for efficiency
        tree = STRtree(projected_lines)
        
        # Split lines at intersections
        split_segments = []
        
        for i, line in enumerate(projected_lines):
            # Find all potentially intersecting lines
            candidates = tree.query(line.buffer(snap_tolerance_m))
            
            # Collect all intersection points
            split_points = []
            
            for other in candidates:
                if other is line:
                    continue
                
                # Snap for cleaner intersections
                snapped_other = snap(other, line, snap_tolerance_m)
                
                if line.intersects(snapped_other):
                    intersection = line.intersection(snapped_other)
                    
                    # Extract points from intersection
                    if isinstance(intersection, Point):
                        split_points.append(intersection)
                    elif hasattr(intersection, 'geoms'):
                        for geom in intersection.geoms:
                            if isinstance(geom, Point):
                                split_points.append(geom)
            
            # Split line at intersection points
            if split_points:
                # Sort points along the line
                distances = [line.project(pt) for pt in split_points]
                sorted_points = [pt for _, pt in sorted(zip(distances, split_points))]
                
                # Split the line
                segments = self._split_line_at_points(line, sorted_points)
                split_segments.extend(segments)
            else:
                split_segments.append(line)
        
        # Transform back to WGS84
        wgs84_segments = []
        for seg in split_segments:
            if seg.length > 0:  # Skip zero-length segments
                coords = list(seg.coords)
                wgs_coords = [from_utm.transform(x, y) for x, y in coords]
                wgs84_segments.append(LineString(wgs_coords))
        
        return wgs84_segments
    
    def _split_line_at_points(
        self,
        line: LineString,
        points: List[Point]
    ) -> List[LineString]:
        """Split a line at multiple points"""
        
        segments = []
        current_line = line
        
        for point in points:
            if not current_line or current_line.length == 0:
                break
            
            # Project point onto line
            distance = current_line.project(point)
            
            if distance <= 0 or distance >= current_line.length:
                continue
            
            # Split at point
            coords = list(current_line.coords)
            
            # Interpolate point on line
            split_point = current_line.interpolate(distance)
            
            # Create two segments
            seg1_coords = []
            seg2_coords = []
            split_added = False
            
            for i in range(len(coords) - 1):
                p1 = Point(coords[i])
                p2 = Point(coords[i + 1])
                
                seg1_coords.append(coords[i])
                
                # Check if split point is on this segment
                line_seg = LineString([coords[i], coords[i + 1]])
                if line_seg.distance(split_point) < 1e-6 and not split_added:
                    seg1_coords.append(split_point.coords[0])
                    seg2_coords = [split_point.coords[0]] + coords[i + 1:]
                    split_added = True
                    break
            
            if seg1_coords and len(seg1_coords) >= 2:
                segments.append(LineString(seg1_coords))
            
            if seg2_coords and len(seg2_coords) >= 2:
                current_line = LineString(seg2_coords)
            else:
                break
        
        # Add remaining segment
        if current_line and current_line.length > 0:
            segments.append(current_line)
        
        return segments if segments else [line]
    
    def _build_graph_from_segments(
        self,
        segments: List[LineString],
        props_list: List[Dict[str, Any]]
    ) -> nx.MultiDiGraph:
        """Build MultiDiGraph from segments"""
        
        G = nx.MultiDiGraph()
        
        # Build node index for snapping
        node_index = {}
        tolerance = self.snap_tolerance
        
        def get_or_create_node(point: Tuple[float, float]) -> Tuple[float, float]:
            """Get existing node or create new one with snapping"""
            
            # Check for nearby existing node
            for node in node_index.keys():
                if abs(node[0] - point[0]) < tolerance and abs(node[1] - point[1]) < tolerance:
                    return node
            
            # Create new node
            node_index[point] = True
            return point
        
        # Add edges for each segment
        for seg in segments:
            coords = list(seg.coords)
            
            if len(coords) < 2:
                continue
            
            # Get or create nodes
            start = get_or_create_node((coords[0][0], coords[0][1]))
            end = get_or_create_node((coords[-1][0], coords[-1][1]))
            
            # Calculate accurate geodesic length
            length_m = self._geodesic_length(coords)
            
            # Find best matching properties (simplified - could use spatial matching)
            props = props_list[0] if props_list else {}
            
            # Determine speed for time estimation
            highway = props.get('highway', 'residential')
            maxspeed = props.get('maxspeed', '')
            speed_mps = self._get_speed_mps(highway, maxspeed)
            
            # Create edge data
            edge_data = {
                'length': length_m,
                'time': length_m / speed_mps,
                'geometry': coords,
                'highway': highway,
                'name': props.get('name', ''),
                'oneway': props.get('oneway', False),
                'osm_id': props.get('osm_id', ''),
                'maxspeed': maxspeed
            }
            
            # Add edge(s)
            G.add_edge(start, end, **edge_data)
            
            # Add reverse edge if not one-way
            if not props.get('oneway', False):
                reverse_data = edge_data.copy()
                reverse_data['geometry'] = list(reversed(coords))
                G.add_edge(end, start, **reverse_data)
        
        return G
    
    def _geodesic_length(self, coords: List[Tuple[float, float]]) -> float:
        """Calculate accurate geodesic length in meters"""
        
        if len(coords) < 2:
            return 0.0
        
        total_length = 0.0
        
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i + 1]
            
            # Calculate geodesic distance
            _, _, distance = GEOD.inv(lon1, lat1, lon2, lat2)
            total_length += distance
        
        return total_length
    
    def _get_speed_mps(self, highway: str, maxspeed: str) -> float:
        """Get estimated speed in meters per second"""
        
        # Try to parse maxspeed
        if maxspeed:
            try:
                if 'mph' in maxspeed.lower():
                    speed_mph = float(maxspeed.lower().replace('mph', '').strip())
                    return speed_mph * 0.44704  # Convert to m/s
                else:
                    speed_kmh = float(maxspeed.replace('km/h', '').strip())
                    return speed_kmh / 3.6  # Convert to m/s
            except:
                pass
        
        # Default speeds by highway type (m/s)
        speed_defaults = {
            'motorway': 30.0,      # ~110 km/h
            'trunk': 25.0,         # ~90 km/h
            'primary': 20.0,       # ~70 km/h
            'secondary': 15.0,     # ~55 km/h
            'tertiary': 12.0,      # ~45 km/h
            'residential': 8.0,    # ~30 km/h
            'service': 5.0,        # ~20 km/h
            'living_street': 3.0,  # ~10 km/h
        }
        
        return speed_defaults.get(highway, 10.0)  # Default ~35 km/h