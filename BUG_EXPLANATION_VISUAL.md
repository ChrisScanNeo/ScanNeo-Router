# Visual Explanation: The Infinite Loop Bug

## What Should Happen (Correct Behavior)

Imagine you have two disconnected street networks that need to be connected:

```
COMPONENT 1 (3 nodes)          COMPONENT 2 (3 nodes)
    A---B                           D---E
     \                               /
      C                             F

Nodes: A(0,0), B(1,0), C(0.5,-1)   Nodes: D(5,0), E(6,0), F(5.5,-1)
```

The algorithm finds the closest nodes between components (say B and D) and gets a route from OpenRouteService:

```
ORS returns route: [(1,0), (2,0.1), (3,0.2), (4,0.1), (5,0)]
                     ^                                    ^
                     B                                    D
```

**CORRECT**: Connect B to route start, route end to D:

```
    A---B===(route)===D---E
     \                 /
      C               F

Now it's ONE connected component! ✅
```

## What's Actually Happening (The Bug)

The current code does this instead:

```
COMPONENT 1             COMPONENT 2           COMPONENT 3 (New!)
    A---B                   D---E             (1,0)---(2,0.1)---(3,0.2)---(4,0.1)---(5,0)
     \                       /                   ^                                      ^
      C                     F                 Route floating in space, not connected!
```

The route is added as a THIRD component that's not connected to anything!

## The Infinite Loop

Here's what happens step by step:

### Iteration 1:

```
Components: 4 (let's say we have 4 street segments)
Find closest pair: Component 1 & 2
Get ORS route: 1m connection
Add route (BUT IT'S FLOATING)
Result: Still 4 components! (3 original + 1 floating route)
```

### Iteration 2:

```
Components: 4
Find closest pair: Component 1 & 3
Get ORS route: 41m connection
Add route (ALSO FLOATING)
Result: Still 4 components! (3 original + 1 merged floating routes)
```

### Iteration 3:

```
Components: 4
Find closest pair: Component 2 & 3
Get ORS route: 166m connection
Add route (STILL FLOATING)
Result: 3 components (finally merged something, but wrong things!)
```

### Iteration 4-∞:

```
The algorithm keeps finding the same "best" connections
Makes the same ORS calls (1m, 41m, 166m, 160m, 144m...)
"Reduces to 3 components"
But never reaches 1 component
REPEATS FOREVER! 🔄
```

## Why The Logs Repeat

The logs show this pattern repeating:

```
ORS route found: 1m      <- Same connection attempt
ORS route found: 41m     <- Same connection attempt
ORS route found: 166m    <- Same connection attempt
ORS route found: 160m    <- Same connection attempt
ORS route found: 144m    <- Same connection attempt
Connecting components 1 and 2 with 1m route
Reduced to 3 components  <- Never gets below 3!
[REPEATS THE SAME PATTERN]
```

## The Code Bug

In `route_connector.py`, the `_add_route_to_graph` method:

```python
def _add_route_to_graph(self, G, coords, is_connector=False):
    for i in range(len(coords) - 1):
        start = tuple(coords[i])    # New node from route
        end = tuple(coords[i + 1])  # New node from route
        G.add_edge(start, end, ...)  # Edge between NEW nodes only!
    # MISSING: No connection to the original components!
```

It should be:

```python
def _add_route_to_graph(self, G, coords, source_node, target_node):
    # Connect source component to route start
    G.add_edge(source_node, tuple(coords[0]), ...)

    # Add route edges
    for i in range(len(coords) - 1):
        start = tuple(coords[i])
        end = tuple(coords[i + 1])
        G.add_edge(start, end, ...)

    # Connect route end to target component
    G.add_edge(tuple(coords[-1]), target_node, ...)
```

## Impact

- **Jobs never complete**: They stay in "pending" forever
- **Worker stuck**: Uses 100% CPU in infinite loop
- **Same ORS calls repeated**: Wastes API quota
- **No routes generated**: The entire system is blocked

## The Fix

We need to:

1. Track which nodes in each component we're connecting (B and D in example)
2. Pass these nodes to `_add_route_to_graph`
3. Actually connect the route endpoints to these nodes
4. Then the components will merge into one!
