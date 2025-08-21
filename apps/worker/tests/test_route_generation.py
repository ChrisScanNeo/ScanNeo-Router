"""
Tests for route generation with proper Chinese Postman algorithm
"""

import pytest
import asyncio
import networkx as nx
from unittest.mock import Mock, AsyncMock, patch
from shapely.geometry import LineString, Point

from app.services.graph_builder import GraphBuilder
from app.services.route_connector import RouteConnector
from app.services.route_calculator import RouteCalculator
from app.services.ors_client import ORSClient


class TestGraphBuilder:
    """Test graph building with intersection detection"""
    
    def test_extract_lines_and_props(self):
        """Test extraction of LineStrings from GeoJSON"""
        builder = GraphBuilder()
        
        features = [
            {
                'type': 'Feature',
                'geometry': {
                    'type': 'LineString',
                    'coordinates': [[0, 0], [1, 1]]
                },
                'properties': {'name': 'Street 1'}
            },
            {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',  # Should be skipped
                    'coordinates': [0.5, 0.5]
                },
                'properties': {}
            }
        ]
        
        lines, props = builder._extract_lines_and_props(features)
        
        assert len(lines) == 1
        assert len(props) == 1
        assert props[0]['name'] == 'Street 1'
    
    def test_geodesic_length(self):
        """Test accurate geodesic distance calculation"""
        builder = GraphBuilder()
        
        # Approximately 111km (1 degree at equator)
        coords = [[0, 0], [1, 0]]
        length = builder._geodesic_length(coords)
        
        assert 110000 < length < 112000  # Within reasonable range
    
    def test_split_at_intersections(self):
        """Test that crossing streets are split at intersections"""
        builder = GraphBuilder()
        
        # Two crossing streets (X pattern)
        lines = [
            LineString([[0, 0], [1, 1]]),
            LineString([[0, 1], [1, 0]])
        ]
        
        segments = builder._split_at_intersections(lines, (0.5, 0.5))
        
        # Should be split into 4 segments (2 per line)
        assert len(segments) >= 4
    
    def test_build_graph_connectivity(self):
        """Test that graph has proper connectivity"""
        builder = GraphBuilder()
        
        streets_geojson = {
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [[0, 0], [1, 0]]
                    },
                    'properties': {'highway': 'residential'}
                },
                {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [[1, 0], [1, 1]]
                    },
                    'properties': {'highway': 'residential'}
                }
            ]
        }
        
        G = builder.build_street_graph(streets_geojson)
        
        assert G.number_of_nodes() > 0
        assert G.number_of_edges() > 0
        # Check that shared point (1,0) connects the streets
        assert any(abs(n[0] - 1.0) < 0.001 and abs(n[1] - 0.0) < 0.001 
                  for n in G.nodes())


