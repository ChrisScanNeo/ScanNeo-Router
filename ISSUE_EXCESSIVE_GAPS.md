# Issue: Excessive Gaps in Route Generation

## Executive Summary

The route generation worker is finding hundreds of gaps during the final repair phase that should have been handled during the main stitching phase. This causes excessive ORS API calls and long processing times.

## Problem Description

### Current Behavior

When processing a route for the "Localtest" area:

1. Main stitching phase appears to bridge 0 gaps
2. Final repair phase finds 50+ gaps ranging from 15m to 242m
3. Each gap requires an ORS API call, taking 3-5 seconds
4. Job takes 10+ minutes and may timeout

### Expected Behavior

1. Main stitching phase should bridge most gaps
2. Final repair should only handle 0-5 edge cases
3. Job should complete in under 2 minutes

## Evidence from Logs

### Latest Test (2025-08-24 11:50)

```
Running final continuity repair... (main phase bridged 0 gaps)  # <-- PROBLEM: 0 gaps bridged
Final repair: Found 19.9m gap at index 19
Final repair: Found 28.1m gap at index 22
Final repair: Found 29.9m gap at index 23
Final repair: Found 29.9m gap at index 24
Final repair: Found 24.4m gap at index 26
Final repair: Found 21.1m gap at index 29
Final repair: Found 43.3m gap at index 32
Final repair: Found 18.8m gap at index 35
Final repair: Found 16.4m gap at index 37
... (continues for 50+ gaps)
```

## Root Cause Analysis

### Issue 1: Main Stitching Not Working

The main phase in `bridge_route_gaps()` is supposed to handle gaps but is bridging 0:

```python
# /apps/worker/app/services/route_connector.py (lines 435-483)

for idx, edge in enumerate(circuit):
    # Get edge geometry
    seg = get_edge_geom(u, v, key)

    # Check gap with previous segment
    last_pt = out[-1]
    first_pt = seg[0]
    gap = self._haversine(tuple(last_pt), tuple(first_pt))

    if gap <= SNAP_EPS_M:  # <= 1m
        # micro drift: append the first point
        if gap > 0:
            out.append(first_pt)  # RECENTLY FIXED
    elif gap <= SMALL_JOIN_M:  # <= 15m
        # small gap: direct join
        out.append(first_pt)  # WAS MISSING, NOW FIXED
        gaps_bridged += 1
    else:  # > 15m
        # large gap: route with ORS
        bridge = await self.ors_client.get_route(...)
        bridge[0] = [last_pt[0], last_pt[1]]   # Snap start
        bridge[-1] = [first_pt[0], first_pt[1]] # Snap end
        out.extend(bridge[1:])
        gaps_bridged += 1

    # Append segment
    out.extend(seg[1:])

# Result: gaps_bridged = 0 (WHY?)
```

### Issue 2: Edge Geometries Not Connecting

The Eulerian circuit returns edges in order, but their geometries don't connect:

```python
# Example from circuit
Edge 1: ends at [51.123, -0.456]
Edge 2: starts at [51.124, -0.457]  # 19.9m gap!
```

This suggests either:

1. Edges aren't being aligned to nodes properly
2. The graph has disconnected components
3. Edge keys aren't being used correctly

### Issue 3: Graph Building Issues

In `graph_builder.py`, edges should be aligned:

```python
# /apps/worker/app/services/graph_builder.py (lines 200-220)

def _align(self, u, v, geom):
    """Ensure geometry starts at u and ends at v"""
    if not geom or len(geom) < 2:
        return [list(u), list(v)]

    start = tuple(geom[0][:2])
    end = tuple(geom[-1][:2])

    # Check if needs reversal
    if self._close_enough(start, v) and self._close_enough(end, u):
        return list(reversed(geom))

    # Force alignment (quantized)
    aligned = geom.copy()
    aligned[0] = list(u)
    aligned[-1] = list(v)
    return aligned
```

But the alignment might not be working if:

- Nodes aren't quantized consistently
- `_close_enough` tolerance is too strict/loose
- Geometries are being modified after alignment

## Code Flow Analysis

### 1. Circuit Generation

