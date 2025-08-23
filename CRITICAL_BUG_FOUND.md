# CRITICAL BUG: Infinite Loop in Route Connector

**Date Found**: August 23, 2025
**Severity**: CRITICAL - Blocks all route generation
**Status**: ACTIVE - Not yet fixed

## Problem Description

The worker service gets stuck in an infinite loop when trying to connect disconnected street network components. This completely blocks route generation from completing.

## Root Cause

In `/apps/worker/app/services/route_connector.py`, the `_add_route_to_graph` method adds ORS route coordinates as new edges but **does NOT connect them to the existing component nodes**.

The bug is on line 81-82:

```python
# Add connecting edges to graph
self._add_route_to_graph(G_connected, route_coords, is_connector=True)
```

The `_add_route_to_graph` method creates edges between the route coordinates:

```python
for i in range(len(coords) - 1):
    start = tuple(coords[i])
    end = tuple(coords[i + 1])
    # ...
    G.add_edge(start, end, **edge_data)  # <-- Creates floating route
```

But it never connects the first coordinate to a node in component_i or the last coordinate to a node in component_j. The route floats disconnected between the components.

## Symptoms

1. Worker logs show repeating pattern of ORS calls:
   - "ORS route found: 1m"
   - "ORS route found: 41m"
   - "ORS route found: 166m"
   - "ORS route found: 160m"
   - "ORS route found: 144m"
   - "Connecting components 1 and 2 with 1m route"
   - "Reduced to 3 components"
   - (repeats forever)

2. Jobs remain in "pending" status forever
3. Worker appears healthy but doesn't update database
4. CPU usage likely at 100% due to infinite loop

## Fix Required

The `_add_route_to_graph` method needs to:

1. Connect the FIRST coordinate of the route to the nearest node in the source component
2. Connect the LAST coordinate of the route to the nearest node in the destination component
3. Only then add the intermediate route edges

Example fix:

```python
def _add_route_to_graph(
    self,
    G: nx.MultiDiGraph,
    coords: List[List[float]],
    is_connector: bool = False,
    source_node: Optional[Tuple] = None,  # Add these parameters
    target_node: Optional[Tuple] = None
):
    """Add route coordinates as edges to graph"""

    if len(coords) < 2:
        return

    # Connect source node to first route coordinate if provided
    if source_node and coords:
        first_coord = tuple(coords[0])
        if source_node != first_coord:
            length_m = self._haversine(source_node, first_coord)
            G.add_edge(source_node, first_coord,
                      length=length_m,
                      is_connector=True,
                      highway='connector')

    # Add route edges
    for i in range(len(coords) - 1):
        start = tuple(coords[i])
        end = tuple(coords[i + 1])
        # ... existing code ...
        G.add_edge(start, end, **edge_data)

    # Connect last route coordinate to target node if provided
    if target_node and coords:
        last_coord = tuple(coords[-1])
        if target_node != last_coord:
            length_m = self._haversine(last_coord, target_node)
            G.add_edge(last_coord, target_node,
                      length=length_m,
                      is_connector=True,
                      highway='connector')
```

And update the caller to pass the actual component nodes that need connecting.

## Impact

- **All route generation is blocked** - No routes can be completed
- **Worker resources wasted** - Infinite loop consumes CPU
- **Database never updated** - Jobs appear stuck forever

## Workaround

None. The worker must be fixed and redeployed.

## Testing After Fix

1. Create a test job for a small area
2. Monitor worker logs for successful completion
3. Verify job status changes from pending → processing → completed
4. Check that route has no large gaps in diagnostics
