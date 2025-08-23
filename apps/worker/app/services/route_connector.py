"""
Route connector for joining disconnected street components
"""

import logging
from typing import Dict, Any, List, Tuple, Optional
import networkx as nx
import itertools
from pyproj import Geod

from app.services.ors_client import ORSClient
from app.config import settings

logger = logging.getLogger(__name__)

# Geodesic calculator
GEOD = Geod(ellps="WGS84")


class RouteConnector:
    """Connects disconnected components in street graph"""
    
    def __init__(self, ors_client: ORSClient):
        self.ors_client = ors_client
        self.max_gap = settings.max_gap_meters
    
    async def connect_components(
        self,
        G: nx.MultiDiGraph,
        max_candidates: int = 5
    ) -> nx.MultiDiGraph:
        """
        Connect disconnected components using ORS routing
        
        Args:
            G: Street graph with potentially disconnected components
            max_candidates: Maximum candidate pairs to consider per component
        
        Returns:
            Connected graph
        """
        
        # Check if already connected
        if nx.is_weakly_connected(G):
            logger.info("Graph is already connected")
            return G
        
        # Get weakly connected components
        components = list(nx.weakly_connected_components(G))
        logger.info(f"Found {len(components)} disconnected components")
        
        if len(components) == 1:
            return G
        
        # Sort components by size (connect largest first)
        components = sorted(components, key=len, reverse=True)
        component_subgraphs = [G.subgraph(c).copy() for c in components]
        
        # Log component sizes
        for i, comp in enumerate(component_subgraphs):
            logger.info(f"Component {i}: {comp.number_of_nodes()} nodes, {comp.number_of_edges()} edges")
        
        # Connect components iteratively with safety checks
        G_connected = G.copy()
        max_iterations = 10
        iteration = 0
        previous_component_count = len(components)
        
        while len(components) > 1 and iteration < max_iterations:
            iteration += 1
            logger.info(f"Connection iteration {iteration}/{max_iterations}")
            
            # Find best pair to connect
            best_connection = await self._find_best_connection(
                component_subgraphs,
                max_candidates
            )
            
            if not best_connection:
                logger.warning("Could not find valid connection between components")
                break
            
            comp_i, comp_j, route_coords, distance, source_node, target_node = best_connection
            
            logger.info(f"Connecting components {comp_i} and {comp_j} with {distance:.0f}m route")
            logger.info(f"  Source node: {source_node}, Target node: {target_node}")
            
            # Add connecting edges to graph with proper node connections
            self._add_route_to_graph(
                G_connected, 
                route_coords, 
                source_node=source_node,
                target_node=target_node,
                is_connector=True
            )
            
            # Recompute components
            components = list(nx.weakly_connected_components(G_connected))
            component_subgraphs = [G_connected.subgraph(c).copy() for c in components]
            
            new_component_count = len(components)
            logger.info(f"Reduced to {new_component_count} components (was {previous_component_count})")
            
            # Check if we're making progress
            if new_component_count >= previous_component_count:
                logger.warning(f"No progress made in iteration {iteration}, may be stuck")
                if iteration > 3:  # Give it a few tries before breaking
                    logger.error("Breaking loop - no progress after multiple attempts")
                    break
            
            previous_component_count = new_component_count
        
        # Final connectivity check
        if nx.is_weakly_connected(G_connected):
            logger.info("Successfully connected all components")
        else:
            remaining = nx.number_weakly_connected_components(G_connected)
            logger.warning(f"Graph still has {remaining} disconnected components")
        
        return G_connected
    
    async def _find_best_connection(
        self,
        components: List[nx.DiGraph],
        max_candidates: int
    ) -> Optional[Tuple[int, int, List[List[float]], float, Tuple, Tuple]]:
        """Find best connection between components
        
        Returns:
            (comp_i_idx, comp_j_idx, route_coords, distance, source_node, target_node)
        """
        
        if len(components) < 2:
            return None
        
        best = None
        best_distance = float('inf')
        
        # Try connecting each pair of components
        for i, j in itertools.combinations(range(len(components)), 2):
            comp_i = components[i]
            comp_j = components[j]
            
            # Find closest nodes between components (two-stage search)
            connection = await self._find_closest_nodes(
                comp_i,
                comp_j,
                max_candidates
            )
            
            if connection and connection[1] < best_distance:
                # connection is (route_coords, distance, source_node, target_node)
                best = (i, j, connection[0], connection[1], connection[2], connection[3])
                best_distance = connection[1]
        
        return best
    
    async def _find_closest_nodes(
        self,
        comp1: nx.DiGraph,
        comp2: nx.DiGraph,
        max_candidates: int
    ) -> Optional[Tuple[List[List[float]], float, Tuple, Tuple]]:
        """Find closest nodes between two components
        
        Returns:
            (route_coords, distance, source_node, target_node)
        """
        
        # Stage 1: Use component centroids for pre-filtering
        centroid1 = self._get_component_centroid(comp1)
        centroid2 = self._get_component_centroid(comp2)
        
        # Rough distance check
        centroid_dist = self._haversine(centroid1, centroid2)
        
        # Skip if components are too far apart (> 5km)
        if centroid_dist > 5000:
            logger.debug(f"Components too far apart: {centroid_dist:.0f}m")
            return None
        
        # Stage 2: Find k-nearest node pairs
        candidates = []
        
        for node1 in comp1.nodes():
            for node2 in comp2.nodes():
                dist = self._haversine(node1, node2)
                candidates.append((node1, node2, dist))
        
        # Sort by distance and take top candidates
        candidates.sort(key=lambda x: x[2])
        candidates = candidates[:max_candidates]
        
        # Stage 3: Get actual routes for best candidates
        best_route = None
        best_distance = float('inf')
        best_source = None
        best_target = None
        
        for node1, node2, straight_dist in candidates:
            try:
                # Get route from ORS
                coords, distance = await self.ors_client.get_route(node1, node2)
                
                if coords and distance < best_distance:
                    best_route = coords
                    best_distance = distance
                    best_source = node1
                    best_target = node2
                    
                    # If we found a good route (< 1.5x straight distance), stop searching
                    if distance < straight_dist * 1.5:
                        break
                        
            except Exception as e:
                logger.warning(f"Failed to get route between {node1} and {node2}: {e}")
        
        if best_route:
            return (best_route, best_distance, best_source, best_target)
        
        return None
    
    def _get_component_centroid(self, component: nx.DiGraph) -> Tuple[float, float]:
        """Get centroid of component nodes"""
        
        nodes = list(component.nodes())
        if not nodes:
            return (0, 0)
        
        lons = [node[0] for node in nodes]
        lats = [node[1] for node in nodes]
        
        return (sum(lons) / len(lons), sum(lats) / len(lats))
    
    def _add_route_to_graph(
        self,
        G: nx.MultiDiGraph,
        coords: List[List[float]],
        source_node: Optional[Tuple] = None,
        target_node: Optional[Tuple] = None,
        is_connector: bool = False
    ):
        """Add route coordinates as edges to graph, properly connecting to source/target nodes"""
        
        if len(coords) < 2:
            return
        
        # Connect source node to first route coordinate if needed
        first_coord = tuple(coords[0])
        if source_node and source_node != first_coord:
            length_m = self._haversine(source_node, first_coord)
            logger.debug(f"Connecting source {source_node} to route start {first_coord} ({length_m:.1f}m)")
            
            edge_data = {
                'length': length_m,
                'time': length_m / 10.0,
                'geometry': [list(source_node), list(first_coord)],
                'highway': 'connector',
                'name': 'Source connection',
                'oneway': False,
                'osm_id': '',
                'is_connector': True
            }
            
            G.add_edge(source_node, first_coord, **edge_data)
            reverse_data = edge_data.copy()
            reverse_data['geometry'] = [list(first_coord), list(source_node)]
            G.add_edge(first_coord, source_node, **reverse_data)
        
        # Add route edges
        for i in range(len(coords) - 1):
            start = tuple(coords[i])
            end = tuple(coords[i + 1])
            
            # Calculate edge properties
            length_m = self._haversine(start, end)
            
            edge_data = {
                'length': length_m,
                'time': length_m / 10.0,  # Assume 10 m/s for connectors
                'geometry': [list(start), list(end)],
                'highway': 'connector' if is_connector else 'route',
                'name': 'Connection route' if is_connector else '',
                'oneway': False,
                'osm_id': '',
                'is_connector': is_connector
            }
            
            # Add bidirectional edges
            G.add_edge(start, end, **edge_data)
            
            reverse_data = edge_data.copy()
            reverse_data['geometry'] = [list(end), list(start)]
            G.add_edge(end, start, **reverse_data)
        
        # Connect last route coordinate to target node if needed
        last_coord = tuple(coords[-1])
        if target_node and target_node != last_coord:
            length_m = self._haversine(last_coord, target_node)
            logger.debug(f"Connecting route end {last_coord} to target {target_node} ({length_m:.1f}m)")
            
            edge_data = {
                'length': length_m,
                'time': length_m / 10.0,
                'geometry': [list(last_coord), list(target_node)],
                'highway': 'connector',
                'name': 'Target connection',
                'oneway': False,
                'osm_id': '',
                'is_connector': True
            }
            
            G.add_edge(last_coord, target_node, **edge_data)
            reverse_data = edge_data.copy()
            reverse_data['geometry'] = [list(target_node), list(last_coord)]
            G.add_edge(target_node, last_coord, **reverse_data)
    
    def _haversine(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calculate haversine distance in meters"""
        
        lon1, lat1 = p1
        lon2, lat2 = p2
        
        # Use pyproj for accurate calculation
        _, _, distance = GEOD.inv(lon1, lat1, lon2, lat2)
        
        return distance
    
    async def bridge_route_gaps(
        self,
        G: nx.MultiDiGraph,
        circuit: List[Tuple],
        max_gap: float = None
    ) -> List[List[float]]:
        """
        Bridge gaps in Eulerian circuit to create continuous route
        
        Args:
            G: Street graph
            circuit: Eulerian circuit (list of edge tuples)
            max_gap: Maximum allowed gap without bridging
        
        Returns:
            Continuous route coordinates
        """
        
        if not circuit:
            return []
        
        max_gap = max_gap or self.max_gap
        coords_out = []
        gaps_bridged = 0
        total_gap_distance = 0
        
        for i, (u, v) in enumerate(circuit):
            # Get edge geometry
            edge_data = None
            
            if G.has_edge(u, v):
                # Get first matching edge
                edge_dict = G.get_edge_data(u, v)
                if edge_dict:
                    edge_data = list(edge_dict.values())[0]
            elif G.has_edge(v, u):
                # Try reverse edge
                edge_dict = G.get_edge_data(v, u)
                if edge_dict:
                    edge_data = list(edge_dict.values())[0]
                    # Reverse geometry
                    edge_data = edge_data.copy()
                    edge_data['geometry'] = list(reversed(edge_data['geometry']))
            
            if not edge_data:
                logger.warning(f"No edge data for ({u}, {v})")
                continue
            
            edge_coords = edge_data['geometry']
            
            # Check for gap with previous segment
            if coords_out:
                last_pt = tuple(coords_out[-1])
                first_pt = tuple(edge_coords[0])
                
                gap_distance = self._haversine(last_pt, first_pt)
                
                if gap_distance > max_gap:
                    # Bridge the gap with ORS
                    logger.debug(f"Bridging gap of {gap_distance:.1f}m")
                    
                    try:
                        bridge_coords, bridge_dist = await self.ors_client.get_route(
                            last_pt,
                            first_pt
                        )
                        
                        # Add bridge coordinates (skip first point to avoid duplicate)
                        if bridge_coords and len(bridge_coords) > 1:
                            coords_out.extend(bridge_coords[1:])
                            gaps_bridged += 1
                            total_gap_distance += bridge_dist
                            
                    except Exception as e:
                        logger.warning(f"Failed to bridge gap: {e}")
                        # Add straight line as fallback
                        coords_out.append(list(first_pt))
            
            # Add edge coordinates
            if coords_out and coords_out[-1] == edge_coords[0]:
                # Skip duplicate point
                coords_out.extend(edge_coords[1:])
            else:
                coords_out.extend(edge_coords)
        
        logger.info(f"Bridged {gaps_bridged} gaps, total distance: {total_gap_distance:.0f}m")
        
        return coords_out
    
    def validate_route_continuity(
        self,
        coords: List[List[float]],
        max_gap: float = None
    ) -> Tuple[bool, List[Tuple[int, float]]]:
        """
        Validate route continuity
        
        Args:
            coords: Route coordinates
            max_gap: Maximum allowed gap
        
        Returns:
            (is_valid, list of (index, gap_distance) for violations)
        """
        
        max_gap = max_gap or self.max_gap
        violations = []
        
        for i in range(len(coords) - 1):
            p1 = tuple(coords[i])
            p2 = tuple(coords[i + 1])
            
            distance = self._haversine(p1, p2)
            
            if distance > max_gap:
                violations.append((i, distance))
        
        is_valid = len(violations) == 0
        
        if violations:
            logger.warning(f"Found {len(violations)} continuity violations")
            # Log top 5 violations
            for idx, dist in sorted(violations, key=lambda x: x[1], reverse=True)[:5]:
                logger.warning(f"  Gap at index {idx}: {dist:.1f}m")
        
        return is_valid, violations