```python
# route_calculator.py (line 415)
circuit = list(nx.eulerian_circuit(G_scc, keys=True))
# Returns: [(node1, node2, key), (node2, node3, key), ...]
```

### 2. Edge Geometry Extraction

```python
# route_connector.py (lines 391-409)
def get_edge_geom(u, v, key=None):
    if use_edge_keys and key is not None:
        data = G.get_edge_data(u, v, key=key)
    else:
        # Fallback: pick shortest edge
        ed = G.get_edge_data(u, v)
        data = min(ed.values(), key=lambda d: d.get('length', inf))

    geom = data.get('geometry', [])
    return self._align(u, v, geom) if geom else [list(u), list(v)]
```

### 3. Gap Detection Problem

The gaps are detected but not in the main loop:

```python
# Main loop processes edges but finds 0 gaps
for edge in circuit:
    seg = get_edge_geom(...)
    gap = calculate_gap(out[-1], seg[0])
    # gap > 15m but not being caught?
```

## Hypothesis: The Real Problem

The issue appears to be that **the circuit edges aren't sequential** or **get_edge_geom isn't returning the right edge**:

1. Circuit returns `[(A,B,0), (C,D,1), ...]` but B ≠ C (disconnected)
2. Or circuit returns `[(A,B,0), (B,C,1), ...]` but geometries don't match nodes
3. Or edge keys are wrong, so we get geometry for different edge

## Debugging Needed

Add logging to understand what's happening:

```python
# In bridge_route_gaps, before the loop:
logger.info(f"Circuit has {len(circuit)} edges")
logger.info(f"First 5 edges: {circuit[:5]}")

# Inside the loop:
if gap > SMALL_JOIN_M:
    logger.warning(f"Edge {idx}: Large gap {gap:.1f}m")
    logger.warning(f"  From edge ({u},{v},key={key})")
    logger.warning(f"  Last pt: {last_pt}, First pt: {first_pt}")
    logger.warning(f"  Edge data exists: {data is not None}")
```

## Proposed Solutions

### Solution 1: Fix Edge Geometry Alignment

Ensure every edge geometry actually connects:

```python
def get_edge_geom(u, v, key=None):
    # ... get data ...

    geom = data.get('geometry', [])
    if not geom:
        logger.warning(f"No geometry for edge ({u},{v},{key})")
        return [list(u), list(v)]

    # Force exact alignment
    aligned = geom.copy()
    aligned[0] = list(u)  # Force start to exactly u
    aligned[-1] = list(v)  # Force end to exactly v

    return aligned
```

### Solution 2: Pre-process Graph to Ensure Connectivity

Before creating circuit, ensure all edges connect:

```python
def validate_graph_connectivity(G):
    for u, v, key, data in G.edges(keys=True, data=True):
        geom = data.get('geometry', [])
        if geom:
            start = tuple(geom[0][:2])
            end = tuple(geom[-1][:2])

            # Check alignment
            if not (close_to(start, u) and close_to(end, v)):
                logger.warning(f"Edge ({u},{v},{key}) not aligned!")
                # Fix it
                data['geometry'] = align(u, v, geom)
```

### Solution 3: Debug Why Main Phase Finds 0 Gaps

Add detailed logging to understand the flow:

```python
logger.info(f"Processing edge {idx}/{len(circuit)}")
logger.info(f"  Edge: {u} -> {v}, key={key}")
logger.info(f"  Segment: {len(seg)} points")
logger.info(f"  Gap: {gap:.1f}m")
logger.info(f"  Action: {'snap' if gap <= 1 else 'direct' if gap <= 15 else 'route'}")
```

## Next Steps

1. **Add diagnostic logging** to understand why main phase bridges 0 gaps
2. **Verify edge geometries** are properly aligned to nodes
3. **Check circuit continuity** - ensure each edge connects to the next
4. **Test with smaller area** to reduce complexity
5. **Consider fallback** - if too many gaps, use different algorithm

## Impact

- **Current**: Jobs take 10+ minutes, may timeout, excessive API usage
- **Target**: Jobs complete in <2 minutes with minimal API calls
- **Users affected**: All route generation requests
- **Severity**: High - core functionality broken
