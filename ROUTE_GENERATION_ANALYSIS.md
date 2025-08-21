# Route Generation Analysis - Chinese Postman Problem Implementation

## Overview

The ScanNeo-Router system is designed to generate optimal driving routes that cover all streets in a given area. The implementation uses the Chinese Postman Problem algorithm to find the shortest route that traverses every street at least once. However, the current implementation has critical issues causing routes to jump randomly across the city instead of following connected roads.

## System Architecture

- **Admin Dashboard**: Next.js app on Vercel for area management and route visualization
- **Python Worker**: FastAPI service on Cloud Run that processes route generation jobs
- **Database**: PostgreSQL with PostGIS for spatial data storage
- **APIs**: OpenStreetMap (via Overpass) for street data, OpenRouteService for routing

## Current Implementation

### 1. Street Data Fetching (`/apps/worker/app/services/osm_fetcher.py`)

The system fetches street data from OpenStreetMap using the Overpass API:

```python
class OSMFetcher:
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

    def _osm_to_geojson(self, osm_data: Dict[str, Any], area_geom: Any) -> List[Dict[str, Any]]:
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
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': coords
                }
            }
            features.append(feature)

        return features
```

### 2. Graph Building (`/apps/worker/app/services/route_calculator.py`)

The system builds a NetworkX graph from the street data:

```python
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

        # Add edge between first and last point only (PROBLEM #1)
        start = tuple(coords[0])
        end = tuple(coords[-1])

        # Store edge data
        edge_data = {
            'length': length_m,
            'geometry': coords,  # Stores full geometry but only uses endpoints
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
```

**PROBLEM #1**: The graph only connects street endpoints, not actual intersections. Streets that cross in the middle won't be connected in the graph.

### 3. Making Graph Eulerian (`/apps/worker/app/services/route_calculator.py`)

The Chinese Postman algorithm requires making the graph Eulerian (all vertices have even degree):

```python
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

    # Simple pairing (not optimal but works) - PROBLEM #2
    for i in range(0, len(odd_nodes), 2):
        if i + 1 < len(odd_nodes):
            node1 = odd_nodes[i]
            node2 = odd_nodes[i + 1]

            # Add virtual edge - PROBLEM #3
            G_eulerian.add_edge(node1, node2,
                               length=0,
                               virtual=True,
                               geometry=[list(node1), list(node2)])

    return G_eulerian
```

**PROBLEM #2**: Uses simple sequential pairing instead of minimum-weight matching. This creates inefficient pairings.

**PROBLEM #3**: Adds virtual edges as straight lines between nodes instead of actual routing paths.

### 4. Finding Eulerian Circuit (`/apps/worker/app/services/route_calculator.py`)

```python
def _find_eulerian_circuit(self, G: nx.MultiGraph) -> List[Tuple]:
    """Find Eulerian circuit in the graph"""
    try:
        # Check if graph is connected
        if not nx.is_connected(G):
            # Find largest connected component - PROBLEM #4
            largest_cc = max(nx.connected_components(G), key=len)
            G = G.subgraph(largest_cc).copy()

        # Find Eulerian circuit
        circuit = list(nx.eulerian_circuit(G))
        return circuit
    except Exception as e:
        logger.warning(f"Could not find Eulerian circuit: {e}")
        # Return edges as fallback
        return list(G.edges())
```

**PROBLEM #4**: Only uses the largest connected component, ignoring disconnected street segments.

### 5. Converting Circuit to Route (`/apps/worker/app/services/route_calculator.py`)

```python
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
                all_coords.extend(coords)  # PROBLEM #5
                total_length += data.get('length', 0)

    # Create LineString geometry
    geometry = {
        'type': 'LineString',
        'coordinates': all_coords
    }

    return geometry, total_length, drive_time
```

**PROBLEM #5**: Simply concatenates all coordinates without ensuring continuity. This creates jumps between non-connected segments.

### 6. Fallback to Mock Route

When the algorithm fails, it falls back to a mock route that just concatenates all street coordinates:

