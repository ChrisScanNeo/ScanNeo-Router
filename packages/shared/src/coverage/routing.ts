import { StreetNetwork, StreetSegment } from './streets';

export interface RouteSegment extends StreetSegment {
  direction?: 'forward' | 'reverse';
  visitCount?: number;
}

export interface OptimizedRoute {
  segments: RouteSegment[];
  totalDistance: number;
  estimatedDuration: number;
  coveragePercentage: number;
  waypoints: Array<{
    lat: number;
    lng: number;
    type?: 'start' | 'end' | 'waypoint' | 'u-turn';
  }>;
  optimizationStrategy?: string;
}

export interface RouteMetrics {
  efficiency: number;
  redundancy: number;
  coverageRatio: number;
  redundantSegments?: string[];
}

export interface RouteOptions {
  algorithm?: 'chinese-postman' | 'nearest-neighbor' | 'genetic';
  strategy?: 'auto' | 'minimize-distance' | 'minimize-turns';
  returnToStart?: boolean;
  maxDuration?: number; // seconds
  maxDistance?: number; // meters
  avoidHighways?: boolean;
  preferMainRoads?: boolean;
}

// Chinese Postman Problem solver for optimal street coverage
class ChinesePostmanSolver {
  private network: StreetNetwork;
  private adjacencyList: Map<string, Array<{ node: string; weight: number; segmentId: string }>>;

  constructor(network: StreetNetwork) {
    this.network = network;
    this.adjacencyList = this.buildAdjacencyList();
  }

  private buildAdjacencyList() {
    const adj = new Map<string, Array<{ node: string; weight: number; segmentId: string }>>();

    for (const segment of this.network.segments) {
      if (!adj.has(segment.startNode)) {
        adj.set(segment.startNode, []);
      }
      if (!adj.has(segment.endNode)) {
        adj.set(segment.endNode, []);
      }

      adj.get(segment.startNode)!.push({
        node: segment.endNode,
        weight: segment.length,
        segmentId: segment.id,
      });

      // Add reverse edge if not one-way
      if (!segment.tags?.oneway || segment.tags.oneway === 'no') {
        adj.get(segment.endNode)!.push({
          node: segment.startNode,
          weight: segment.length,
          segmentId: segment.id,
        });
      }
    }

    return adj;
  }

  findOddDegreeNodes(): string[] {
    const degrees = new Map<string, number>();

    for (const [node, edges] of this.adjacencyList) {
      degrees.set(node, edges.length);
    }

    return Array.from(degrees.entries())
      .filter(([_, degree]) => degree % 2 === 1)
      .map(([node, _]) => node);
  }

  findShortestPath(start: string, end: string): { path: string[]; distance: number } {
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>(this.adjacencyList.keys());

    for (const node of unvisited) {
      distances.set(node, node === start ? 0 : Infinity);
      previous.set(node, null);
    }

    while (unvisited.size > 0) {
      let current: string | null = null;
      let minDistance = Infinity;

      for (const node of unvisited) {
        const dist = distances.get(node)!;
        if (dist < minDistance) {
          minDistance = dist;
          current = node;
        }
      }

      if (!current || minDistance === Infinity) break;

      unvisited.delete(current);

      if (current === end) break;

      const edges = this.adjacencyList.get(current) || [];
      for (const edge of edges) {
        if (!unvisited.has(edge.node)) continue;

        const alt = distances.get(current)! + edge.weight;
        if (alt < distances.get(edge.node)!) {
          distances.set(edge.node, alt);
          previous.set(edge.node, current);
        }
      }
    }

    const path: string[] = [];
    let current: string | null = end;

    while (current) {
      path.unshift(current);
      current = previous.get(current) || null;
    }

    return {
      path,
      distance: distances.get(end) || Infinity,
    };
  }

