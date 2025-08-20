import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  generateOptimalRoute,
  calculateRouteEfficiency,
  detectOverlaps,
  mergeRoutes,
  splitLongRoute,
  reorderWaypoints,
  addUTurns,
  validateRoute,
  RouteSegment,
  OptimizedRoute,
  RouteMetrics,
} from '../../packages/shared/src/coverage/routing';

describe('Route Optimization Algorithm', () => {
  const mockStreetNetwork = {
    segments: [
      {
        id: 'seg_1',
        startNode: '100',
        endNode: '101',
        coordinates: [
          [-0.1276, 51.5074],
          [-0.1275, 51.5075],
        ],
        length: 156.2,
        name: 'Main Street',
      },
      {
        id: 'seg_2',
        startNode: '101',
        endNode: '102',
        coordinates: [
          [-0.1275, 51.5075],
          [-0.1274, 51.5076],
        ],
        length: 142.8,
        name: 'Main Street',
      },
      {
        id: 'seg_3',
        startNode: '102',
        endNode: '103',
        coordinates: [
          [-0.1274, 51.5076],
          [-0.1273, 51.5077],
        ],
        length: 138.5,
        name: 'Side Street',
      },
    ],
    nodes: {
      '100': { lat: 51.5074, lon: -0.1276, connections: ['101'] },
      '101': { lat: 51.5075, lon: -0.1275, connections: ['100', '102'] },
      '102': { lat: 51.5076, lon: -0.1274, connections: ['101', '103'] },
      '103': { lat: 51.5077, lon: -0.1273, connections: ['102'] },
    },
  };

  describe('generateOptimalRoute', () => {
    it('generates route covering all streets', async () => {
      const startPoint = { lat: 51.5074, lng: -0.1276 };
      
      const route = await generateOptimalRoute(
        mockStreetNetwork,
        startPoint,
        { algorithm: 'chinese-postman' }
      );

      expect(route).toBeDefined();
      expect(route.segments).toHaveLength(mockStreetNetwork.segments.length);
      expect(route.totalDistance).toBeGreaterThan(0);
    });

    it('minimizes total distance for coverage', async () => {
      const startPoint = { lat: 51.5074, lng: -0.1276 };
      
      const route = await generateOptimalRoute(
        mockStreetNetwork,
        startPoint,
        { algorithm: 'chinese-postman' }
      );

      // Chinese Postman solution should be close to sum of all street lengths
      const totalStreetLength = mockStreetNetwork.segments.reduce(
        (sum, seg) => sum + seg.length,
        0
      );

      expect(route.totalDistance).toBeGreaterThanOrEqual(totalStreetLength);
      expect(route.totalDistance).toBeLessThan(totalStreetLength * 2); // Should not double-cover everything
    });

    it('returns to start point when required', async () => {
      const startPoint = { lat: 51.5074, lng: -0.1276 };
      
      const route = await generateOptimalRoute(
        mockStreetNetwork,
        startPoint,
        { returnToStart: true }
      );

      const firstPoint = route.segments[0].coordinates[0];
      const lastSegment = route.segments[route.segments.length - 1];
      const lastPoint = lastSegment.coordinates[lastSegment.coordinates.length - 1];

      expect(firstPoint[0]).toBeCloseTo(lastPoint[0], 4);
      expect(firstPoint[1]).toBeCloseTo(lastPoint[1], 4);
    });

    it('respects maximum route duration', async () => {
      const startPoint = { lat: 51.5074, lng: -0.1276 };
      
      const route = await generateOptimalRoute(
        mockStreetNetwork,
        startPoint,
        { maxDuration: 3600 } // 1 hour
      );

      expect(route.estimatedDuration).toBeLessThanOrEqual(3600);
    });
  });

  describe('calculateRouteEfficiency', () => {
    it('calculates efficiency metrics', () => {
      const route: OptimizedRoute = {
        segments: mockStreetNetwork.segments,
        totalDistance: 500,
        estimatedDuration: 600,
        coveragePercentage: 100,
        waypoints: [],
      };

      const metrics = calculateRouteEfficiency(route, mockStreetNetwork);

      expect(metrics.efficiency).toBeDefined();
      expect(metrics.redundancy).toBeDefined();
      expect(metrics.coverageRatio).toBeDefined();
      expect(metrics.efficiency).toBeGreaterThan(0);
      expect(metrics.efficiency).toBeLessThanOrEqual(1);
    });

    it('identifies redundant segments', () => {
      const routeWithDuplicates: OptimizedRoute = {
        segments: [
          ...mockStreetNetwork.segments,
          mockStreetNetwork.segments[0], // Duplicate
        ],
        totalDistance: 600,
        estimatedDuration: 700,
        coveragePercentage: 100,
        waypoints: [],
      };

      const metrics = calculateRouteEfficiency(routeWithDuplicates, mockStreetNetwork);

      expect(metrics.redundancy).toBeGreaterThan(0);
      expect(metrics.redundantSegments).toContain('seg_1');
    });
  });

  describe('detectOverlaps', () => {
    it('detects overlapping route segments', () => {
      const routes = [
        {
          segments: [mockStreetNetwork.segments[0], mockStreetNetwork.segments[1]],
          totalDistance: 300,
        },
        {
          segments: [mockStreetNetwork.segments[1], mockStreetNetwork.segments[2]],
          totalDistance: 280,
        },
      ];

      const overlaps = detectOverlaps(routes);

      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].segmentId).toBe('seg_2');
      expect(overlaps[0].routeIndices).toEqual([0, 1]);
    });

    it('returns empty array for non-overlapping routes', () => {
      const routes = [
        {
          segments: [mockStreetNetwork.segments[0]],
          totalDistance: 156,
        },
        {
          segments: [mockStreetNetwork.segments[2]],
          totalDistance: 138,
        },
      ];

      const overlaps = detectOverlaps(routes);

      expect(overlaps).toHaveLength(0);
    });
  });

  describe('mergeRoutes', () => {
    it('combines multiple routes efficiently', () => {
      const route1 = {
        segments: [mockStreetNetwork.segments[0]],
        totalDistance: 156,
        waypoints: [
          { lat: 51.5074, lng: -0.1276 },
          { lat: 51.5075, lng: -0.1275 },
        ],
      };

      const route2 = {
        segments: [mockStreetNetwork.segments[2]],
        totalDistance: 138,
        waypoints: [
          { lat: 51.5076, lng: -0.1274 },
          { lat: 51.5077, lng: -0.1273 },
        ],
      };

      const merged = mergeRoutes([route1, route2]);

      expect(merged.segments).toHaveLength(2);
      expect(merged.waypoints).toHaveLength(4);
      expect(merged.totalDistance).toBeGreaterThanOrEqual(294); // May include connection
    });

    it('adds connecting segments between routes', () => {
      const route1 = {
        segments: [mockStreetNetwork.segments[0]],
        totalDistance: 156,
        waypoints: [
          { lat: 51.5074, lng: -0.1276 },
          { lat: 51.5075, lng: -0.1275 },
        ],
      };

      const route2 = {
        segments: [mockStreetNetwork.segments[2]],
        totalDistance: 138,
        waypoints: [
          { lat: 51.5076, lng: -0.1274 },
          { lat: 51.5077, lng: -0.1273 },
        ],
      };

      const merged = mergeRoutes([route1, route2], { addConnections: true });

      // Should have original segments plus connection
      expect(merged.segments.length).toBeGreaterThan(2);
    });
  });

  describe('splitLongRoute', () => {
    it('splits route exceeding maximum duration', () => {
      const longRoute = {
        segments: Array(100).fill(null).map((_, i) => ({
          id: `seg_${i}`,
          coordinates: [
            [-0.1276 + i * 0.0001, 51.5074],
            [-0.1276 + (i + 1) * 0.0001, 51.5074],
          ],
          length: 100,
          duration: 60, // 1 minute per segment
        })),
        totalDistance: 10000,
        estimatedDuration: 6000, // 100 minutes
        waypoints: [],
      };

      const splits = splitLongRoute(longRoute, { maxDuration: 1800 }); // 30 minutes max

      expect(splits.length).toBeGreaterThan(1);
      splits.forEach(split => {
        expect(split.estimatedDuration).toBeLessThanOrEqual(1800);
      });
    });

    it('maintains route continuity when splitting', () => {
      const route = {
        segments: mockStreetNetwork.segments,
        totalDistance: 437.5,
        estimatedDuration: 500,
        waypoints: [
          { lat: 51.5074, lng: -0.1276 },
          { lat: 51.5075, lng: -0.1275 },
          { lat: 51.5076, lng: -0.1274 },
          { lat: 51.5077, lng: -0.1273 },
        ],
      };

      const splits = splitLongRoute(route, { maxDuration: 300 });

      // End of first route should be start of second route
      const firstEnd = splits[0].waypoints[splits[0].waypoints.length - 1];
      const secondStart = splits[1].waypoints[0];

      expect(firstEnd.lat).toBeCloseTo(secondStart.lat, 6);
      expect(firstEnd.lng).toBeCloseTo(secondStart.lng, 6);
    });
  });

  describe('reorderWaypoints', () => {
    it('optimizes waypoint order using nearest neighbor', () => {
      const waypoints = [
        { lat: 51.5074, lng: -0.1276 },
        { lat: 51.5177, lng: -0.1173 }, // Far point
        { lat: 51.5075, lng: -0.1275 }, // Close to first
        { lat: 51.5176, lng: -0.1174 }, // Close to far point
      ];

      const optimized = reorderWaypoints(waypoints, { algorithm: 'nearest-neighbor' });

      // Should group nearby points together
      const distances = [];
      for (let i = 0; i < optimized.length - 1; i++) {
        const dist = Math.sqrt(
          Math.pow(optimized[i + 1].lat - optimized[i].lat, 2) +
          Math.pow(optimized[i + 1].lng - optimized[i].lng, 2)
        );
        distances.push(dist);
      }

      // Check that we don't have large jumps between consecutive points
      const maxDistance = Math.max(...distances);
      expect(maxDistance).toBeLessThan(0.01); // No huge jumps
    });

    it('uses 2-opt improvement for better optimization', () => {
      const waypoints = [
        { lat: 51.5074, lng: -0.1276 },
        { lat: 51.5177, lng: -0.1173 },
        { lat: 51.5075, lng: -0.1275 },
        { lat: 51.5176, lng: -0.1174 },
      ];

      const nearestNeighbor = reorderWaypoints(waypoints, { algorithm: 'nearest-neighbor' });
      const twoOpt = reorderWaypoints(waypoints, { algorithm: '2-opt' });

      // 2-opt should produce equal or better result
      const calculateTotalDistance = (points: typeof waypoints) => {
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
          total += Math.sqrt(
            Math.pow(points[i + 1].lat - points[i].lat, 2) +
            Math.pow(points[i + 1].lng - points[i].lng, 2)
          );
        }
        return total;
      };

      const nnDistance = calculateTotalDistance(nearestNeighbor);
      const twoOptDistance = calculateTotalDistance(twoOpt);

      expect(twoOptDistance).toBeLessThanOrEqual(nnDistance);
    });
  });

  describe('addUTurns', () => {
    it('adds U-turns for dead-end streets', () => {
      const deadEndNetwork = {
        segments: [
          {
            id: 'dead_end',
            startNode: '100',
            endNode: '101',
            coordinates: [
              [-0.1276, 51.5074],
              [-0.1275, 51.5075],
            ],
            length: 100,
            isDeadEnd: true,
          },
        ],
        nodes: {
          '100': { lat: 51.5074, lon: -0.1276, connections: ['101'] },
          '101': { lat: 51.5075, lon: -0.1275, connections: ['100'] }, // Dead end
        },
      };

      const route = {
        segments: deadEndNetwork.segments,
        waypoints: [
          { lat: 51.5074, lng: -0.1276 },
          { lat: 51.5075, lng: -0.1275 },
        ],
      };

      const withUTurns = addUTurns(route, deadEndNetwork);

      // Should have forward and return segments
      expect(withUTurns.segments.length).toBeGreaterThan(1);
      expect(withUTurns.waypoints).toContainEqual(
        expect.objectContaining({ type: 'u-turn' })
      );
    });

    it('does not add U-turns for through streets', () => {
      const route = {
        segments: mockStreetNetwork.segments,
        waypoints: [
          { lat: 51.5074, lng: -0.1276 },
          { lat: 51.5075, lng: -0.1275 },
          { lat: 51.5076, lng: -0.1274 },
          { lat: 51.5077, lng: -0.1273 },
        ],
      };

      const withUTurns = addUTurns(route, mockStreetNetwork);

      // No U-turns needed for connected streets
      expect(withUTurns.waypoints.filter(w => w.type === 'u-turn')).toHaveLength(0);
    });
  });

  describe('validateRoute', () => {
    it('validates complete route coverage', () => {
      const route = {
        segments: mockStreetNetwork.segments,
        totalDistance: 437.5,
        coveragePercentage: 100,
        waypoints: [],
      };

      const validation = validateRoute(route, mockStreetNetwork);

      expect(validation.isValid).toBe(true);
      expect(validation.hasCompleteCoverage).toBe(true);
      expect(validation.missingSegments).toHaveLength(0);
    });

    it('detects missing street segments', () => {
      const incompleteRoute = {
        segments: [mockStreetNetwork.segments[0]], // Missing segments
        totalDistance: 156.2,
        coveragePercentage: 33,
        waypoints: [],
      };

      const validation = validateRoute(incompleteRoute, mockStreetNetwork);

      expect(validation.isValid).toBe(false);
      expect(validation.hasCompleteCoverage).toBe(false);
      expect(validation.missingSegments).toContain('seg_2');
      expect(validation.missingSegments).toContain('seg_3');
    });

    it('checks route continuity', () => {
      const discontinuousRoute = {
        segments: [
          mockStreetNetwork.segments[0],
          mockStreetNetwork.segments[2], // Skips segment 1
        ],
        waypoints: [
          { lat: 51.5074, lng: -0.1276 },
          { lat: 51.5075, lng: -0.1275 },
          { lat: 51.5076, lng: -0.1274 }, // Gap here
          { lat: 51.5077, lng: -0.1273 },
        ],
      };

      const validation = validateRoute(discontinuousRoute, mockStreetNetwork);

      expect(validation.isContinuous).toBe(false);
      expect(validation.gaps).toHaveLength(1);
    });
  });

  describe('Route Optimization Strategies', () => {
    it('applies different strategies based on area type', async () => {
      const urbanNetwork = {
        ...mockStreetNetwork,
        metadata: { type: 'urban', density: 'high' },
      };

      const suburbanNetwork = {
        ...mockStreetNetwork,
        metadata: { type: 'suburban', density: 'medium' },
      };

      const urbanRoute = await generateOptimalRoute(
        urbanNetwork,
        { lat: 51.5074, lng: -0.1276 },
        { strategy: 'auto' }
      );

      const suburbanRoute = await generateOptimalRoute(
        suburbanNetwork,
        { lat: 51.5074, lng: -0.1276 },
        { strategy: 'auto' }
      );

      // Urban routes might prioritize efficiency
      // Suburban routes might accept more redundancy for simplicity
      expect(urbanRoute.optimizationStrategy).toBe('minimize-distance');
      expect(suburbanRoute.optimizationStrategy).toBe('minimize-turns');
    });
  });
});