class TestRouteConnector:
    """Test component connection and gap bridging"""
    
    @pytest.mark.asyncio
    async def test_connect_already_connected(self):
        """Test that already connected graph is unchanged"""
        mock_ors = Mock(spec=ORSClient)
        connector = RouteConnector(mock_ors)
        
        # Create connected graph
        G = nx.MultiDiGraph()
        G.add_edge((0, 0), (1, 0))
        G.add_edge((1, 0), (1, 1))
        
        result = await connector.connect_components(G)
        
        assert nx.is_weakly_connected(result)
        assert result.number_of_edges() == G.number_of_edges()
    
    @pytest.mark.asyncio
    async def test_connect_two_components(self):
        """Test connecting two disconnected components"""
        mock_ors = AsyncMock(spec=ORSClient)
        mock_ors.get_route = AsyncMock(return_value=([[0.5, 0], [0.5, 1]], 100))
        
        connector = RouteConnector(mock_ors)
        
        # Create disconnected graph
        G = nx.MultiDiGraph()
        # Component 1
        G.add_edge((0, 0), (0, 1), length=100)
        # Component 2
        G.add_edge((1, 0), (1, 1), length=100)
        
        result = await connector.connect_components(G)
        
        # Should be connected after
        assert nx.is_weakly_connected(result)
        assert result.number_of_edges() > G.number_of_edges()
    
    def test_validate_continuity(self):
        """Test route continuity validation"""
        mock_ors = Mock(spec=ORSClient)
        connector = RouteConnector(mock_ors)
        
        # Continuous route (small gaps OK)
        good_coords = [[0, 0], [0.0001, 0], [0.0002, 0]]
        is_valid, violations = connector.validate_route_continuity(good_coords, max_gap=50)
        assert is_valid
        assert len(violations) == 0
        
        # Route with large gap
        bad_coords = [[0, 0], [0, 1], [1, 1]]  # Large jump
        is_valid, violations = connector.validate_route_continuity(bad_coords, max_gap=30)
        assert not is_valid
        assert len(violations) > 0
    
    @pytest.mark.asyncio
    async def test_bridge_gaps(self):
        """Test gap bridging in route"""
        mock_ors = AsyncMock(spec=ORSClient)
        mock_ors.get_route = AsyncMock(return_value=(
            [[0, 0.5], [0.25, 0.5], [0.5, 0.5], [0.5, 1]], 
            100
        ))
        
        connector = RouteConnector(mock_ors)
        
        # Create graph with gap
        G = nx.MultiDiGraph()
        G.add_edge((0, 0), (0, 1), geometry=[[0, 0], [0, 1]])
        G.add_edge((0.5, 1), (1, 1), geometry=[[0.5, 1], [1, 1]])
        
        circuit = [((0, 0), (0, 1)), ((0.5, 1), (1, 1))]
        
        coords = await connector.bridge_route_gaps(G, circuit, max_gap=30)
        
        # Should have bridged the gap
        assert len(coords) > 4  # More than just the original 4 points
        mock_ors.get_route.assert_called()


class TestRouteCalculator:
    """Test Chinese Postman algorithm implementation"""
    
    @pytest.mark.asyncio
    async def test_make_eulerian_already_even(self):
        """Test graph that's already Eulerian"""
        mock_ors = AsyncMock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Square graph - all nodes have even degree
        G = nx.MultiDiGraph()
        G.add_edge((0, 0), (1, 0), length=100)
        G.add_edge((1, 0), (1, 1), length=100)
        G.add_edge((1, 1), (0, 1), length=100)
        G.add_edge((0, 1), (0, 0), length=100)
        
        G_eulerian, stats = await calculator._make_eulerian(G)
        
        assert stats['odd_nodes'] == 0
        assert G_eulerian.number_of_edges() == G.number_of_edges()
    
    @pytest.mark.asyncio
    async def test_make_eulerian_with_odd_nodes(self):
        """Test Eulerization with odd-degree nodes"""
        mock_ors = AsyncMock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Path graph - endpoints have odd degree
        G = nx.MultiDiGraph()
        G.add_edge((0, 0), (1, 0), length=100)
        G.add_edge((1, 0), (0, 0), length=100)  # Bidirectional
        G.add_edge((1, 0), (2, 0), length=100)
        G.add_edge((2, 0), (1, 0), length=100)  # Bidirectional
        
        G_eulerian, stats = await calculator._make_eulerian(G)
        
        assert stats['odd_nodes'] == 2  # Two endpoints
        assert stats['matched_pairs'] == 1
        assert G_eulerian.number_of_edges() > G.number_of_edges()
        
        # All nodes should have even degree
        assert calculator._validate_eulerian(G_eulerian)
    
    def test_validate_eulerian(self):
        """Test Eulerian validation"""
        mock_ors = Mock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Even degree graph
        G_even = nx.MultiDiGraph()
        G_even.add_edge((0, 0), (1, 0))
        G_even.add_edge((1, 0), (0, 0))
        
        assert calculator._validate_eulerian(G_even)
        
        # Odd degree graph
        G_odd = nx.MultiDiGraph()
        G_odd.add_edge((0, 0), (1, 0))
        G_odd.add_edge((1, 0), (2, 0))
        
        assert not calculator._validate_eulerian(G_odd)
    
    def test_find_eulerian_circuit(self):
        """Test Eulerian circuit finding"""
        mock_ors = Mock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Create Eulerian graph (square)
        G = nx.MultiDiGraph()
        G.add_edge((0, 0), (1, 0))
        G.add_edge((1, 0), (1, 1))
        G.add_edge((1, 1), (0, 1))
        G.add_edge((0, 1), (0, 0))
        
        circuit = calculator._find_eulerian_circuit(G)
        
        assert len(circuit) == 4  # Should visit all 4 edges
    
    def test_calculate_route_stats(self):
        """Test route statistics calculation"""
        mock_ors = Mock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Route along equator (easy to calculate)
        coords = [[0, 0], [1, 0], [2, 0]]
        
        length, time = calculator._calculate_route_stats(coords, 'driving-car')
        
        # Should be approximately 222km
        assert 220000 < length < 225000
        # At 10 m/s average speed
        assert 22000 < time < 22500
    
    def test_split_into_chunks(self):
        """Test route chunking"""
        mock_ors = Mock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Create a long route
        coords = [[i * 0.01, 0] for i in range(100)]  # ~111km
        
        # Split into 30-minute chunks
        chunks = calculator.split_into_chunks(coords, 1800, 'driving-car')
        
        assert len(chunks) > 1
        assert all('geometry' in chunk for chunk in chunks)
        assert all('time_s' in chunk for chunk in chunks)
        assert all(chunk['time_s'] <= 1800 * 1.1 for chunk in chunks)  # Allow 10% overage


