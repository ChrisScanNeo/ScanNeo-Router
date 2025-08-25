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

# Gap handling thresholds
SNAP_EPS_M = 1.0    # If within this, just snap (no routing needed)
SMALL_JOIN_M = 15.0  # If <= this, don't call ORS; just connect with direct segment


def _align(u: Tuple[float, float], v: Tuple[float, float], coords: List[List[float]]) -> List[List[float]]:
    """
    Align geometry to run from u to v.
    Reverse if needed and snap endpoints exactly to u/v.
    """
    if not coords or len(coords) < 2:
        return [list(u), list(v)]
    
    def sqd(A, B):
        """Squared distance for comparison"""
        return (A[0] - B[0])**2 + (A[1] - B[1])**2
    
    # Check if we need to reverse
    if sqd(coords[0], list(u)) > sqd(coords[0], list(v)):
        coords = list(reversed(coords))
    
    # Snap endpoints exactly to u/v
    coords[0] = [u[0], u[1]]
    coords[-1] = [v[0], v[1]]
    
    return coords


class RouteConnector:
    """Connects disconnected components in street graph"""
    
    def __init__(self, ors_client: ORSClient, coverage_mode: bool = True):
        self.ors_client = ors_client
        self.max_gap = settings.max_gap_meters
        self.coverage_mode = coverage_mode  # True = prioritize coverage with U-turns, False = standard navigation
    
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
            logger.info(f"  Route has {len(route_coords)} coordinates")
            
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
                logger.warning(f"No progress made in iteration {iteration}")
                if iteration > 3:
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
            
            # Find closest nodes between components
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
        
        # Stage 3: Handle based on coverage mode
        best_route = None
        best_distance = float('inf')
        best_source = None
        best_target = None
        
        for node1, node2, straight_dist in candidates:
            # In coverage mode, for small gaps just connect directly (allowing U-turns)
            if self.coverage_mode and straight_dist < 50:  # Within 50m
                logger.info(f"Coverage mode: Direct connection for {straight_dist:.1f}m gap")
                # Create direct path (allows U-turn if on same street)
                best_route = [list(node1), list(node2)]
                best_distance = straight_dist
                best_source = node1
                best_target = node2
                break
            
            # Check if nodes might be on the same street (very close)
            if self.coverage_mode and straight_dist < 100:
                # Try to create a U-turn path if they're likely on the same street
                u_turn_path = self._create_u_turn_path(comp1, comp2, node1, node2)
                if u_turn_path:
                    logger.info(f"Coverage mode: U-turn path found for {straight_dist:.1f}m gap")
                    best_route = u_turn_path
                    best_distance = self._calculate_path_distance(u_turn_path)
                    best_source = node1
                    best_target = node2
                    break
            
            # Otherwise use routing API
            try:
                # Get route from ORS
                coords, distance = await self.ors_client.get_route(node1, node2)
                
                if coords and distance < best_distance:
                    best_route = coords
                    best_distance = distance
                    best_source = node1
                    best_target = node2
                    logger.debug(f"  New best route: {node1} -> {node2}, distance={distance:.1f}m")
                    
                    # If we found a good route (< 1.5x straight distance), stop searching
                    if distance < straight_dist * 1.5:
                        break
                        
            except Exception as e:
                logger.warning(f"Failed to get route between {node1} and {node2}: {e}")
                # In coverage mode, fall back to direct connection for failed routing
                if self.coverage_mode:
                    best_route = [list(node1), list(node2)]
                    best_distance = straight_dist
                    best_source = node1
                    best_target = node2
                    logger.info(f"Coverage mode: Using direct fallback for failed routing")
        
        if best_route:
            logger.info(f"Found best connection: {best_source} -> {best_target}, distance: {best_distance:.1f}m")
            return (best_route, best_distance, best_source, best_target)
        
        logger.warning("No route found between components")
        return None
    
    def _create_u_turn_path(
        self,
        comp1: nx.DiGraph,
        comp2: nx.DiGraph, 
        node1: Tuple[float, float],
        node2: Tuple[float, float]
    ) -> Optional[List[List[float]]]:
        """Create a U-turn path if nodes are on the same street or very close"""
        
        # Check if both nodes have edges in their components that might connect
        # This is a simplified check - in reality would need street name matching
        
        # Find if there's a common neighbor (intersection) nearby
        neighbors1 = set(comp1.neighbors(node1)) | set(comp1.predecessors(node1))
        neighbors2 = set(comp2.neighbors(node2)) | set(comp2.predecessors(node2))
        
        # Look for nearby common points
        for n1 in neighbors1:
            for n2 in neighbors2:
                dist = self._haversine(n1, n2)
                if dist < 20:  # Very close, likely same intersection
                    # Create path: node1 -> n1 -> n2 -> node2
                    return [list(node1), list(n1), list(n2), list(node2)]
        
        return None
    
    def _calculate_path_distance(self, coords: List[List[float]]) -> float:
        """Calculate total distance along a path"""
        total = 0
        for i in range(len(coords) - 1):
            total += self._haversine(
                (coords[i][0], coords[i][1]),
                (coords[i+1][0], coords[i+1][1])
            )
        return total
    
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
            logger.info(f"Connecting source {source_node} to route start {first_coord} ({length_m:.1f}m)")
            
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
                'time': length_m / 10.0,
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
            logger.info(f"Connecting route end {last_coord} to target {target_node} ({length_m:.1f}m)")
            
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
        max_gap: float = None,
        profile: str = 'driving-car',
        use_edge_keys: bool = False
    ) -> List[List[float]]:
        """
        Bridge gaps in Eulerian circuit to create continuous route
        
        Args:
            G: Street graph
            circuit: Eulerian circuit (list of edge tuples)
            max_gap: Maximum allowed gap without bridging (deprecated)
            profile: Routing profile for ORS
            use_edge_keys: Whether circuit contains edge keys
        
        Returns:
            Continuous route coordinates
        """
        
        if not circuit:
            return []
        
        out = []
        gaps_bridged = 0
        total_gap_distance = 0
        
        def get_edge_geom(u, v, key=None):
            """Get edge geometry, with alignment"""
            data = None
            if use_edge_keys and key is not None:
                data = G.get_edge_data(u, v, key=key)
            else:
                ed = G.get_edge_data(u, v)
                if ed:
                    # Pick the shortest edge if multiple exist
                    if isinstance(ed, dict):
                        data = min(ed.values(), key=lambda d: d.get('length', float('inf')))
                    else:
                        data = ed
            
            if not data:
                # Fallback: straight line
                logger.warning(f"No edge data for ({u}, {v}, key={key})")
                return [list(u), list(v)]
            
            geom = data.get('geometry')
            if not geom:
                return [list(u), list(v)]
            
            # Ensure geometry is aligned from u to v
            seg = _align(u, v, [list(g) for g in geom])
            # Force exact endpoints (belt-and-braces)
            seg[0] = [u[0], u[1]]
            seg[-1] = [v[0], v[1]]
            return seg
        
        # Process each edge in the circuit
        for idx, item in enumerate(circuit):
            if use_edge_keys:
                u, v, k = item
                seg = get_edge_geom(u, v, key=k)
            else:
                u, v = item
                seg = get_edge_geom(u, v, key=None)
            
            if not seg or len(seg) < 2:
                logger.warning(f"Edge {idx} has invalid geometry, using straight line")
                seg = [list(u), list(v)]
            
            # First segment - just add it
            if not out:
                out.extend(seg)
                continue
            
            # Check continuity with previous segment
            last_pt = out[-1]
            first_pt = seg[0]
            gap = self._haversine(tuple(last_pt), tuple(first_pt))
            
            # Log significant gaps for debugging
            if gap > 10.0:
                logger.info(f"Edge {idx}/{len(circuit)}: Found {gap:.1f}m gap between edges")
                logger.debug(f"  Last point: {last_pt}, First point: {first_pt}")
            
            # Handle gap based on size
            if gap <= 0.001:  # Essentially no gap (< 1mm)
                # Just append segment without any duplicate
                out.extend(seg[1:])
                
            elif gap <= 20.0:  # Small gap - direct join without ORS
                logger.debug(f"Edge {idx}: Closing {gap:.2f}m gap with direct join")
                # Insert the start point to bridge the gap
                out.append(first_pt)
                # Then append rest of segment
                out.extend(seg[1:])
                gaps_bridged += 1
                total_gap_distance += gap
                
            else:  # Large gap > 20m - use ORS routing
                logger.info(f"Edge {idx}: Bridging {gap:.1f}m gap with ORS")
                try:
                    if hasattr(self.ors_client, 'route_between_points'):
                        bridge = await self.ors_client.route_between_points(
                            last_pt, first_pt, profile=profile
                        )
                    else:
                        bridge, _ = await self.ors_client.get_route(
                            tuple(last_pt), tuple(first_pt), profile=profile
                        )
                    
                    if bridge and len(bridge) > 1:
                        # snap ends to kill sub-meter drift
                        bridge[0] = [last_pt[0], last_pt[1]]
                        bridge[-1] = [first_pt[0], first_pt[1]]
                        out.extend(bridge[1:])  # skip duplicate start
                        # Now append the segment itself
                        out.extend(seg[1:])
                        gaps_bridged += 1
                        total_gap_distance += gap
                        logger.info(f"  Bridged with {len(bridge)} points")
                    else:
                        # fall back to direct connection
                        logger.warning(f"  No route found, using direct connection")
                        out.append(first_pt)
                        out.extend(seg[1:])
                        gaps_bridged += 1
                        
                except Exception as e:
                    logger.warning(f"Failed to bridge gap: {e}, using direct connection")
                    out.append(first_pt)
                    out.extend(seg[1:])
                    gaps_bridged += 1
        
        # Final continuity repair pass
        logger.info(f"Running final continuity repair... (main phase bridged {gaps_bridged} gaps)")
        fixes = await self._repair_continuity(out, profile)
        gaps_bridged += fixes
        
        # Log validation results
        max_gap, violations = self.validate_route_continuity(out)
        logger.info(f"bridge_route_gaps complete: bridged {gaps_bridged} gaps, total distance: {total_gap_distance:.0f}m")
        logger.info(f"Route validation: max_gap={max_gap:.1f}m, violations={violations}")
        
        continuity_valid = violations == 0
        
        return out
    
    async def _repair_continuity(
        self,
        coords: List[List[float]],
        profile: str
    ) -> int:
        """
        Final pass: single-pass repair with loop-proof advancement
        """
        if not coords or len(coords) < 2:
            return 0
        
        fixed = 0
        i = 0
        MAX_FIXES = 200  # hard stop
        
        while i < len(coords) - 1 and fixed < MAX_FIXES:
            a, b = coords[i], coords[i+1]
            gap = self._haversine(tuple(a), tuple(b))
            
            if gap <= 20.0:  # Use same threshold as main phase
                i += 1
                continue
            
            # try routing once
            logger.warning(f"Final repair: Found {gap:.1f}m gap at index {i}")
            try:
                if hasattr(self.ors_client, 'route_between_points'):
                    bridge = await self.ors_client.route_between_points(
                        a, b, profile=profile
                    )
                else:
                    bridge, _ = await self.ors_client.get_route(
                        tuple(a), tuple(b), profile=profile
                    )
                
                if bridge and len(bridge) > 1:
                    bridge[0] = [a[0], a[1]]
                    bridge[-1] = [b[0], b[1]]
                    coords[i:i+2] = bridge  # replace exactly the gap edge
                    fixed += 1
                    i += max(1, len(bridge) - 1)  # advance past inserted polyline
                    continue
            except Exception as e:
                logger.error(f"Final repair routing failed: {e}")
            
            # fallback: snap b to a (guarantee progress)
            coords[i+1] = [a[0], a[1]]
            fixed += 1
            i += 1
        
        if fixed >= MAX_FIXES:
            logger.error(f"Final repair aborted after {fixed} fixes (hit limit)")
        
        if fixed > 0:
            logger.info(f"Final continuity repair fixed {fixed} gaps")
        return fixed
    
    def validate_route_continuity(
        self,
        coords: List[List[float]],
        max_gap: float = None
    ) -> Tuple[float, int]:
        """
        Validate route continuity
        
        Args:
            coords: Route coordinates
            max_gap: Maximum allowed gap (default 12m)
        
        Returns:
            (max_gap_found, violation_count)
        """
        
        max_gap_threshold = max_gap or 12.0  # Same as main phase threshold
        max_gap_found = 0.0
        violations = 0
        
        for i in range(len(coords) - 1):
            p1 = tuple(coords[i])
            p2 = tuple(coords[i + 1])
            
            distance = self._haversine(p1, p2)
            max_gap_found = max(max_gap_found, distance)
            
            if distance > max_gap_threshold:
                violations += 1
                if violations <= 5:  # Log first few violations
                    logger.warning(f"  Gap at index {i}: {distance:.1f}m")
        
        is_valid = violations == 0
        
        if violations > 0:
            logger.warning(f"Found {violations} continuity violations (max gap: {max_gap_found:.1f}m)")
        
        return max_gap_found, violations