  solve(startNode: string): string[] {
    const oddNodes = this.findOddDegreeNodes();
    const duplicatedEdges: Array<[string, string]> = [];

    // Pair up odd-degree nodes and find shortest paths between them
    if (oddNodes.length > 0) {
      const paired = new Set<string>();

      for (const node1 of oddNodes) {
        if (paired.has(node1)) continue;

        let minDistance = Infinity;
        let bestPair: string | null = null;

        for (const node2 of oddNodes) {
          if (node1 === node2 || paired.has(node2)) continue;

          const { distance } = this.findShortestPath(node1, node2);
          if (distance < minDistance) {
            minDistance = distance;
            bestPair = node2;
          }
        }

        if (bestPair) {
          paired.add(node1);
          paired.add(bestPair);
          const { path } = this.findShortestPath(node1, bestPair);
          for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to = path[i + 1];
            if (from !== undefined && to !== undefined) {
              duplicatedEdges.push([from, to]);
            }
          }
        }
      }
    }

    // Build Eulerian path
    return this.findEulerianPath(startNode, duplicatedEdges);
  }

  private findEulerianPath(start: string, additionalEdges: Array<[string, string]>): string[] {
    const graph = new Map<string, string[]>();

    // Build graph with all edges
    for (const [node, edges] of this.adjacencyList) {
      graph.set(node, edges.map(e => e.node));
    }

    // Add duplicated edges
    for (const [from, to] of additionalEdges) {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from)!.push(to);
    }

    const path: string[] = [];
    const stack = [start];
    const edgeCount = new Map<string, Map<string, number>>();

    // Initialize edge counts
    for (const [node, neighbors] of graph) {
      if (!edgeCount.has(node)) edgeCount.set(node, new Map());
      for (const neighbor of neighbors) {
        const count = edgeCount.get(node)!.get(neighbor) || 0;
        edgeCount.get(node)!.set(neighbor, count + 1);
      }
    }

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      if (!current) break;
      const edges = edgeCount.get(current);

      if (edges && Array.from(edges.values()).some(count => count > 0)) {
        // Find next unvisited edge
        for (const [neighbor, count] of edges) {
          if (count > 0) {
            edges.set(neighbor, count - 1);
            stack.push(neighbor);
            break;
          }
        }
      } else {
        path.push(stack.pop()!);
      }
    }

    return path.reverse();
  }
}

export async function generateOptimalRoute(
  network: StreetNetwork,
  startPoint: { lat: number; lng: number },
  options: RouteOptions = {}
): Promise<OptimizedRoute> {
  // Find nearest node to start point
  let nearestNode: string | null = null;
  let minDistance = Infinity;

  for (const [nodeId, node] of Object.entries(network.nodes)) {
    const dist = Math.sqrt(
      Math.pow(node.lat - startPoint.lat, 2) + Math.pow(node.lon - startPoint.lng, 2)
    );
    if (dist < minDistance) {
      minDistance = dist;
      nearestNode = nodeId;
    }
  }

  if (!nearestNode) {
    throw new Error('No nodes found in network');
  }

  // Select algorithm based on options or network characteristics
  const algorithm = options.algorithm || 'chinese-postman';
  const strategy = options.strategy || determineStrategy(network);

  let nodePath: string[];

  if (algorithm === 'chinese-postman') {
    const solver = new ChinesePostmanSolver(network);
    nodePath = solver.solve(nearestNode);
  } else {
    // Fallback to simple DFS traversal
    nodePath = performDFSTraversal(network, nearestNode);
  }

  // Convert node path to segments
  const segments: RouteSegment[] = [];
  const waypoints: OptimizedRoute['waypoints'] = [];
  let totalDistance = 0;

  for (let i = 0; i < nodePath.length - 1; i++) {
    const currentNode = nodePath[i];
    const nextNode = nodePath[i + 1];
    
    if (!currentNode || !nextNode) continue;

    // Find segment between nodes
    const segment = network.segments.find(
      s =>
        (s.startNode === currentNode && s.endNode === nextNode) ||
        (s.startNode === nextNode && s.endNode === currentNode)
    );

    if (segment) {
      const direction = segment.startNode === currentNode ? 'forward' : 'reverse';
      segments.push({
        ...segment,
        direction,
        visitCount: 1,
      });
      totalDistance += segment.length;

      // Add waypoint
      const node = network.nodes[currentNode];
      if (node) {
        waypoints.push({
          lat: node.lat,
          lng: node.lon,
          type: i === 0 ? 'start' : 'waypoint',
        });
      }
    }
  }

  // Add final waypoint
  const lastNodeId = nodePath[nodePath.length - 1];
  const lastNode = lastNodeId ? network.nodes[lastNodeId] : undefined;
  if (lastNode) {
    waypoints.push({
      lat: lastNode.lat,
      lng: lastNode.lon,
      type: options.returnToStart && nodePath[0] === nodePath[nodePath.length - 1] ? 'start' : 'end',
    });
  }

  // Calculate coverage
  const uniqueSegments = new Set(segments.map(s => s.id));
  const coveragePercentage = (uniqueSegments.size / network.segments.length) * 100;

  // Estimate duration (assume 30 km/h average speed)
  const estimatedDuration = (totalDistance / 1000 / 30) * 3600; // seconds

  return {
    segments,
    totalDistance,
    estimatedDuration,
    coveragePercentage,
    waypoints,
    optimizationStrategy: strategy,
  };
}

