"""
Route calculation using proper Chinese Postman algorithm with directed graphs
"""

import logging
from typing import Dict, Any, List, Optional, Tuple, Set
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
    """Calculates optimal coverage routes using proper CPP with directed graphs"""
    
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
            logger.info("Starting route calculation with directed CPP algorithm")
            
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
            
            logger.info(f"Built graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
            
            # Step 2: Find strongly connected components (SCCs)
            logger.info("Finding strongly connected components...")
            sccs = list(nx.strongly_connected_components(G))
            diagnostics['scc_count'] = len(sccs)
            logger.info(f"Found {len(sccs)} strongly connected components")
            
            # Process each SCC independently
            scc_circuits = []
            scc_stats = []
            
            for idx, scc_nodes in enumerate(sccs):
                # Skip empty components
                if not scc_nodes:
                    continue
                
                # Get subgraph for this SCC
                G_scc = G.subgraph(scc_nodes).copy()
                
                if G_scc.number_of_edges() == 0:
                    logger.info(f"SCC {idx}: No edges, skipping")
                    continue
                
                logger.info(f"SCC {idx}: {G_scc.number_of_nodes()} nodes, {G_scc.number_of_edges()} edges")
                
                # Step 3: Connect weakly disconnected parts within SCC if needed
                if not nx.is_weakly_connected(G_scc):
                    logger.info(f"SCC {idx}: Connecting weakly disconnected parts...")
                    G_scc = await self.route_connector.connect_components(G_scc)
                
                # Step 4: Make SCC Eulerian using directed min-cost flow
                logger.info(f"SCC {idx}: Making directed Eulerian via min-cost flow...")
                G_eulerian, euler_stats = await self._make_eulerian_directed(G_scc)
                
                scc_stats.append({
                    'scc_idx': idx,
                    'nodes': G_scc.number_of_nodes(),
                    'edges': G_scc.number_of_edges(),
                    **euler_stats
                })
                
                # Step 5: Validate directed Eulerian property
                if not self._validate_eulerian_directed(G_eulerian):
                    logger.warning(f"SCC {idx}: Not perfectly Eulerian, but continuing")
                
                # Step 6: Find Eulerian circuit for this SCC
                try:
                    circuit = list(nx.eulerian_circuit(G_eulerian))
                    logger.info(f"SCC {idx}: Found Eulerian circuit with {len(circuit)} edges")
                    scc_circuits.append((idx, G_eulerian, circuit))
                except nx.NetworkXError as e:
                    logger.error(f"SCC {idx}: Failed to find Eulerian circuit: {e}")
                    # Use all edges as fallback
                    circuit = list(G_eulerian.edges())
                    scc_circuits.append((idx, G_eulerian, circuit))
            
            diagnostics['scc_stats'] = scc_stats
            diagnostics['circuits_found'] = len(scc_circuits)
            
            if not scc_circuits:
                raise ValueError("No valid circuits found in any SCC")
            
            # Step 7: Order SCCs optimally (TSP on centroids)
            logger.info("Ordering SCCs for optimal traversal...")
            ordered_indices = self._order_sccs_by_centroid([c[1] for c in scc_circuits])
            
            # Step 8: Stitch SCC circuits together with routing
            logger.info("Stitching SCC circuits with routing...")
            route_coords = await self._stitch_scc_circuits(
                scc_circuits, 
                ordered_indices, 
                profile
            )
            
            if not route_coords:
                raise ValueError("Failed to assemble route")
            
            diagnostics['route_points'] = len(route_coords)
            
            # Step 9: Validate continuity
            is_valid, violations = self._validate_continuity(route_coords)
            diagnostics['continuity_valid'] = is_valid
            diagnostics['continuity_violations'] = len(violations)
            
            if violations:
                max_gap = max(v[1] for v in violations)
                diagnostics['max_gap_m'] = max_gap
                logger.warning(f"Route has {len(violations)} gaps, max: {max_gap:.1f}m")
            
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
    
    async def _make_eulerian_directed(
        self, 
        G: nx.MultiDiGraph
    ) -> Tuple[nx.MultiDiGraph, Dict[str, Any]]:
        """
        Balance in/out-degree on a directed graph via min-cost flow.
        This avoids adding straight 'virtual' edges and keeps traversal driveable.
        
        Returns:
            (Eulerian graph, stats)
        """
        
        stats = {}
        H = G.copy()
        
        # Calculate node balance: out-degree - in-degree
        balance = {v: H.out_degree(v) - H.in_degree(v) for v in H.nodes()}
        
        # Find imbalanced nodes
        supply_nodes = [v for v, b in balance.items() if b < 0]  # Need more out-edges
        demand_nodes = [v for v, b in balance.items() if b > 0]  # Need more in-edges
        
        stats['imbalanced_nodes'] = len(supply_nodes) + len(demand_nodes)
        
        if stats['imbalanced_nodes'] == 0:
            logger.info("Graph is already Eulerian (balanced)")
            stats['duplicated_length_m'] = 0
            stats['deadhead_ratio'] = 0
            return H, stats
        
        logger.info(f"Found {len(supply_nodes)} supply nodes, {len(demand_nodes)} demand nodes")
        
        # Compute shortest paths from supply to demand nodes
        dist = {}
        paths = {}
        
        for s in supply_nodes:
            try:
                # Use Dijkstra for shortest paths
                lengths, path_dict = nx.single_source_dijkstra(H, s, weight='length')
                dist[s] = {}
                paths[s] = {}
                
                for d in demand_nodes:
                    if d in lengths:
                        dist[s][d] = lengths[d]
                        paths[s][d] = path_dict[d]
                    else:
                        dist[s][d] = float('inf')
                        paths[s][d] = None
                        
            except Exception as e:
                logger.warning(f"Failed to compute paths from {s}: {e}")
                dist[s] = {d: float('inf') for d in demand_nodes}
                paths[s] = {d: None for d in demand_nodes}
        
        # Build min-cost flow network
        F = nx.DiGraph()
        
        # Add nodes with demands (negative for supply, positive for demand)
        for s in supply_nodes:
            F.add_node(s, demand=balance[s])  # Negative value
        
        for d in demand_nodes:
            F.add_node(d, demand=balance[d])  # Positive value
        
        # Add edges with costs based on shortest path distances
        for s in supply_nodes:
            for d in demand_nodes:
                if dist[s][d] < float('inf'):
                    # Use integer cost (multiply by 1000 for precision)
                    cost = int(dist[s][d] * 1000)
                    # Capacity should be sufficient for all flow
                    capacity = abs(balance[s]) + abs(balance[d])
                    F.add_edge(s, d, weight=cost, capacity=capacity)
        
        # Solve min-cost flow problem
        try:
            flow_dict = nx.min_cost_flow(F)
            logger.info("Min-cost flow solution found")
        except nx.NetworkXUnfeasible:
            logger.error("Min-cost flow is unfeasible - graph may be disconnected")
            # Fall back to simple pairing
            flow_dict = self._simple_flow_fallback(supply_nodes, demand_nodes, balance)
        except Exception as e:
            logger.error(f"Min-cost flow failed: {e}")
            flow_dict = self._simple_flow_fallback(supply_nodes, demand_nodes, balance)
        
        # Duplicate edges along shortest paths based on flow
        total_duplicated_length = 0.0
        edges_added = 0
        
        for s in flow_dict:
            for d, flow in flow_dict[s].items():
                if flow > 0 and s in paths and d in paths[s] and paths[s][d]:
                    path = paths[s][d]
                    
                    # Duplicate edges along this path 'flow' times
                    for _ in range(int(flow)):
                        for i in range(len(path) - 1):
                            u, v = path[i], path[i + 1]
                            
                            # Find the edge to duplicate
                            if H.has_edge(u, v):
                                # Get the shortest edge if multiple exist
                                edge_data = min(
                                    H.get_edge_data(u, v).values(),
                                    key=lambda x: x.get('length', float('inf'))
                                )
                                # Add duplicate edge
                                H.add_edge(u, v, **edge_data)
                                total_duplicated_length += edge_data.get('length', 0)
                                edges_added += 1
        
        stats['duplicated_length_m'] = total_duplicated_length
        stats['edges_added'] = edges_added
        
        # Calculate deadhead ratio
        original_length = sum(d.get('length', 0) for _, _, d in G.edges(data=True))
        if original_length > 0:
            stats['deadhead_ratio'] = total_duplicated_length / original_length
        else:
            stats['deadhead_ratio'] = 0
        
        logger.info(f"Added {edges_added} duplicate edges, deadhead ratio: {stats['deadhead_ratio']:.2%}")
        
        return H, stats
    
    def _simple_flow_fallback(
        self,
        supply_nodes: List[Any],
        demand_nodes: List[Any],
        balance: Dict[Any, int]
    ) -> Dict[Any, Dict[Any, int]]:
        """Simple fallback flow assignment when min-cost flow fails"""
        
        flow_dict = {s: {} for s in supply_nodes}
        
        # Copy demands to satisfy
        remaining_supply = {s: -balance[s] for s in supply_nodes}
        remaining_demand = {d: balance[d] for d in demand_nodes}
        
        # Simple greedy assignment
        for s in supply_nodes:
            for d in demand_nodes:
                if remaining_supply[s] > 0 and remaining_demand[d] > 0:
                    flow = min(remaining_supply[s], remaining_demand[d])
                    flow_dict[s][d] = flow
                    remaining_supply[s] -= flow
                    remaining_demand[d] -= flow
        
        return flow_dict
    
    def _validate_eulerian_directed(self, G: nx.MultiDiGraph) -> bool:
        """
        Validate directed Eulerian property: in_degree == out_degree for all nodes
        """
        
        for n in G.nodes():
            if G.in_degree(n) != G.out_degree(n):
                logger.warning(f"Node {n} imbalanced: in={G.in_degree(n)}, out={G.out_degree(n)}")
                return False
        
        # Also check if strongly connected (ideal but not required for our approach)
        if not nx.is_strongly_connected(G):
            logger.info("Graph is balanced but not strongly connected (OK for SCC processing)")
        
        return True
    
    def _order_sccs_by_centroid(self, scc_graphs: List[nx.MultiDiGraph]) -> List[int]:
        """
        Order SCCs using a simple TSP heuristic on centroids
        """
        
        if len(scc_graphs) <= 1:
            return list(range(len(scc_graphs)))
        
        # Calculate centroids
        centroids = []
        for G in scc_graphs:
            if G.number_of_nodes() == 0:
                centroids.append((0, 0))
                continue
            
            nodes = list(G.nodes())
            avg_lon = sum(n[0] for n in nodes) / len(nodes)
            avg_lat = sum(n[1] for n in nodes) / len(nodes)
            centroids.append((avg_lon, avg_lat))
        
        # Simple nearest neighbor TSP
        n = len(centroids)
        unvisited = set(range(n))
        order = [0]  # Start with first SCC
        unvisited.remove(0)
        
        while unvisited:
            last_idx = order[-1]
            last_centroid = centroids[last_idx]
            
            # Find nearest unvisited
            best_idx = None
            best_dist = float('inf')
            
            for idx in unvisited:
                dist = self._haversine(last_centroid, centroids[idx])
                if dist < best_dist:
                    best_dist = dist
                    best_idx = idx
            
            if best_idx is not None:
                order.append(best_idx)
                unvisited.remove(best_idx)
        
        return order
    
    async def _stitch_scc_circuits(
        self,
        scc_circuits: List[Tuple[int, nx.MultiDiGraph, List[Tuple]]],
        order: List[int],
        profile: str
    ) -> List[List[float]]:
        """
        Stitch SCC circuits together with routing connections
        """
        
        route_coords = []
        
        for seq_idx, scc_idx in enumerate(order):
            # Find the SCC data
            scc_data = None
            for idx, G, circuit in scc_circuits:
                if idx == scc_idx:
                    scc_data = (G, circuit)
                    break
            
            if not scc_data:
                continue
            
            G_scc, circuit = scc_data
            
            # Assemble coordinates for this circuit
            circuit_coords = await self.route_connector.bridge_route_gaps(G_scc, circuit)
            
            if not circuit_coords:
                logger.warning(f"SCC {scc_idx}: No coordinates generated")
                continue
            
            logger.info(f"SCC {scc_idx}: Generated {len(circuit_coords)} coordinates")
            
            # If this is the first SCC, just add its coordinates
            if not route_coords:
                route_coords = circuit_coords
            else:
                # Connect to previous SCC using ORS
                last_point = route_coords[-1]
                first_point = circuit_coords[0]
                
                # Get connecting route
                gap_distance = self._haversine(tuple(last_point), tuple(first_point))
                
                if gap_distance > self.max_gap:
                    logger.info(f"Connecting SCCs with {gap_distance:.0f}m gap")
                    
                    # Use the new route_between_points method
                    if hasattr(self.ors_client, 'route_between_points'):
                        connector = await self.ors_client.route_between_points(
                            last_point,
                            first_point,
                            profile=profile
                        )
                    else:
                        # Fallback to get_route
                        connector, _ = await self.ors_client.get_route(
                            tuple(last_point),
                            tuple(first_point),
                            profile=profile
                        )
                    
                    # Add connector (skip first point to avoid duplicate)
                    if connector and len(connector) > 1:
                        route_coords.extend(connector[1:])
                
                # Add circuit coordinates (skip first if it's duplicate)
                if route_coords[-1] == circuit_coords[0]:
                    route_coords.extend(circuit_coords[1:])
                else:
                    route_coords.extend(circuit_coords)
        
        return route_coords
    
    def _validate_continuity(
        self,
        coords: List[List[float]]
    ) -> Tuple[bool, List[Tuple[int, float]]]:
        """
        Validate route continuity
        
        Returns:
            (is_valid, list of (index, gap_distance) for violations)
        """
        
        violations = []
        
        for i in range(len(coords) - 1):
            p1 = tuple(coords[i])
            p2 = tuple(coords[i + 1])
            
            distance = self._haversine(p1, p2)
            
            if distance > self.max_gap:
                violations.append((i, distance))
        
        is_valid = len(violations) == 0
        
        if violations:
            logger.warning(f"Found {len(violations)} continuity violations")
            # Log worst violations
            for idx, dist in sorted(violations, key=lambda x: x[1], reverse=True)[:5]:
                logger.warning(f"  Gap at index {idx}: {dist:.1f}m")
        
        return is_valid, violations
    
    def _haversine(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calculate haversine distance in meters"""
        
        lon1, lat1 = p1
        lon2, lat2 = p2
        
        # Use pyproj for accurate calculation
        _, _, distance = GEOD.inv(lon1, lat1, lon2, lat2)
        
        return distance
    
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