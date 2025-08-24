# Route Generation Gap Issue - Chinese Postman Implementation

## Problem Summary

After implementing a proper Chinese Postman algorithm with directed graphs and strongly connected components (SCCs), the route generation is creating routes with large gaps (up to 448.8m) between segments, making them non-driveable.

## Current Implementation Status

### ✅ What's Working

1. **Directed graph Eulerization** - Properly balances in/out degree using min-cost flow
2. **SCC processing** - Correctly identifies and processes strongly connected components
3. **SCC ordering** - Uses TSP heuristic to order components optimally
4. **Inter-SCC routing** - Successfully connects different SCCs using OpenRouteService (ORS)
5. **Eulerian circuit generation** - Finds valid circuits for each SCC

### ❌ What's Failing

Routes have massive gaps (202 violations, max 448.8m) within the assembled route, despite having valid Eulerian circuits.

## Technical Details

### Architecture

```
Input: GeoJSON streets → Graph Builder → Directed MultiDiGraph → SCC Processing → Eulerian Circuits → Route Assembly → Output
```

### Key Code Components

1. **Graph Building** (`graph_builder.py`)
   - Builds NetworkX MultiDiGraph from street segments
   - Nodes are (lon, lat) coordinate tuples
   - Edges store: `{length, geometry, highway, name, oneway, osm_id}`
   - Edge 'geometry' is full LineString coordinates array

2. **Route Calculation** (`route_calculator.py`)
   - Processes each SCC independently
   - Makes each SCC Eulerian via min-cost flow
   - Generates Eulerian circuit: List[Tuple[node, node]]
   - Circuit is list of edges as coordinate pairs

3. **Route Assembly** (`route_connector.py::bridge_route_gaps`)
   ```python
   for i, (u, v) in enumerate(circuit):
       # Get edge data from graph
       edge_data = G.get_edge_data(u, v)
       edge_coords = edge_data['geometry']  # Full LineString

       # Check gap with previous segment
       if coords_out:
           last_pt = coords_out[-1]
           first_pt = edge_coords[0]
           gap_distance = haversine(last_pt, first_pt)

           if gap_distance > max_gap:  # 30m default
               # Bridge with ORS routing
               bridge_coords = ors_client.get_route(last_pt, first_pt)
               coords_out.extend(bridge_coords[1:])

       coords_out.extend(edge_coords)
   ```

## The Core Problem

The Eulerian circuit returns edges as `(node_A, node_B)` tuples, but:

1. **Edge geometry mismatch**: The stored geometry for edge (A, B) might be:
   - `[[A'], [intermediate_points...], [B']]`
   - Where A' ≈ A and B' ≈ B but not exactly equal (floating point precision)

2. **Circuit edge ordering**: The circuit gives edges in traversal order, but:
   - Edge 1 ends at coordinate `[x1, y1]` (last point of its geometry)
   - Edge 2 starts at coordinate `[x2, y2]` (first point of its geometry)
   - Even if both edges share node B, the geometries might not align

3. **Example**:

   ```
   Circuit: [(A, B), (B, C), (C, A)]

   Edge (A, B) geometry: [[0.1, 0.1], [0.15, 0.15], [0.2, 0.2]]
   Edge (B, C) geometry: [[0.20001, 0.20001], [0.3, 0.3]]  # Slight mismatch!
   Edge (C, A) geometry: [[0.3, 0.3], [0.1, 0.1]]

   Result: Gap between [0.2, 0.2] and [0.20001, 0.20001]
   ```

## Actual Log Evidence

```
2025-08-24 08:28:22,866 - SCC 0: Generated 423 coordinates
2025-08-24 08:28:23,065 - SCC 1: Generated 7 coordinates
2025-08-24 08:28:23,165 - Connecting SCCs with 182m gap
2025-08-24 08:28:27,767 - ORS route found: 229m
2025-08-24 08:28:28,567 - Found 202 continuity violations
2025-08-24 08:28:28,567 - Gap at index 1: 448.8m
2025-08-24 08:28:28,666 - Gap at index 416: 448.8m
```

Note: "Bridged 0 gaps" - the bridge_route_gaps function isn't actually bridging anything!

## Root Causes

1. **Coordinate precision issues**: Nodes in graph are float tuples, geometries are lists - tiny differences cause mismatches
2. **Edge geometry not aligned with nodes**: Edge from A→B doesn't necessarily start exactly at A or end exactly at B
3. **Gap detection threshold**: Only bridges if gap > 30m, but should bridge ANY gap for continuity
4. **Missing edge data handling**: Some edges in circuit might not have geometry data

## Questions for Solution

1. Should we normalize coordinates (round to 6 decimal places) when building the graph?
2. Should we enforce that edge geometries MUST start/end at their respective nodes?
3. Should we bridge ALL gaps regardless of size?
4. Should we store edge references in the circuit instead of just node pairs?
5. Should we use a different approach - store the actual edge geometry with the circuit?

## Proposed Solutions

### Option 1: Fix Coordinate Alignment

- Round all coordinates to 6 decimal places (0.1m precision)
- Ensure edge geometries start/end exactly at node coordinates
- Modify graph builder to snap geometry endpoints to nodes

### Option 2: Bridge All Gaps

- Remove the `max_gap` threshold in bridge_route_gaps
- Always use ORS to connect consecutive edge geometries
- Cache routes to avoid excessive API calls

### Option 3: Store Edge References

- Modify Eulerian circuit to return edge IDs/keys instead of just (u,v) tuples
- Store full edge data with circuit
- Assemble route using stored geometries directly

### Option 4: Post-Process Route

- After assembly, scan entire route for gaps
- Use ORS to fill all gaps in a single pass
- Validate final continuity

## Current Workaround Attempts

- Added logging to track gap bridging (but it shows 0 gaps bridged)
- Tried to handle missing edge data by routing directly between nodes
- Added fallback to straight lines when ORS fails

## What We Need Help With

1. **Best practice for coordinate precision** in graph-based route generation?
2. **How to ensure edge geometries align** with graph nodes?
3. **Should Eulerian circuit return edge references** instead of node pairs?
4. **Is there a standard approach** for assembling continuous routes from graph circuits?
5. **How do other routing systems** (OSRM, Valhalla) handle this?

## System Context

- Python 3.12, NetworkX 3.2.1
- OpenRouteService for gap routing
- PostgreSQL/PostGIS for storage
- Street data from OpenStreetMap via Overpass API
- ~100-500 street segments per area
- Requirement: Routes must be continuously driveable (max 30m gaps)