```python
def _mock_route(self, streets_geojson: Dict[str, Any]) -> Dict[str, Any]:
    """Create a mock route for testing"""
    # Collect all coordinates
    all_coords = []
    total_length = 0

    for feature in streets_geojson.get('features', []):
        geom = feature.get('geometry', {})
        if geom.get('type') == 'LineString':
            coords = geom.get('coordinates', [])
            all_coords.extend(coords)  # Just concatenates everything!

    return {
        'geometry': {
            'type': 'LineString',
            'coordinates': all_coords
        },
        'route': [],
        'length_m': total_length,
        'drive_time_s': total_length / 10
    }
```

## Why Routes Jump Around

The current implementation creates routes that jump randomly because:

1. **Graph Construction Issues**:
   - Only connects street endpoints, missing intersections where streets cross
   - Doesn't detect actual street connectivity
   - Streets that should be connected aren't linked in the graph

2. **Poor Odd-Degree Matching**:
   - Uses sequential pairing instead of finding shortest paths
   - Creates virtual edges as straight lines instead of actual routes
   - No consideration for actual driving distance

3. **Disconnected Components**:
   - Only processes the largest connected component
   - Ignores isolated street segments
   - No attempt to connect disconnected parts

4. **Route Assembly**:
   - Simply concatenates coordinates from edges
   - No validation of route continuity
   - No routing between disconnected segments
   - Creates impossible jumps between non-adjacent streets

## Example of the Problem

Given streets A, B, C that don't directly connect:

```
Street A: [(0,0), (0,1)]
Street B: [(2,2), (2,3)]  # Not connected to A
Street C: [(1,0), (1,1)]  # Should connect A and C at (0,0) and (1,0)
```

Current output:

```
Route: [(0,0), (0,1), (2,2), (2,3), (1,0), (1,1)]
       # Jumps from (0,1) to (2,2) - impossible to drive!
```

## Required Fixes

### 1. Proper Intersection Detection

```python
def find_intersections(streets):
    # Find where streets actually cross or touch
    # Build graph with nodes at real intersections
    # Split streets at intersection points
```

### 2. Minimum Weight Matching

```python
def minimum_weight_matching(odd_nodes, graph):
    # Use Dijkstra to find shortest paths between odd nodes
    # Use Hungarian algorithm for optimal pairing
    # Add actual routing paths, not straight lines
```

### 3. Connect Disconnected Components

```python
def connect_components(components):
    # Find nearest points between components
    # Use OpenRouteService to get actual driving route
    # Add connecting edges to make graph connected
```

### 4. Validate and Fix Route Continuity

```python
def ensure_route_continuity(circuit):
    # Check each edge transition
    # If endpoints don't match, add routing
    # Validate final route has no jumps
```

## Test Results

From TEST_PLAN.md:

- Area Import: ✅ PASS
- Route Generation: ✅ PASS (job created)
- Worker Processing: ✅ PASS (completes)
- Route Visualization: ✅ PASS (displays)
- **Route Quality: ❌ FAIL - Routes jump across city, not following roads**

Issues identified:

1. Routes contain jumps - not following connected road network
2. Routes cross areas without using roads (straight lines)
3. Route sequence not optimized for continuous driving
4. Missing turn-by-turn navigation between segments

## Correct Chinese Postman Implementation

A proper implementation should:

1. **Build Connected Graph**:
   - Detect actual intersections
   - Split streets at intersection points
   - Ensure graph connectivity

2. **Optimal Matching**:
   - Find shortest paths between odd-degree nodes
   - Use minimum-weight perfect matching
   - Add duplicate edges along shortest paths

3. **Hierholzer's Algorithm**:
   - Properly traverse multigraph
   - Handle parallel edges
   - Build continuous circuit

4. **Route Assembly**:
   - Validate continuity at each step
   - Use routing API for disconnected segments
   - Ensure driveable path

## Configuration

Current configuration in `/apps/worker/app/config.py`:

```python
overpass_url: str = "https://overpass-api.de/api/interpreter"
openrouteservice_api_key: str = ""  # Not configured!
openrouteservice_url: str = "https://api.openrouteservice.org/v2/directions/"
```

**Note**: OpenRouteService API key is not configured, preventing proper routing between segments.

## Summary

The route generation fails because:

1. Graph doesn't represent actual street connectivity
2. Odd-degree node matching is suboptimal
3. Disconnected components are ignored
4. No routing between gaps in the circuit
5. Route assembly doesn't ensure continuity

The result is a route that jumps randomly between streets instead of following a driveable path. The Chinese Postman algorithm implementation needs a complete rewrite to properly handle real-world street networks.