class TestIntegration:
    """Integration tests for the complete route generation"""
    
    @pytest.mark.asyncio
    async def test_end_to_end_route_generation(self):
        """Test complete route generation process"""
        # Mock ORS client
        mock_ors = AsyncMock(spec=ORSClient)
        mock_ors.get_route = AsyncMock(return_value=([[0, 0], [1, 1]], 100))
        
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Create simple street network
        streets_geojson = {
            'type': 'FeatureCollection',
            'features': [
                {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [[0, 0], [0.001, 0]]
                    },
                    'properties': {'highway': 'residential', 'name': 'Street A'}
                },
                {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [[0.001, 0], [0.001, 0.001]]
                    },
                    'properties': {'highway': 'residential', 'name': 'Street B'}
                }
            ]
        }
        
        result = await calculator.calculate_route(streets_geojson)
        
        assert 'geometry' in result
        assert result['geometry']['type'] == 'LineString'
        assert len(result['geometry']['coordinates']) > 0
        assert 'length_m' in result
        assert 'drive_time_s' in result
        assert 'diagnostics' in result
        assert 'valid' in result
    
    @pytest.mark.asyncio
    async def test_parity_guarantee(self):
        """Test that all nodes have even degree after Eulerization"""
        mock_ors = AsyncMock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Create graph with odd-degree nodes
        G = nx.MultiDiGraph()
        edges = [
            ((0, 0), (1, 0)),
            ((1, 0), (2, 0)),
            ((2, 0), (3, 0)),
            ((3, 0), (4, 0))
        ]
        
        for u, v in edges:
            G.add_edge(u, v, length=100)
            G.add_edge(v, u, length=100)
        
        G_eulerian, stats = await calculator._make_eulerian(G)
        
        # Check all nodes have even degree
        UG = G_eulerian.to_undirected()
        for node in UG.nodes():
            degree = UG.degree(node)
            assert degree % 2 == 0, f"Node {node} has odd degree {degree}"
    
    @pytest.mark.asyncio
    async def test_deadhead_ratio(self):
        """Test that deadhead ratio is reasonable"""
        mock_ors = AsyncMock(spec=ORSClient)
        calculator = RouteCalculator(ors_client=mock_ors)
        
        # Create a simple path that needs doubling
        G = nx.MultiDiGraph()
        G.add_edge((0, 0), (1, 0), length=100)
        G.add_edge((1, 0), (0, 0), length=100)
        G.add_edge((1, 0), (2, 0), length=100)
        G.add_edge((2, 0), (1, 0), length=100)
        
        G_eulerian, stats = await calculator._make_eulerian(G)
        
        assert 'deadhead_ratio' in stats
        assert 0 <= stats['deadhead_ratio'] <= 1.0  # Should be between 0-100%
        assert stats['deadhead_ratio'] < 0.5  # Should be less than 50% for simple graph


if __name__ == '__main__':
    pytest.main([__file__, '-v'])