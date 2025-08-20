export interface StreetNode {
  id: string;
  lat: number;
  lon: number;
  connections: string[];
}

export interface StreetSegment {
  id: string;
  startNode: string;
  endNode: string;
  coordinates: number[][];
  length: number; // meters
  name?: string;
  tags?: Record<string, string>;
  isDeadEnd?: boolean;
}

export interface StreetNetwork {
  segments: StreetSegment[];
  nodes: Record<string, StreetNode>;
  metadata?: {
    type?: 'urban' | 'suburban' | 'rural';
    density?: 'low' | 'medium' | 'high';
  };
  validate?: () => {
    isConnected: boolean;
    orphanedNodes: string[];
    duplicateSegments: string[];
  };
}

export interface StreetDensity {
  totalLength: number;
  segmentCount: number;
  densityLevel: 'low' | 'medium' | 'high';
}

interface OSMNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}

interface OSMWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

interface OSMData {
  elements: (OSMNode | OSMWay)[];
}

// Haversine distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function fetchStreetNetwork(
  bounds: { north: number; south: number; east: number; west: number },
  options: { maxRetries?: number } = {}
): Promise<StreetNetwork> {
  const maxRetries = options.maxRetries ?? 3;
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  
  // Overpass API query for drivable streets
  const query = `
    [out:json][timeout:30];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]
         ["access"!~"^(private|no)$"]
         (${bbox});
    );
    out body;
    >;
    out skel qt;
  `;

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: OSMData = await response.json();
      return parseOSMData(data);
    } catch (error) {
      lastError = error as Error;
      // Exponential backoff
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError || new Error('Failed to fetch street network');
}

export function parseOSMData(data: OSMData): StreetNetwork {
  const nodes: Record<string, StreetNode> = {};
  const segments: StreetSegment[] = [];

  // First pass: collect all nodes
  const nodeMap = new Map<number, OSMNode>();
  for (const element of data.elements) {
    if (element.type === 'node') {
      nodeMap.set(element.id, element);
    }
  }

  // Second pass: process ways
  for (const element of data.elements) {
    if (element.type === 'way') {
      const wayNodes = element.nodes;
      if (wayNodes.length < 2) continue;

      // Check if this is a drivable way
      if (!isDrivableWay(element.tags)) continue;

      // Build coordinates and create nodes
      const coordinates: number[][] = [];
      for (const nodeId of wayNodes) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;

        coordinates.push([node.lon, node.lat]);
        
        if (!nodes[nodeId.toString()]) {
          nodes[nodeId.toString()] = {
            id: nodeId.toString(),
            lat: node.lat,
            lon: node.lon,
            connections: [],
          };
        }
      }

      // Create segments
      for (let i = 0; i < wayNodes.length - 1; i++) {
        const startNodeId = wayNodes[i].toString();
        const endNodeId = wayNodes[i + 1].toString();
        const startNode = nodeMap.get(wayNodes[i]);
        const endNode = nodeMap.get(wayNodes[i + 1]);

        if (!startNode || !endNode) continue;

        const length = calculateDistance(
          startNode.lat,
          startNode.lon,
          endNode.lat,
          endNode.lon
        );

        segments.push({
          id: `seg_${element.id}_${i}`,
          startNode: startNodeId,
          endNode: endNodeId,
          coordinates: [
            [startNode.lon, startNode.lat],
            [endNode.lon, endNode.lat],
          ],
          length,
          name: element.tags?.name,
          tags: element.tags,
        });

        // Update connections
        if (!element.tags?.oneway || element.tags.oneway === 'no') {
          nodes[startNodeId].connections.push(endNodeId);
          nodes[endNodeId].connections.push(startNodeId);
        } else {
          nodes[startNodeId].connections.push(endNodeId);
        }
      }
    }
  }

  // Identify dead ends
  for (const segment of segments) {
    const endNode = nodes[segment.endNode];
    if (endNode && endNode.connections.length === 1) {
      segment.isDeadEnd = true;
    }
  }

  return {
    segments,
    nodes,
    validate: () => validateNetwork({ segments, nodes }),
  };
}

function isDrivableWay(tags?: Record<string, string>): boolean {
  if (!tags?.highway) return false;

  const drivableTypes = [
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'unclassified',
    'residential',
    'service',
    'motorway_link',
    'trunk_link',
    'primary_link',
    'secondary_link',
    'tertiary_link',
  ];

  if (!drivableTypes.includes(tags.highway)) return false;

  // Check access restrictions
  if (tags.access === 'private' || tags.access === 'no') return false;

  return true;
}

