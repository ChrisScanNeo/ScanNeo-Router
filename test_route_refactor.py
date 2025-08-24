#!/usr/bin/env python3
"""
Test script for the refactored Chinese Postman route generation
"""

import asyncio
import json
import os
import sys
import logging

# Add the worker app to the path
sys.path.insert(0, '/workspaces/ScanNeo-Router/apps/worker')

from app.services.route_calculator import RouteCalculator
from app.services.ors_client import ORSClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def create_test_geojson():
    """Create a simple test GeoJSON with disconnected street segments"""
    return {
        "type": "FeatureCollection",
        "features": [
            # Main connected component
            {
                "type": "Feature",
                "properties": {
                    "osm_id": "1",
                    "highway": "residential",
                    "name": "Main Street",
                    "oneway": False
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-0.1276, 51.5074],  # London coordinates
                        [-0.1278, 51.5076],
                        [-0.1280, 51.5078]
                    ]
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "osm_id": "2",
                    "highway": "residential",
                    "name": "Second Street",
                    "oneway": False
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-0.1280, 51.5078],  # Connects to Main Street
                        [-0.1282, 51.5080],
                        [-0.1284, 51.5082]
                    ]
                }
            },
            # Disconnected component (island)
            {
                "type": "Feature",
                "properties": {
                    "osm_id": "3",
                    "highway": "residential",
                    "name": "Island Road",
                    "oneway": False
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-0.1290, 51.5090],  # Separate from main component
                        [-0.1292, 51.5092],
                        [-0.1294, 51.5094]
                    ]
                }
            },
            # One-way street
            {
                "type": "Feature",
                "properties": {
                    "osm_id": "4",
                    "highway": "primary",
                    "name": "One Way Avenue",
                    "oneway": True
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-0.1284, 51.5082],  # Connects to Second Street
                        [-0.1286, 51.5084],
                        [-0.1276, 51.5074]   # Loops back to Main Street
                    ]
                }
            }
        ]
    }


async def test_route_calculation():
    """Test the refactored route calculation"""
    
    logger.info("Starting route calculation test...")
    
    # Create test data
    streets_geojson = create_test_geojson()
    logger.info(f"Created test GeoJSON with {len(streets_geojson['features'])} streets")
    
    # Initialize calculator (ORS client will warn if no API key)
    ors_client = ORSClient()
    calculator = RouteCalculator(ors_client=ors_client)
    
    try:
        # Calculate route
        logger.info("Calculating optimal route...")
        result = await calculator.calculate_route(
            streets_geojson,
            profile='driving-car'
        )
        
        # Log results
        logger.info("=== ROUTE CALCULATION RESULTS ===")
        logger.info(f"Route valid: {result['valid']}")
        logger.info(f"Route length: {result['length_m']:.2f} meters")
        logger.info(f"Drive time: {result['drive_time_s']:.2f} seconds")
        logger.info(f"Route points: {result['diagnostics']['route_points']}")
        
        # Log diagnostics
        logger.info("=== DIAGNOSTICS ===")
        diagnostics = result['diagnostics']
        logger.info(f"Input streets: {diagnostics['input_streets']}")
        logger.info(f"Graph nodes: {diagnostics.get('graph_nodes', 'N/A')}")
        logger.info(f"Graph edges: {diagnostics.get('graph_edges', 'N/A')}")
        logger.info(f"SCCs found: {diagnostics.get('scc_count', 'N/A')}")
        logger.info(f"Circuits found: {diagnostics.get('circuits_found', 'N/A')}")
        logger.info(f"Continuity valid: {diagnostics.get('continuity_valid', 'N/A')}")
        logger.info(f"Continuity violations: {diagnostics.get('continuity_violations', 'N/A')}")
        
        if diagnostics.get('max_gap_m'):
            logger.info(f"Maximum gap: {diagnostics['max_gap_m']:.2f} meters")
        
        # Log SCC stats
        if 'scc_stats' in diagnostics:
            logger.info("=== SCC STATISTICS ===")
            for scc_stat in diagnostics['scc_stats']:
                logger.info(f"SCC {scc_stat['scc_idx']}:")
                logger.info(f"  Nodes: {scc_stat['nodes']}")
                logger.info(f"  Edges: {scc_stat['edges']}")
                logger.info(f"  Imbalanced nodes: {scc_stat.get('imbalanced_nodes', 0)}")
                logger.info(f"  Edges added: {scc_stat.get('edges_added', 0)}")
                logger.info(f"  Deadhead ratio: {scc_stat.get('deadhead_ratio', 0):.2%}")
        
        # Save route to file for visualization
        output_file = "/workspaces/ScanNeo-Router/test_route_output.json"
        with open(output_file, 'w') as f:
            json.dump(result, f, indent=2)
        logger.info(f"Route saved to {output_file}")
        
        # Test chunking
        logger.info("=== TESTING ROUTE CHUNKING ===")
        chunks = calculator.split_into_chunks(
            result['geometry']['coordinates'],
            chunk_duration_s=1800,  # 30 minutes
            profile='driving-car'
        )
        logger.info(f"Route split into {len(chunks)} chunks")
        for chunk in chunks:
            logger.info(f"  Chunk {chunk['chunk_id']}: {chunk['length_m']:.0f}m, {chunk['time_s']:.0f}s")
        
        logger.info("✅ Test completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}", exc_info=True)
        return False


if __name__ == "__main__":
    # Run the test
    success = asyncio.run(test_route_calculation())
    sys.exit(0 if success else 1)