function determineStrategy(network: StreetNetwork): string {
  const density = network.metadata?.density || 'medium';
  const type = network.metadata?.type || 'suburban';

  if (type === 'urban' || density === 'high') {
    return 'minimize-distance';
  } else if (type === 'rural' || density === 'low') {
    return 'minimize-turns';
  }

  return 'balanced';
}

function performDFSTraversal(network: StreetNetwork, startNode: string): string[] {
  const visited = new Set<string>();
  const path: string[] = [];

  function dfs(node: string) {
    visited.add(node);
    path.push(node);

    const nodeData = network.nodes[node];
    if (!nodeData) return;

    for (const neighbor of nodeData.connections) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
        path.push(node); // Backtrack
      }
    }
  }

  dfs(startNode);
  return path;
}

export function calculateRouteEfficiency(
  route: OptimizedRoute,
  network: StreetNetwork
): RouteMetrics {
  const totalStreetLength = network.segments.reduce((sum, seg) => sum + seg.length, 0);
  const efficiency = totalStreetLength / route.totalDistance;

  // Count redundant visits
  const segmentVisits = new Map<string, number>();
  for (const segment of route.segments) {
    const count = segmentVisits.get(segment.id) || 0;
    segmentVisits.set(segment.id, count + 1);
  }

  const redundantSegments = Array.from(segmentVisits.entries())
    .filter(([_, count]) => count > 1)
    .map(([id, _]) => id);

  const redundancy = redundantSegments.length / network.segments.length;
  const coverageRatio = route.coveragePercentage / 100;

  return {
    efficiency,
    redundancy,
    coverageRatio,
    redundantSegments,
  };
}

export function detectOverlaps(
  routes: Array<{ segments: RouteSegment[]; totalDistance: number }>
): Array<{ segmentId: string; routeIndices: number[] }> {
  const segmentToRoutes = new Map<string, number[]>();

  routes.forEach((route, routeIndex) => {
    route.segments.forEach(segment => {
      if (!segmentToRoutes.has(segment.id)) {
        segmentToRoutes.set(segment.id, []);
      }
      segmentToRoutes.get(segment.id)!.push(routeIndex);
    });
  });

  const overlaps: Array<{ segmentId: string; routeIndices: number[] }> = [];

  for (const [segmentId, routeIndices] of segmentToRoutes) {
    if (routeIndices.length > 1) {
      overlaps.push({ segmentId, routeIndices });
    }
  }

  return overlaps;
}

