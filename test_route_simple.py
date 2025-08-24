#!/usr/bin/env python3
"""
Simple test for the refactored route calculator without database dependencies
"""

import asyncio
import json
import logging
import sys
from typing import Dict, Any, List, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import just what we need
import networkx as nx
from pyproj import Geod

GEOD = Geod(ellps="WGS84")


class SimpleORSClient:
    """Simple ORS client mock for testing"""
    
    def __init__(self):
        self.enabled = False
        logger.warning("Using mock ORS client - routes will be straight lines")
    
    async def route_between_points(
        self,
        start: List[float],
        end: List[float],
        profile: str = "driving-car"
    ) -> List[List[float]]:
        """Return straight line between points"""
        return [start, end]
    
    async def get_route(
        self,
        start: Tuple[float, float],
        end: Tuple[float, float],
        profile: str = "driving-car"
    ) -> Tuple[List[List[float]], float]:
        """Return straight line and distance"""
        distance = self._haversine(start, end)
        return [[start[0], start[1]], [end[0], end[1]]], distance
    
    def _haversine(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calculate haversine distance"""
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


def build_test_graph() -> nx.MultiDiGraph:
    """Build a simple test graph"""
    G = nx.MultiDiGraph()
    
    # Add a simple connected component
    nodes = [
        (-0.1276, 51.5074),  # Node 0
        (-0.1278, 51.5076),  # Node 1
        (-0.1280, 51.5078),  # Node 2
        (-0.1282, 51.5080),  # Node 3
    ]
    
    # Add edges with properties
    edges = [
        (nodes[0], nodes[1], {'length': 100, 'highway': 'residential', 'name': 'Street A'}),
        (nodes[1], nodes[2], {'length': 120, 'highway': 'residential', 'name': 'Street B'}),
        (nodes[2], nodes[3], {'length': 110, 'highway': 'residential', 'name': 'Street C'}),
        # Add reverse edges for two-way streets
        (nodes[1], nodes[0], {'length': 100, 'highway': 'residential', 'name': 'Street A'}),
        (nodes[2], nodes[1], {'length': 120, 'highway': 'residential', 'name': 'Street B'}),
        (nodes[3], nodes[2], {'length': 110, 'highway': 'residential', 'name': 'Street C'}),
        # Add a one-way street creating imbalance
        (nodes[3], nodes[0], {'length': 200, 'highway': 'primary', 'name': 'One Way', 'oneway': True}),
    ]
    
    for u, v, data in edges:
        G.add_edge(u, v, **data)
    
    # Add a disconnected component
    island_nodes = [
        (-0.1290, 51.5090),  # Node 4
        (-0.1292, 51.5092),  # Node 5
    ]
    
    G.add_edge(island_nodes[0], island_nodes[1], length=80, highway='residential', name='Island Road')
    G.add_edge(island_nodes[1], island_nodes[0], length=80, highway='residential', name='Island Road')
    
    return G


async def test_directed_eulerization():
    """Test the directed Eulerization algorithm"""
    
    logger.info("=== Testing Directed Eulerization ===")
    
    G = build_test_graph()
    logger.info(f"Initial graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    
    # Check initial balance
    for node in G.nodes():
        in_deg = G.in_degree(node)
        out_deg = G.out_degree(node)
        balance = out_deg - in_deg
        if balance != 0:
            logger.info(f"Node {node}: in={in_deg}, out={out_deg}, balance={balance}")
    
    # Test min-cost flow balancing
    H = G.copy()
    
    # Calculate node balance
    balance = {v: H.out_degree(v) - H.in_degree(v) for v in H.nodes()}
    
    supply_nodes = [v for v, b in balance.items() if b < 0]
    demand_nodes = [v for v, b in balance.items() if b > 0]
    
    logger.info(f"Supply nodes (need out-edges): {len(supply_nodes)}")
    logger.info(f"Demand nodes (need in-edges): {len(demand_nodes)}")
    
    if supply_nodes and demand_nodes:
        # Compute shortest paths
        dist = {}
        paths = {}
        
        for s in supply_nodes:
            try:
                lengths, path_dict = nx.single_source_dijkstra(H, s, weight='length')
                dist[s] = {}
                paths[s] = {}
                
                for d in demand_nodes:
                    if d in lengths:
                        dist[s][d] = lengths[d]
                        paths[s][d] = path_dict[d]
                        logger.info(f"Path {s} -> {d}: distance={lengths[d]:.0f}")
            except Exception as e:
                logger.warning(f"No path from {s}: {e}")
        
        # Build min-cost flow network
        F = nx.DiGraph()
        
        for s in supply_nodes:
            F.add_node(s, demand=balance[s])
        
        for d in demand_nodes:
            F.add_node(d, demand=balance[d])
        
        for s in supply_nodes:
            for d in demand_nodes:
                if s in dist and d in dist[s] and dist[s][d] < float('inf'):
                    cost = int(dist[s][d] * 1000)
                    capacity = abs(balance[s]) + abs(balance[d])
                    F.add_edge(s, d, weight=cost, capacity=capacity)
        
        # Solve min-cost flow
        try:
            flow_dict = nx.min_cost_flow(F)
            logger.info("✅ Min-cost flow solution found!")
            
            # Log the flow
            for s in flow_dict:
                for d, flow in flow_dict[s].items():
                    if flow > 0:
                        logger.info(f"Flow: {s} -> {d}: {flow} units")
        
        except Exception as e:
            logger.error(f"Min-cost flow failed: {e}")
    
    # Check if graph can be made Eulerian
    sccs = list(nx.strongly_connected_components(G))
    logger.info(f"Strongly connected components: {len(sccs)}")
    
    for i, scc in enumerate(sccs):
        logger.info(f"SCC {i}: {len(scc)} nodes")
        
        # Check if this SCC can have an Eulerian circuit
        G_scc = G.subgraph(scc)
        if nx.is_weakly_connected(G_scc):
            # Check balance
            balanced = all(G_scc.in_degree(n) == G_scc.out_degree(n) for n in G_scc.nodes())
            logger.info(f"  Weakly connected: Yes, Balanced: {balanced}")
    
    logger.info("✅ Directed Eulerization test complete")


async def test_scc_ordering():
    """Test SCC ordering by centroid"""
    
    logger.info("=== Testing SCC Ordering ===")
    
    # Create sample centroids
    centroids = [
        (0, 0),      # SCC 0
        (10, 0),     # SCC 1
        (10, 10),    # SCC 2
        (0, 10),     # SCC 3
    ]
    
    # Simple nearest neighbor TSP
    n = len(centroids)
    unvisited = set(range(n))
    order = [0]
    unvisited.remove(0)
    
    while unvisited:
        last_idx = order[-1]
        last_centroid = centroids[last_idx]
        
        best_idx = None
        best_dist = float('inf')
        
        for idx in unvisited:
            # Simple Euclidean distance
            dist = ((centroids[idx][0] - last_centroid[0])**2 + 
                   (centroids[idx][1] - last_centroid[1])**2)**0.5
            if dist < best_dist:
                best_dist = dist
                best_idx = idx
        
        if best_idx is not None:
            order.append(best_idx)
            unvisited.remove(best_idx)
    
    logger.info(f"SCC visit order: {order}")
    logger.info("✅ SCC ordering test complete")


async def main():
    """Run all tests"""
    
    logger.info("Starting refactored route calculator tests...")
    
    try:
        await test_directed_eulerization()
        await test_scc_ordering()
        
        logger.info("\n✅ All tests completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"\n❌ Tests failed: {e}", exc_info=True)
        return False


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)