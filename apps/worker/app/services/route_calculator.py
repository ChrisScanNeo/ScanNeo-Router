"""
Route calculation using proper Chinese Postman algorithm
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
import json
import networkx as nx
from pyproj import Geod

from app.config import settings
from app.services.graph_builder import GraphBuilder
from app.services.route_connector import RouteConnector
from app.services.ors_client import ORSClient

logger = logging.getLogger(__name__)

# Geodesic calculator
GEOD = Geod(ellps="WGS84")


class RouteCalculator:
    """Calculates optimal coverage routes using proper CPP"""
    
    def __init__(self, ors_client: ORSClient = None, cache=None):
        self.graph_builder = GraphBuilder()
        self.ors_client = ors_client or ORSClient(cache=cache)
        self.route_connector = RouteConnector(self.ors_client)
        self.max_gap = settings.max_gap_meters
    
    async def calculate_route(
        self,
        streets_geojson: Dict[str, Any],
        profile: str = 'driving-car'
    ) -> Dict[str, Any]:
        """
        Calculate optimal route covering all streets using Chinese Postman Problem
        
        Args:
            streets_geojson: GeoJSON FeatureCollection of streets
            profile: Routing profile (driving-car, driving-hgv, etc.)
        
        Returns:
            Dictionary with route geometry, length, time, and diagnostics
        """
        
        try:
            logger.info("Starting route calculation with proper CPP algorithm")
            
            diagnostics = {
                'input_streets': len(streets_geojson.get('features', [])),
                'profile': profile
            }
            
            # Step 1: Build proper street graph with intersection detection
            logger.info("Building street graph with intersection detection...")
            G = self.graph_builder.build_street_graph(streets_geojson)
            
            if not G or G.number_of_edges() == 0:
                raise ValueError("No valid street network found")
            
            diagnostics['graph_nodes'] = G.number_of_nodes()
            diagnostics['graph_edges'] = G.number_of_edges()
            diagnostics['components_before'] = nx.number_weakly_connected_components(G)
            
            logger.info(f"Built graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
            
            # Step 2: Connect disconnected components
            logger.info("Connecting disconnected components...")
            G = await self.route_connector.connect_components(G)
            
            diagnostics['components_after'] = nx.number_weakly_connected_components(G)
            diagnostics['is_connected'] = nx.is_weakly_connected(G)
            
            if not nx.is_weakly_connected(G):
                logger.warning("Graph still disconnected after connection attempts")
            
            # Step 3: Make graph Eulerian using minimum-weight matching
            logger.info("Making graph Eulerian...")
            G_eulerian, matching_stats = await self._make_eulerian(G)
            
            diagnostics.update(matching_stats)
            
            # Step 4: Validate all nodes have even degree
            if not self._validate_eulerian(G_eulerian):
                logger.error("Eulerization failed - not all nodes have even degree")
                raise ValueError("Failed to create Eulerian graph")
            
            # Step 5: Find Eulerian circuit
            logger.info("Finding Eulerian circuit...")
            circuit = self._find_eulerian_circuit(G_eulerian)
            
            if not circuit:
                raise ValueError("Could not find Eulerian circuit")
            
            diagnostics['circuit_edges'] = len(circuit)
            
            # Step 6: Assemble continuous, driveable route
            logger.info("Assembling continuous route...")
            route_coords = await self.route_connector.bridge_route_gaps(G_eulerian, circuit)
            
            if not route_coords:
                raise ValueError("Failed to assemble route")
            
            diagnostics['route_points'] = len(route_coords)
            
            # Step 7: Validate continuity
            is_valid, violations = self.route_connector.validate_route_continuity(route_coords)
            
            diagnostics['continuity_valid'] = is_valid
            diagnostics['continuity_violations'] = len(violations)
            
            if violations:
                max_gap = max(v[1] for v in violations)
                diagnostics['max_gap_m'] = max_gap
                
                if max_gap > self.max_gap:
                    logger.error(f"Route has unacceptable gap: {max_gap:.1f}m")
            
            # Calculate route statistics
            length_m, time_s = self._calculate_route_stats(route_coords, profile)
            
            # Prepare result
            result = {
                'geometry': {
                    'type': 'LineString',
                    'coordinates': route_coords
                },
                'length_m': length_m,
                'drive_time_s': time_s,
                'diagnostics': diagnostics,
                'valid': is_valid
            }
            
            logger.info(f"Route calculated: {length_m:.0f}m, {time_s:.0f}s, valid={is_valid}")
            
            return result
            
        except Exception as e:
            logger.error(f"Route calculation failed: {e}", exc_info=True)
            raise
    
    async def _make_eulerian(self, G: nx.MultiDiGraph) -> Tuple[nx.MultiDiGraph, Dict]:
        """
        Make graph Eulerian using minimum-weight perfect matching
        
        Returns:
            (Eulerian graph, matching statistics)
        """
        
        stats = {}
        
        # Work with undirected view for degree parity
        UG = G.to_undirected()
        
        # Find nodes with odd degree
        odd_nodes = [n for n in UG.nodes() if UG.degree(n) % 2 == 1]
        stats['odd_nodes'] = len(odd_nodes)
        
        if not odd_nodes:
            logger.info("Graph is already Eulerian")
            return G.copy(), stats
        
        logger.info(f"Found {len(odd_nodes)} nodes with odd degree")
        
        # Must have even number of odd-degree nodes (handshaking lemma)
        if len(odd_nodes) % 2 != 0:
            logger.error(f"Odd number of odd-degree nodes: {len(odd_nodes)}")
            raise ValueError("Graph has odd number of odd-degree nodes")
        
        # Compute all-pairs shortest paths between odd nodes
        logger.info("Computing shortest paths between odd nodes...")
        
        # Use weight='length' for distance-based matching
        sp_paths = {}
        sp_lengths = {}
        
        for u in odd_nodes:
            sp_paths[u] = {}
            sp_lengths[u] = {}
            for v in odd_nodes:
                if u != v:
                    try:
                        sp_paths[u][v] = nx.shortest_path(UG, u, v, weight='length')
                        sp_lengths[u][v] = nx.shortest_path_length(UG, u, v, weight='length')
                    except nx.NetworkXNoPath:
                        logger.warning(f"No path between {u} and {v}")
                        sp_lengths[u][v] = float('inf')
        
        # Build complete graph on odd nodes
        K = nx.Graph()
        for i, u in enumerate(odd_nodes):
            for v in odd_nodes[i+1:]:
                if u in sp_lengths and v in sp_lengths[u]:
                    weight = sp_lengths[u][v]
                    if weight < float('inf'):
                        K.add_edge(u, v, weight=weight)
        
        if K.number_of_edges() < len(odd_nodes) // 2:
            logger.error("Not enough connections for perfect matching")
            raise ValueError("Cannot create perfect matching")
        
        # Find minimum-weight perfect matching
        logger.info("Finding minimum-weight perfect matching...")
        
        try:
            # Use min_weight_matching directly (clearer than negative weights)
            matching = nx.algorithms.matching.min_weight_matching(K, weight='weight')
            stats['matched_pairs'] = len(matching)
            
        except Exception as e:
            logger.error(f"Matching failed: {e}")
            raise ValueError(f"Could not find perfect matching: {e}")
        
        # Duplicate edges along shortest paths
        logger.info(f"Duplicating edges for {len(matching)} matched pairs")
        
        G_eulerian = G.copy()
        total_duplicated_length = 0
        
        for u, v in matching:
            if u in sp_paths and v in sp_paths[u]:
                path = sp_paths[u][v]
                
                # Duplicate edges along path
                for i in range(len(path) - 1):
                    a, b = path[i], path[i+1]
                    
                    # Find the original edge to duplicate
                    if G.has_edge(a, b):
                        edge_data = list(G.get_edge_data(a, b).values())[0]
                        G_eulerian.add_edge(a, b, **edge_data)
                        total_duplicated_length += edge_data.get('length', 0)
                    elif G.has_edge(b, a):
                        edge_data = list(G.get_edge_data(b, a).values())[0]
                        G_eulerian.add_edge(b, a, **edge_data)
                        total_duplicated_length += edge_data.get('length', 0)
        
        stats['duplicated_length_m'] = total_duplicated_length
        stats['edges_after'] = G_eulerian.number_of_edges()
        
        # Calculate deadhead ratio
        original_length = sum(d.get('length', 0) for _, _, d in G.edges(data=True))
        if original_length > 0:
            stats['deadhead_ratio'] = total_duplicated_length / original_length
        else:
            stats['deadhead_ratio'] = 0
        
        logger.info(f"Added {G_eulerian.number_of_edges() - G.number_of_edges()} duplicate edges")
        logger.info(f"Deadhead ratio: {stats['deadhead_ratio']:.2%}")
        
        return G_eulerian, stats
    
    def _validate_eulerian(self, G: nx.MultiDiGraph) -> bool:
        """Validate that all nodes have even degree"""
        
        UG = G.to_undirected()
        
        for node in UG.nodes():
            if UG.degree(node) % 2 != 0:
                logger.error(f"Node {node} has odd degree: {UG.degree(node)}")
                return False
        
        logger.info("All nodes have even degree - graph is Eulerian")
        return True
    
    def _find_eulerian_circuit(self, G: nx.MultiDiGraph) -> List[Tuple]:
        """Find Eulerian circuit using Hierholzer's algorithm"""
        
        try:
            # Use undirected view for circuit finding
            UG = G.to_undirected(as_view=False)
            
            # Ensure connected
            if not nx.is_connected(UG):
                # Use largest component
                largest_cc = max(nx.connected_components(UG), key=len)
                UG = UG.subgraph(largest_cc).copy()
                logger.warning(f"Using largest component with {len(largest_cc)} nodes")
            
            # Find Eulerian circuit
            circuit = list(nx.eulerian_circuit(UG))
            
            logger.info(f"Found Eulerian circuit with {len(circuit)} edges")
            return circuit
            
        except Exception as e:
            logger.error(f"Failed to find Eulerian circuit: {e}")
            # Return edges as fallback
            return list(G.edges())
    
    def _calculate_route_stats(
        self,
        coords: List[List[float]],
        profile: str
    ) -> Tuple[float, float]:
        """Calculate route length and estimated time"""
        
        if not coords or len(coords) < 2:
            return 0.0, 0.0
        
        total_length = 0.0
        
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i+1]
            
            # Calculate geodesic distance
            _, _, distance = GEOD.inv(lon1, lat1, lon2, lat2)
            total_length += distance
        
        # Estimate time based on profile
        speed_by_profile = {
            'driving-car': 10.0,      # 36 km/h average city
            'driving-hgv': 8.0,       # 29 km/h for trucks
            'cycling-regular': 4.0,    # 14 km/h
            'foot-walking': 1.4,      # 5 km/h
        }
        
        avg_speed_mps = speed_by_profile.get(profile, 10.0)
        total_time = total_length / avg_speed_mps
        
        return total_length, total_time
    
    def split_into_chunks(
        self,
        route_coords: List[List[float]],
        chunk_duration_s: int,
        profile: str = 'driving-car'
    ) -> List[Dict[str, Any]]:
        """
        Split route into time-based chunks
        
        Args:
            route_coords: Complete route coordinates
            chunk_duration_s: Target duration per chunk in seconds
            profile: Routing profile for speed estimation
        
        Returns:
            List of route chunks
        """
        
        if not route_coords or len(route_coords) < 2:
            return []
        
        chunks = []
        current_chunk = []
        current_time = 0.0
        current_length = 0.0
        
        # Speed for time calculation
        speed_by_profile = {
            'driving-car': 10.0,
            'driving-hgv': 8.0,
            'cycling-regular': 4.0,
            'foot-walking': 1.4,
        }
        avg_speed_mps = speed_by_profile.get(profile, 10.0)
        
        for i in range(len(route_coords) - 1):
            current_chunk.append(route_coords[i])
            
            # Calculate segment length
            lon1, lat1 = route_coords[i]
            lon2, lat2 = route_coords[i+1]
            _, _, segment_length = GEOD.inv(lon1, lat1, lon2, lat2)
            segment_time = segment_length / avg_speed_mps
            
            current_length += segment_length
            current_time += segment_time
            
            # Check if chunk is complete
            if current_time >= chunk_duration_s:
                # Complete current chunk
                current_chunk.append(route_coords[i+1])
                
                chunk = {
                    'chunk_id': len(chunks),
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': current_chunk
                    },
                    'length_m': current_length,
                    'time_s': current_time,
                    'start_point': current_chunk[0],
                    'end_point': current_chunk[-1]
                }
                chunks.append(chunk)
                
                # Start new chunk
                current_chunk = [route_coords[i+1]]
                current_time = 0.0
                current_length = 0.0
        
        # Add remaining points as final chunk
        if len(current_chunk) > 1:
            chunk = {
                'chunk_id': len(chunks),
                'geometry': {
                    'type': 'LineString',
                    'coordinates': current_chunk
                },
                'length_m': current_length,
                'time_s': current_time,
                'start_point': current_chunk[0],
                'end_point': current_chunk[-1]
            }
            chunks.append(chunk)
        
        logger.info(f"Split route into {len(chunks)} chunks")
        
        return chunks