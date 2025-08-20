import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  fetchStreetNetwork,
  parseOSMData,
  filterDrivableWays,
  extractIntersections,
  buildStreetGraph,
  findConnectedComponents,
  calculateStreetDensity,
  StreetSegment,
  StreetNode,
  StreetNetwork,
} from '../../packages/shared/src/coverage/streets';

describe('Street Network Processing', () => {
  const mockOSMData = {
    elements: [
      {
        type: 'way',
        id: 1,
        nodes: [100, 101, 102],
        tags: {
          highway: 'primary',
          name: 'Main Street',
          maxspeed: '30',
        },
      },
      {
        type: 'way',
        id: 2,
        nodes: [102, 103, 104],
        tags: {
          highway: 'residential',
          name: 'Side Street',
        },
      },
      {
        type: 'way',
        id: 3,
        nodes: [105, 106],
        tags: {
          highway: 'footway', // Not drivable
          name: 'Park Path',
        },
      },
      {
        type: 'node',
        id: 100,
        lat: 51.5074,
        lon: -0.1276,
      },
      {
        type: 'node',
        id: 101,
        lat: 51.5075,
        lon: -0.1275,
      },
      {
        type: 'node',
        id: 102,
        lat: 51.5076,
        lon: -0.1274,
      },
      {
        type: 'node',
        id: 103,
        lat: 51.5077,
        lon: -0.1273,
      },
      {
        type: 'node',
        id: 104,
        lat: 51.5078,
        lon: -0.1272,
      },
      {
        type: 'node',
        id: 105,
        lat: 51.5079,
        lon: -0.1271,
      },
      {
        type: 'node',
        id: 106,
        lat: 51.5080,
        lon: -0.1270,
      },
    ],
  };

  describe('fetchStreetNetwork', () => {
    it('fetches street data for bounding box', async () => {
      const bounds = {
        north: 51.5174,
        south: 51.5074,
        east: -0.1176,
        west: -0.1276,
      };

      // Mock the fetch function
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockOSMData,
      });

      const network = await fetchStreetNetwork(bounds);

      expect(network).toBeDefined();
      expect(network.segments).toBeDefined();
      expect(network.nodes).toBeDefined();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('overpass-api.de')
      );
    });

    it('retries on failure with exponential backoff', async () => {
      let attempts = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => mockOSMData,
        });
      });

      const bounds = {
        north: 51.5174,
        south: 51.5074,
        east: -0.1176,
        west: -0.1276,
      };

      const network = await fetchStreetNetwork(bounds, { maxRetries: 3 });

      expect(network).toBeDefined();
      expect(attempts).toBe(3);
    });
  });

  describe('parseOSMData', () => {
    it('converts OSM data to street network', () => {
      const network = parseOSMData(mockOSMData);

      expect(network.segments).toHaveLength(2); // Only drivable ways
      expect(network.nodes).toBeDefined();
      expect(Object.keys(network.nodes)).toHaveLength(5); // Nodes from drivable ways
    });

    it('preserves street metadata', () => {
      const network = parseOSMData(mockOSMData);
      const mainStreet = network.segments.find(s => s.name === 'Main Street');

      expect(mainStreet).toBeDefined();
      expect(mainStreet?.tags.maxspeed).toBe('30');
      expect(mainStreet?.tags.highway).toBe('primary');
    });

    it('calculates segment lengths', () => {
      const network = parseOSMData(mockOSMData);

      network.segments.forEach(segment => {
        expect(segment.length).toBeGreaterThan(0);
        expect(segment.length).toBeLessThan(10000); // Reasonable street length in meters
      });
    });
  });

  describe('filterDrivableWays', () => {
    it('includes drivable road types', () => {
      const ways = [
        { highway: 'motorway' },
        { highway: 'trunk' },
        { highway: 'primary' },
        { highway: 'secondary' },
        { highway: 'tertiary' },
        { highway: 'unclassified' },
        { highway: 'residential' },
        { highway: 'service' },
        { highway: 'motorway_link' },
        { highway: 'trunk_link' },
        { highway: 'primary_link' },
        { highway: 'secondary_link' },
        { highway: 'tertiary_link' },
      ];

      const drivable = filterDrivableWays(ways);
      expect(drivable).toHaveLength(ways.length);
    });

    it('excludes non-drivable ways', () => {
      const ways = [
        { highway: 'footway' },
        { highway: 'cycleway' },
        { highway: 'bridleway' },
        { highway: 'steps' },
        { highway: 'path' },
        { highway: 'pedestrian' },
        { highway: 'track', access: 'private' },
        { highway: 'service', access: 'no' },
      ];

      const drivable = filterDrivableWays(ways);
      expect(drivable).toHaveLength(0);
    });

    it('respects access restrictions', () => {
      const ways = [
        { highway: 'residential', access: 'yes' },
        { highway: 'residential', access: 'private' },
        { highway: 'residential', access: 'no' },
        { highway: 'residential' }, // No access tag means public
      ];

      const drivable = filterDrivableWays(ways);
      expect(drivable).toHaveLength(2); // yes and no-tag
    });
  });

  describe('extractIntersections', () => {
    it('identifies street intersections', () => {
      const network = parseOSMData(mockOSMData);
      const intersections = extractIntersections(network);

      // Node 102 connects way 1 and way 2
      expect(intersections).toContain('102');
    });

    it('excludes dead ends', () => {
      const network = parseOSMData(mockOSMData);
      const intersections = extractIntersections(network);

      // Nodes 100 and 104 are dead ends
      expect(intersections).not.toContain('100');
      expect(intersections).not.toContain('104');
    });
  });

  describe('buildStreetGraph', () => {
    it('creates adjacency graph from segments', () => {
      const network = parseOSMData(mockOSMData);
      const graph = buildStreetGraph(network);

      expect(graph['100']).toBeDefined();
      expect(graph['100']).toContain('101');
      expect(graph['101']).toContain('100');
      expect(graph['101']).toContain('102');
    });

    it('handles one-way streets', () => {
      const oneWayData = {
        ...mockOSMData,
        elements: [
          {
            type: 'way',
            id: 1,
            nodes: [100, 101, 102],
            tags: {
              highway: 'primary',
              oneway: 'yes',
            },
          },
          ...mockOSMData.elements.slice(1),
        ],
      };

      const network = parseOSMData(oneWayData);
      const graph = buildStreetGraph(network);

      expect(graph['100']).toContain('101');
      expect(graph['101']).not.toContain('100'); // One-way
    });
  });

  describe('findConnectedComponents', () => {
    it('identifies isolated street networks', () => {
      const isolatedData = {
        elements: [
          // Component 1
          {
            type: 'way',
            id: 1,
            nodes: [100, 101],
            tags: { highway: 'residential' },
          },
          // Component 2 (not connected)
          {
            type: 'way',
            id: 2,
            nodes: [200, 201],
            tags: { highway: 'residential' },
          },
          { type: 'node', id: 100, lat: 51.5074, lon: -0.1276 },
          { type: 'node', id: 101, lat: 51.5075, lon: -0.1275 },
          { type: 'node', id: 200, lat: 51.5174, lon: -0.1176 },
          { type: 'node', id: 201, lat: 51.5175, lon: -0.1175 },
        ],
      };

      const network = parseOSMData(isolatedData);
      const graph = buildStreetGraph(network);
      const components = findConnectedComponents(graph);

      expect(components).toHaveLength(2);
      expect(components[0]).toContain('100');
      expect(components[0]).toContain('101');
      expect(components[1]).toContain('200');
      expect(components[1]).toContain('201');
    });

    it('returns single component for connected network', () => {
      const network = parseOSMData(mockOSMData);
      const graph = buildStreetGraph(network);
      const components = findConnectedComponents(graph);

      expect(components).toHaveLength(1);
      expect(components[0]).toContain('100');
      expect(components[0]).toContain('104');
    });
  });

  describe('calculateStreetDensity', () => {
    it('calculates density for grid cells', () => {
      const network = parseOSMData(mockOSMData);
      const gridCells = [
        {
          id: 'cell_1',
          bounds: {
            north: 51.5080,
            south: 51.5070,
            east: -0.1270,
            west: -0.1280,
          },
        },
      ];

      const densities = calculateStreetDensity(network, gridCells);

      expect(densities['cell_1']).toBeDefined();
      expect(densities['cell_1'].totalLength).toBeGreaterThan(0);
      expect(densities['cell_1'].segmentCount).toBeGreaterThan(0);
    });

    it('returns zero density for cells without streets', () => {
      const network = parseOSMData(mockOSMData);
      const gridCells = [
        {
          id: 'empty_cell',
          bounds: {
            north: 51.6000,
            south: 51.5900,
            east: -0.0100,
            west: -0.0200,
          },
        },
      ];

      const densities = calculateStreetDensity(network, gridCells);

      expect(densities['empty_cell'].totalLength).toBe(0);
      expect(densities['empty_cell'].segmentCount).toBe(0);
    });

    it('classifies density levels', () => {
      const network = parseOSMData(mockOSMData);
      const gridCells = [
        {
          id: 'cell_1',
          bounds: {
            north: 51.5080,
            south: 51.5070,
            east: -0.1270,
            west: -0.1280,
          },
        },
      ];

      const densities = calculateStreetDensity(network, gridCells);
      
      expect(densities['cell_1'].densityLevel).toMatch(/^(low|medium|high)$/);
    });
  });

  describe('Street Network Validation', () => {
    it('validates network connectivity', () => {
      const network = parseOSMData(mockOSMData);
      const validation = network.validate();

      expect(validation.isConnected).toBe(true);
      expect(validation.orphanedNodes).toHaveLength(0);
      expect(validation.duplicateSegments).toHaveLength(0);
    });

    it('detects orphaned nodes', () => {
      const dataWithOrphan = {
        ...mockOSMData,
        elements: [
          ...mockOSMData.elements,
          { type: 'node', id: 999, lat: 51.5090, lon: -0.1260 }, // Orphan
        ],
      };

      const network = parseOSMData(dataWithOrphan);
      const validation = network.validate();

      expect(validation.orphanedNodes).toContain('999');
    });

    it('detects duplicate segments', () => {
      const dataWithDuplicate = {
        elements: [
          {
            type: 'way',
            id: 1,
            nodes: [100, 101],
            tags: { highway: 'residential' },
          },
          {
            type: 'way',
            id: 2,
            nodes: [100, 101], // Same nodes
            tags: { highway: 'service' },
          },
          { type: 'node', id: 100, lat: 51.5074, lon: -0.1276 },
          { type: 'node', id: 101, lat: 51.5075, lon: -0.1275 },
        ],
      };

      const network = parseOSMData(dataWithDuplicate);
      const validation = network.validate();

      expect(validation.duplicateSegments).toHaveLength(1);
    });
  });
});