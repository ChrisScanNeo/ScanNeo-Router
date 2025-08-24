# Infinite Loop Issue: 33.3m Gap at Index 4

## Problem Summary

The route generation worker is stuck in an infinite loop, repeatedly trying to fix a 33.3m gap at index 4. Despite multiple attempts to fix this issue with coordinate quantization, edge key tracking, and gap thresholds, the same gap keeps appearing and being processed repeatedly.

## Current Behavior

- Worker repeatedly logs: `Final repair: Found 33.3m gap at index 4`
- Each attempt calls ORS API to route the 34m gap
- The gap is never successfully bridged, causing infinite API calls
- Job never completes, stays in "processing" state forever

## Previous Fix Attempts

1. **Coordinate Quantization** - Round coordinates to 6 decimal places
2. **Edge Key Tracking** - Use edge keys in Eulerian circuits
3. **Gap Thresholds** - Snap <1m, direct <15m, route >15m
4. **Infinite Loop Prevention** - Check if same gap repeats

## Log Evidence

```
2025-08-24 10:04:48,833 - app.services.route_connector - WARNING - Final repair: Found 33.3m gap at index 4
2025-08-24 10:04:52,534 - app.services.route_connector - WARNING - Final repair: Found 33.3m gap at index 4
2025-08-24 10:04:56,634 - app.services.route_connector - WARNING - Final repair: Found 33.3m gap at index 4
```

## Relevant Code Files

### 1. Route Connector (`/apps/worker/app/services/route_connector.py`)

This is where the gap bridging and repair logic lives. Key sections:

- `bridge_route_gaps()` - Main function that processes gaps
- `_repair_large_gaps()` - Final repair pass that's getting stuck
- Gap thresholds: SNAP_EPS_M=1.0, SMALL_JOIN_M=15.0

### 2. Route Calculator (`/apps/worker/app/services/route_calculator.py`)

Orchestrates the route generation:

- Calls `bridge_route_gaps()` with the Eulerian circuit
- Manages the overall flow

### 3. Graph Builder (`/apps/worker/app/services/graph_builder.py`)

Builds the street network graph:

- Implements coordinate quantization
- Creates edges with proper start/end alignment

## Hypothesis

The issue appears to be in the final repair logic where:

1. A gap is detected at index 4
2. The gap is routed successfully (34m route found)
3. But the routed segment is not properly inserted/connected
4. Next iteration finds the same gap again

## The Problematic Code Section

The infinite loop occurs in `_repair_continuity()` function in `/apps/worker/app/services/route_connector.py` (lines 494-546):

```python
async def _repair_continuity(self, coords: List[List[float]], profile: str) -> int:
    """Final pass: stitch any remaining gaps > SNAP_EPS_M"""
    if not coords or len(coords) < 2:
        return 0

    fixed = 0
    i = 0

    while i < len(coords) - 1:
        a = coords[i]
        b = coords[i + 1]
        gap = self._haversine(tuple(a), tuple(b))

        if gap > SMALL_JOIN_M:  # SMALL_JOIN_M = 15.0
            logger.warning(f"Final repair: Found {gap:.1f}m gap at index {i}")

            try:
                # Get route from ORS API
                bridge, _ = await self.ors_client.get_route(tuple(a), tuple(b), profile=profile)

                if bridge and len(bridge) > 2:
                    # Replace the gap with the bridge
                    coords[i:i+2] = [a] + bridge[1:]  # <-- POTENTIAL ISSUE HERE
                    fixed += 1
                    # Don't increment i - check this position again
                    continue  # <-- THIS CAUSES RECHECK AT SAME INDEX
            except Exception as e:
                logger.error(f"Final repair failed: {e}")

        i += 1
```

## The Problem

When a gap is found and bridged at line 529:

```python
coords[i:i+2] = [a] + bridge[1:]
```

The code:

1. Replaces points at indices `i` and `i+1` with `[a]` plus the bridge points
2. Does NOT increment `i` (due to `continue`)
3. Rechecks the same index position

**The Issue**: If the bridge insertion doesn't properly connect (e.g., the last point of `bridge` doesn't match what was at `coords[i+1]`), the gap persists and we loop forever.

## Why It Happens

The ORS API returns a route of 34m for a 33.3m gap, but when we insert it:

- We keep point `a` (coords[i])
- We add all bridge points except the first (bridge[1:])
- But the last bridge point might not exactly match the original `b` (coords[i+1])
- This creates a new gap at the same or nearby index

## Questions for ChatGPT

1. Should we be replacing `coords[i:i+2]` or `coords[i+1:i+2]` to avoid duplicating point `a`?
2. Should we check if `bridge[-1]` equals `b` before insertion?
3. Would it be better to insert the bridge BETWEEN points rather than replacing them?
4. Should we add loop detection to prevent infinite retries at the same index?
5. Is the issue that we're not properly aligning the bridge endpoints with the existing coordinates?

## Test Area

The issue occurs consistently with the "Localtest" area, which appears to have some disconnected street segments that require bridging at index 4.