export function filterDrivableWays(ways: unknown[]): unknown[] {
  return ways.filter((way: unknown) => {
    const w = way as { highway?: string; access?: string };
    if (!w.highway) return false;
    
    const drivableTypes = [
      'motorway',
      'trunk',
      'primary',
      'secondary',
      'tertiary',
      'unclassified',
      'residential',
      'service',
      'motorway_link',
      'trunk_link',
      'primary_link',
      'secondary_link',
      'tertiary_link',
    ];

    if (!drivableTypes.includes(w.highway)) return false;
    if (w.access === 'private' || w.access === 'no') return false;
    
    return true;
  });
}

export function extractIntersections(network: StreetNetwork): string[] {
  const intersections: string[] = [];
  
  for (const [nodeId, node] of Object.entries(network.nodes)) {
    // An intersection has more than 2 connections
    if (node.connections.length > 2) {
      intersections.push(nodeId);
    }
  }
  
  return intersections;
}

export function buildStreetGraph(network: StreetNetwork): Record<string, string[]> {
  const graph: Record<string, string[]> = {};
  
  for (const segment of network.segments) {
    if (!graph[segment.startNode]) {
      graph[segment.startNode] = [];
    }
    if (!graph[segment.endNode]) {
      graph[segment.endNode] = [];
    }
    
    // Check if it's a one-way street
    const isOneWay = segment.tags?.oneway === 'yes';
    
    graph[segment.startNode].push(segment.endNode);
    if (!isOneWay) {
      graph[segment.endNode].push(segment.startNode);
    }
  }
  
  return graph;
}

export function findConnectedComponents(graph: Record<string, string[]>): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  
  function dfs(node: string, component: string[]) {
    if (visited.has(node)) return;
    visited.add(node);
    component.push(node);
    
    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, component);
    }
  }
  
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      const component: string[] = [];
      dfs(node, component);
      components.push(component);
    }
  }
  
  return components;
}

export function calculateStreetDensity(
  network: StreetNetwork,
  gridCells: { id: string; bounds: { north: number; south: number; east: number; west: number } }[]
): Record<string, StreetDensity> {
  const densities: Record<string, StreetDensity> = {};
  
  for (const cell of gridCells) {
    let totalLength = 0;
    let segmentCount = 0;
    
    for (const segment of network.segments) {
      // Check if segment is within cell bounds
      const node = network.nodes[segment.startNode];
      if (
        node &&
        node.lat >= cell.bounds.south &&
        node.lat <= cell.bounds.north &&
        node.lon >= cell.bounds.west &&
        node.lon <= cell.bounds.east
      ) {
        totalLength += segment.length;
        segmentCount++;
      }
    }
    
    // Classify density level
    let densityLevel: 'low' | 'medium' | 'high';
    const densityPerSqKm = totalLength / ((cell.bounds.north - cell.bounds.south) * (cell.bounds.east - cell.bounds.west) * 111 * 111);
    
    if (densityPerSqKm < 5000) {
      densityLevel = 'low';
    } else if (densityPerSqKm < 15000) {
      densityLevel = 'medium';
    } else {
      densityLevel = 'high';
    }
    
    densities[cell.id] = {
      totalLength,
      segmentCount,
      densityLevel,
    };
  }
  
  return densities;
}

function validateNetwork(network: StreetNetwork) {
  // Check connectivity
  const graph = buildStreetGraph(network);
  const components = findConnectedComponents(graph);
  const isConnected = components.length === 1;
  
  // Find orphaned nodes
  const usedNodes = new Set<string>();
  for (const segment of network.segments) {
    usedNodes.add(segment.startNode);
    usedNodes.add(segment.endNode);
  }
  const orphanedNodes = Object.keys(network.nodes).filter(
    nodeId => !usedNodes.has(nodeId)
  );
  
  // Find duplicate segments
  const segmentPairs = new Set<string>();
  const duplicateSegments: string[] = [];
  
  for (const segment of network.segments) {
    const pair1 = `${segment.startNode}-${segment.endNode}`;
    const pair2 = `${segment.endNode}-${segment.startNode}`;
    
    if (segmentPairs.has(pair1) || segmentPairs.has(pair2)) {
      duplicateSegments.push(segment.id);
    } else {
      segmentPairs.add(pair1);
    }
  }
  
  return {
    isConnected,
    orphanedNodes,
    duplicateSegments,
  };
}