export function mergeRoutes(
  routes: Array<{
    segments: RouteSegment[];
    totalDistance: number;
    waypoints: OptimizedRoute['waypoints'];
  }>,
  options: { addConnections?: boolean } = {}
): OptimizedRoute {
  const allSegments: RouteSegment[] = [];
  const allWaypoints: OptimizedRoute['waypoints'] = [];
  let totalDistance = 0;

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    if (!route) continue;
    
    // Add route segments
    allSegments.push(...route.segments);
    totalDistance += route.totalDistance;

    // Add waypoints
    if (i === 0) {
      allWaypoints.push(...route.waypoints);
    } else {
      // Skip first waypoint of subsequent routes to avoid duplication
      allWaypoints.push(...route.waypoints.slice(1));
    }

    // Add connection to next route if requested
    if (options.addConnections && i < routes.length - 1) {
      const currentEnd = route.waypoints[route.waypoints.length - 1];
      const nextRoute = routes[i + 1];
      const nextStart = nextRoute?.waypoints[0];

      // Calculate connection distance
      if (currentEnd && nextStart) {
        const connectionDistance = Math.sqrt(
          Math.pow(nextStart.lat - currentEnd.lat, 2) + Math.pow(nextStart.lng - currentEnd.lng, 2)
        ) * 111000; // Approximate conversion to meters

        totalDistance += connectionDistance;

        // Add connection segment
        allSegments.push({
          id: `connection_${i}`,
          startNode: `end_${i}`,
          endNode: `start_${i + 1}`,
          coordinates: [
            [currentEnd.lng, currentEnd.lat],
            [nextStart.lng, nextStart.lat],
          ],
          length: connectionDistance,
          name: 'Connection',
        });
      }
    }
  }

  // Calculate coverage
  const uniqueSegments = new Set(allSegments.map(s => s.id).filter(id => !id.startsWith('connection')));
  const coveragePercentage = (uniqueSegments.size / allSegments.length) * 100;

  // Estimate duration
  const estimatedDuration = (totalDistance / 1000 / 30) * 3600;

  return {
    segments: allSegments,
    totalDistance,
    estimatedDuration,
    coveragePercentage,
    waypoints: allWaypoints,
  };
}

export function splitLongRoute(
  route: {
    segments: RouteSegment[];
    totalDistance: number;
    estimatedDuration: number;
    waypoints: OptimizedRoute['waypoints'];
  },
  options: { maxDuration?: number; maxDistance?: number } = {}
): OptimizedRoute[] {
  const maxDuration = options.maxDuration || 7200; // 2 hours default
  const maxDistance = options.maxDistance || 100000; // 100km default

  const splits: OptimizedRoute[] = [];
  let currentSplit: RouteSegment[] = [];
  let currentDistance = 0;
  let currentDuration = 0;
  let currentWaypoints: OptimizedRoute['waypoints'] = [];

  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i];
    if (!segment) continue;
    const segmentDuration = (segment.length / 1000 / 30) * 3600;

    if (
      currentDuration + segmentDuration > maxDuration ||
      currentDistance + segment.length > maxDistance
    ) {
      // Create split
      if (currentSplit.length > 0) {
        splits.push({
          segments: currentSplit,
          totalDistance: currentDistance,
          estimatedDuration: currentDuration,
          coveragePercentage: (currentSplit.length / route.segments.length) * 100,
          waypoints: currentWaypoints,
        });
      }

      // Start new split
      currentSplit = [segment];
      currentDistance = segment.length;
      currentDuration = segmentDuration;
      const waypoint = route.waypoints[i];
      currentWaypoints = waypoint ? [waypoint] : [];
    } else {
      currentSplit.push(segment);
      currentDistance += segment.length;
      currentDuration += segmentDuration;
      const nextWaypoint = route.waypoints[i];
      if (nextWaypoint) {
        currentWaypoints.push(nextWaypoint);
      }
    }
  }

  // Add final split
  if (currentSplit.length > 0) {
    splits.push({
      segments: currentSplit,
      totalDistance: currentDistance,
      estimatedDuration: currentDuration,
      coveragePercentage: (currentSplit.length / route.segments.length) * 100,
      waypoints: currentWaypoints,
    });
  }

  return splits;
}

export function reorderWaypoints(
  waypoints: Array<{ lat: number; lng: number }>,
  options: { algorithm?: 'nearest-neighbor' | '2-opt' } = {}
): Array<{ lat: number; lng: number }> {
  if (waypoints.length <= 2) return waypoints;

  const algorithm = options.algorithm || 'nearest-neighbor';

  if (algorithm === 'nearest-neighbor') {
    return nearestNeighborTSP(waypoints);
  } else {
    // Start with nearest neighbor then improve with 2-opt
    const initial = nearestNeighborTSP(waypoints);
    return twoOptImprovement(initial);
  }
}

function nearestNeighborTSP(
  points: Array<{ lat: number; lng: number }>
): Array<{ lat: number; lng: number }> {
  if (points.length === 0) return [];

  const firstPoint = points[0];
  if (!firstPoint) return [];
  
  const result = [firstPoint];
  const remaining = new Set(points.slice(1));

  while (remaining.size > 0) {
    const current = result[result.length - 1];
    if (!current) break;
    
    let nearest: { lat: number; lng: number } | null = null;
    let minDistance = Infinity;

    for (const point of remaining) {
      const dist = Math.sqrt(
        Math.pow(point.lat - current.lat, 2) + Math.pow(point.lng - current.lng, 2)
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearest = point;
      }
    }

    if (nearest) {
      result.push(nearest);
      remaining.delete(nearest);
    }
  }

  return result;
}

