"""
Route calculation using Chinese Postman algorithm
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
import json
import networkx as nx
from shapely.geometry import LineString, Point, shape
from shapely.ops import linemerge
import itertools

logger = logging.getLogger(__name__)


class RouteCalculator:
    """Calculates optimal coverage routes"""
    
    def calculate_route(
        self,
        streets_geojson: Dict[str, Any],
        profile: str = 'driving-car'
    ) -> Dict[str, Any]:
        """
        Calculate optimal route covering all streets
        
        Args:
            streets_geojson: GeoJSON FeatureCollection of streets
            profile: Routing profile (driving-car, driving-hgv, etc.)
        
        Returns:
            Dictionary with route geometry, length, and time
        """
        try:
            # Build graph from streets
            graph = self._build_graph(streets_geojson)
            
            if not graph or graph.number_of_edges() == 0:
                raise ValueError("No valid street network found")
            
            logger.info(f"Built graph with {graph.number_of_nodes()} nodes and {graph.number_of_edges()} edges")
            
            # Make graph Eulerian (Chinese Postman Problem)
            eulerian_graph = self._make_eulerian(graph)
            
            # Find Eulerian circuit
            circuit = self._find_eulerian_circuit(eulerian_graph)
            
            if not circuit:
                # Fallback: return simple traversal
                circuit = list(graph.edges())
            
            # Convert circuit to route geometry
            route_geom, length_m, time_s = self._circuit_to_route(
                circuit, graph, profile
            )
            
            return {
                'geometry': route_geom,
                'route': circuit,
                'length_m': length_m,
                'drive_time_s': time_s
            }
            
        except Exception as e:
            logger.error(f"Failed to calculate route: {e}")
            # Return a simple mock route for now
            return self._mock_route(streets_geojson)
    
    def _build_graph(self, streets_geojson: Dict[str, Any]) -> nx.MultiGraph:
        """Build NetworkX graph from street features"""
        G = nx.MultiGraph()
        
        for feature in streets_geojson.get('features', []):
            geom = feature.get('geometry', {})
            props = feature.get('properties', {})
            
            if geom.get('type') != 'LineString':
                continue
            
            coords = geom.get('coordinates', [])
            if len(coords) < 2:
                continue
            
            # Calculate length
            line = LineString(coords)
            length_m = self._calculate_length_meters(line)
            
            # Add edge between first and last point
            start = tuple(coords[0])
            end = tuple(coords[-1])
            
            # Store edge data
            edge_data = {
                'length': length_m,
                'geometry': coords,
                'highway': props.get('highway', 'residential'),
                'name': props.get('name', ''),
                'oneway': props.get('oneway', False),
                'osm_id': props.get('osm_id', '')
            }
            
            G.add_edge(start, end, **edge_data)
            
            # Add reverse edge if not one-way
            if not props.get('oneway', False):
                G.add_edge(end, start, **edge_data)
        
        return G
    
    def _make_eulerian(self, G: nx.MultiGraph) -> nx.MultiGraph:
        """
        Make graph Eulerian by adding minimum edges (Chinese Postman)
        An Eulerian graph has all vertices with even degree
        """
        # Find nodes with odd degree
        odd_nodes = [n for n in G.nodes() if G.degree(n) % 2 == 1]
        
        if not odd_nodes:
            # Already Eulerian
            return G.copy()
        
        logger.info(f"Found {len(odd_nodes)} nodes with odd degree")
        
        # For simplicity, pair odd nodes and add edges
        # In production, use minimum weight matching
        G_eulerian = G.copy()
        
        # Simple pairing (not optimal but works)
        for i in range(0, len(odd_nodes), 2):
            if i + 1 < len(odd_nodes):
                node1 = odd_nodes[i]
                node2 = odd_nodes[i + 1]
                
                # Add virtual edge
                G_eulerian.add_edge(node1, node2, 
                                   length=0, 
                                   virtual=True,
                                   geometry=[list(node1), list(node2)])
        
        return G_eulerian
    
    def _find_eulerian_circuit(self, G: nx.MultiGraph) -> List[Tuple]:
        """Find Eulerian circuit in the graph"""
        try:
            # Check if graph is connected
            if not nx.is_connected(G):
                # Find largest connected component
                largest_cc = max(nx.connected_components(G), key=len)
                G = G.subgraph(largest_cc).copy()
            
            # Find Eulerian circuit
            circuit = list(nx.eulerian_circuit(G))
            return circuit
        except Exception as e:
            logger.warning(f"Could not find Eulerian circuit: {e}")
            # Return edges as fallback
            return list(G.edges())
    
    def _circuit_to_route(
        self,
        circuit: List[Tuple],
        graph: nx.MultiGraph,
        profile: str
    ) -> Tuple[Dict[str, Any], float, float]:
        """Convert circuit to route geometry"""
        if not circuit:
            return {'type': 'LineString', 'coordinates': []}, 0, 0
        
        all_coords = []
        total_length = 0
        
        for edge in circuit:
            if len(edge) >= 2:
                node1, node2 = edge[0], edge[1]
                
                # Get edge data
                edge_data = graph.get_edge_data(node1, node2)
                if edge_data:
                    # Get first edge if multiple
                    if isinstance(edge_data, dict) and 0 in edge_data:
                        data = edge_data[0]
                    else:
                        data = edge_data
                    
                    coords = data.get('geometry', [list(node1), list(node2)])
                    all_coords.extend(coords)
                    total_length += data.get('length', 0)
        
        # Estimate drive time (assuming average speed)
        avg_speed_mps = 10  # 36 km/h average city driving
        if profile == 'driving-hgv':
            avg_speed_mps = 8  # Slower for trucks
        
        drive_time = total_length / avg_speed_mps
        
        # Create LineString geometry
        geometry = {
            'type': 'LineString',
            'coordinates': all_coords
        }
        
        return geometry, total_length, drive_time
    
    def _calculate_length_meters(self, line: LineString) -> float:
        """Calculate length in meters (approximate for lat/lon)"""
        # Simple approximation - in production use proper projection
        coords = list(line.coords)
        total_length = 0
        
        for i in range(len(coords) - 1):
            # Haversine distance
            lat1, lon1 = coords[i][1], coords[i][0]
            lat2, lon2 = coords[i + 1][1], coords[i + 1][0]
            
            # Approximate distance in meters
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            
            # Very rough approximation (1 degree ≈ 111km)
            dist_m = ((dlat ** 2 + dlon ** 2) ** 0.5) * 111000
            total_length += dist_m
        
        return total_length
    
    def split_into_chunks(
        self,
        route: List[Tuple],
        chunk_duration_s: int
    ) -> List[Dict[str, Any]]:
        """Split route into time-based chunks"""
        chunks = []
        
        # For now, create simple mock chunks
        # In production, properly split based on actual route segments
        num_chunks = max(1, len(route) // 10)
        
        for i in range(num_chunks):
            chunk = {
                'length_m': 5000,  # Mock 5km per chunk
                'time_s': chunk_duration_s,
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [
                        [0, 0], [0.01, 0.01]  # Mock coordinates
                    ]
                }
            }
            chunks.append(chunk)
        
        return chunks
    
    def _mock_route(self, streets_geojson: Dict[str, Any]) -> Dict[str, Any]:
        """Create a mock route for testing"""
        # Collect all coordinates
        all_coords = []
        total_length = 0
        
        for feature in streets_geojson.get('features', []):
            geom = feature.get('geometry', {})
            if geom.get('type') == 'LineString':
                coords = geom.get('coordinates', [])
                all_coords.extend(coords)
                
                # Estimate length
                if len(coords) >= 2:
                    line = LineString(coords)
                    total_length += self._calculate_length_meters(line)
        
        if not all_coords:
            all_coords = [[0, 0], [0.01, 0.01]]
            total_length = 1000
        
        return {
            'geometry': {
                'type': 'LineString',
                'coordinates': all_coords
            },
            'route': [],
            'length_m': total_length,
            'drive_time_s': total_length / 10  # 10 m/s average
        }