function twoOptImprovement(
  route: Array<{ lat: number; lng: number }>
): Array<{ lat: number; lng: number }> {
  const improved = [...route];
  let improvement = true;

  while (improvement) {
    improvement = false;

    for (let i = 1; i < improved.length - 2; i++) {
      for (let j = i + 1; j < improved.length; j++) {
        const prevI = improved[i - 1];
        const currI = improved[i];
        const prevJ = improved[j - 1];
        const currJ = improved[j];
        
        if (!prevI || !currI || !prevJ || !currJ) continue;
        
        const currentDistance =
          distance(prevI, currI) +
          distance(prevJ, currJ);

        const newDistance =
          distance(prevI, prevJ) +
          distance(currI, currJ);

        if (newDistance < currentDistance) {
          // Reverse the segment between i and j-1
          const reversed = improved.slice(i, j).reverse();
          improved.splice(i, j - i, ...reversed);
          improvement = true;
        }
      }
    }
  }

  return improved;

  function distance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
    return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2));
  }
}

export function addUTurns(
  route: {
    segments: RouteSegment[];
    waypoints: OptimizedRoute['waypoints'];
  },
  network: StreetNetwork
): {
  segments: RouteSegment[];
  waypoints: OptimizedRoute['waypoints'];
} {
  const newSegments: RouteSegment[] = [];
  const newWaypoints: OptimizedRoute['waypoints'] = [];

  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i];
    if (!segment) continue;
    
    newSegments.push(segment);

    // Add corresponding waypoint
    const waypoint = route.waypoints[i];
    if (waypoint) {
      newWaypoints.push(waypoint);
    }

    // Check if this is a dead end
    if (segment.isDeadEnd) {
      // Add U-turn waypoint
      const endNode = network.nodes[segment.endNode];
      if (endNode) {
        newWaypoints.push({
          lat: endNode.lat,
          lng: endNode.lon,
          type: 'u-turn',
        });

        // Add return segment
        newSegments.push({
          ...segment,
          direction: segment.direction === 'forward' ? 'reverse' : 'forward',
          visitCount: 2,
        });
      }
    }
  }

  // Add final waypoint if not already added
  if (route.waypoints.length > newWaypoints.length) {
    const lastWaypoint = route.waypoints[route.waypoints.length - 1];
    if (lastWaypoint) {
      newWaypoints.push(lastWaypoint);
    }
  }

  return {
    segments: newSegments,
    waypoints: newWaypoints,
  };
}

export function validateRoute(
  route: {
    segments: RouteSegment[];
    totalDistance: number;
    coveragePercentage: number;
    waypoints: OptimizedRoute['waypoints'];
  },
  network: StreetNetwork
): {
  isValid: boolean;
  hasCompleteCoverage: boolean;
  missingSegments: string[];
  isContinuous: boolean;
  gaps: Array<{ from: string; to: string }>;
} {
  // Check coverage
  const coveredSegments = new Set(route.segments.map(s => s.id));
  const missingSegments = network.segments
    .filter(s => !coveredSegments.has(s.id))
    .map(s => s.id);

  const hasCompleteCoverage = missingSegments.length === 0;

  // Check continuity
  const gaps: Array<{ from: string; to: string }> = [];
  let isContinuous = true;

  for (let i = 0; i < route.segments.length - 1; i++) {
    const current = route.segments[i];
    const next = route.segments[i + 1];
    
    if (!current || !next) continue;

    const currentEnd = current.direction === 'forward' ? current.endNode : current.startNode;
    const nextStart = next.direction === 'forward' ? next.startNode : next.endNode;

    if (currentEnd !== nextStart) {
      isContinuous = false;
      gaps.push({ from: currentEnd, to: nextStart });
    }
  }

  return {
    isValid: hasCompleteCoverage && isContinuous,
    hasCompleteCoverage,
    missingSegments,
    isContinuous,
    gaps,
  };
}