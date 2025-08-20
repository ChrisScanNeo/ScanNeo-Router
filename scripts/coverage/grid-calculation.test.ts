import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  calculateGrid,
  getGridCells,
  calculateCellBounds,
  optimizeGridSize,
  mergeAdjacentCells,
  calculateCoverage,
  GridCell,
  CoverageMetrics,
} from '../../packages/shared/src/coverage/grid';

describe('Grid-based Coverage Calculation', () => {
  describe('calculateGrid', () => {
    it('creates uniform grid for rectangular area', () => {
      const area = {
        type: 'Polygon' as const,
        coordinates: [[
          [-0.1276, 51.5074], // London area
          [-0.1176, 51.5074],
          [-0.1176, 51.5174],
          [-0.1276, 51.5174],
          [-0.1276, 51.5074],
        ]],
      };

      const grid = calculateGrid(area, { cellSize: 100 }); // 100m cells

      expect(grid.cells).toBeDefined();
      expect(grid.cells.length).toBeGreaterThan(0);
      expect(grid.metadata.cellSize).toBe(100);
      expect(grid.metadata.totalCells).toBe(grid.cells.length);
    });

    it('handles irregular polygon shapes', () => {
      const area = {
        type: 'Polygon' as const,
        coordinates: [[
          [-0.1276, 51.5074],
          [-0.1176, 51.5074],
          [-0.1200, 51.5124], // Irregular point
          [-0.1176, 51.5174],
          [-0.1276, 51.5174],
          [-0.1276, 51.5074],
        ]],
      };

      const grid = calculateGrid(area, { cellSize: 100 });

      expect(grid.cells).toBeDefined();
      grid.cells.forEach(cell => {
        expect(cell.isWithinBoundary).toBeDefined();
      });
    });

    it('optimizes cell size based on area', () => {
      const smallArea = {
        type: 'Polygon' as const,
        coordinates: [[
          [-0.1280, 51.5070],
          [-0.1270, 51.5070],
          [-0.1270, 51.5080],
          [-0.1280, 51.5080],
          [-0.1280, 51.5070],
        ]],
      };

      const optimizedSize = optimizeGridSize(smallArea);
      
      expect(optimizedSize).toBeGreaterThan(0);
      expect(optimizedSize).toBeLessThanOrEqual(200); // Max 200m for small areas
    });
  });

  describe('getGridCells', () => {
    it('returns cells within polygon boundary', () => {
      const area = {
        type: 'Polygon' as const,
        coordinates: [[
          [-0.1276, 51.5074],
          [-0.1176, 51.5074],
          [-0.1176, 51.5174],
          [-0.1276, 51.5174],
          [-0.1276, 51.5074],
        ]],
      };

      const cells = getGridCells(area, 100);
      
      cells.forEach(cell => {
        expect(cell.center).toBeDefined();
        expect(cell.center.lat).toBeGreaterThanOrEqual(51.5074);
        expect(cell.center.lat).toBeLessThanOrEqual(51.5174);
        expect(cell.center.lng).toBeGreaterThanOrEqual(-0.1276);
        expect(cell.center.lng).toBeLessThanOrEqual(-0.1176);
      });
    });

    it('assigns unique IDs to each cell', () => {
      const area = {
        type: 'Polygon' as const,
        coordinates: [[
          [-0.1276, 51.5074],
          [-0.1176, 51.5074],
          [-0.1176, 51.5174],
          [-0.1276, 51.5174],
          [-0.1276, 51.5074],
        ]],
      };

      const cells = getGridCells(area, 100);
      const ids = cells.map(cell => cell.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(cells.length);
    });
  });

  describe('calculateCellBounds', () => {
    it('calculates correct bounds for cell', () => {
      const center = { lat: 51.5074, lng: -0.1276 };
      const size = 100; // meters

      const bounds = calculateCellBounds(center, size);

      expect(bounds.north).toBeGreaterThan(center.lat);
      expect(bounds.south).toBeLessThan(center.lat);
      expect(bounds.east).toBeGreaterThan(center.lng);
      expect(bounds.west).toBeLessThan(center.lng);
    });

    it('creates square cells at equator', () => {
      const center = { lat: 0, lng: 0 };
      const size = 100;

      const bounds = calculateCellBounds(center, size);
      
      const latDistance = bounds.north - bounds.south;
      const lngDistance = bounds.east - bounds.west;
      
      expect(Math.abs(latDistance - lngDistance)).toBeLessThan(0.0001);
    });
  });

  describe('mergeAdjacentCells', () => {
    it('merges horizontally adjacent cells', () => {
      const cells: GridCell[] = [
        {
          id: '0_0',
          center: { lat: 51.5074, lng: -0.1276 },
          bounds: {
            north: 51.5079,
            south: 51.5069,
            east: -0.1271,
            west: -0.1281,
          },
          isWithinBoundary: true,
        },
        {
          id: '0_1',
          center: { lat: 51.5074, lng: -0.1266 },
          bounds: {
            north: 51.5079,
            south: 51.5069,
            east: -0.1261,
            west: -0.1271,
          },
          isWithinBoundary: true,
        },
      ];

      const merged = mergeAdjacentCells(cells);
      
      expect(merged.length).toBeLessThan(cells.length);
      expect(merged[0].bounds.west).toBe(cells[0].bounds.west);
      expect(merged[0].bounds.east).toBe(cells[1].bounds.east);
    });

    it('does not merge non-adjacent cells', () => {
      const cells: GridCell[] = [
        {
          id: '0_0',
          center: { lat: 51.5074, lng: -0.1276 },
          bounds: {
            north: 51.5079,
            south: 51.5069,
            east: -0.1271,
            west: -0.1281,
          },
          isWithinBoundary: true,
        },
        {
          id: '2_2',
          center: { lat: 51.5094, lng: -0.1256 },
          bounds: {
            north: 51.5099,
            south: 51.5089,
            east: -0.1251,
            west: -0.1261,
          },
          isWithinBoundary: true,
        },
      ];

      const merged = mergeAdjacentCells(cells);
      
      expect(merged.length).toBe(cells.length);
    });
  });

  describe('calculateCoverage', () => {
    it('calculates coverage metrics', () => {
      const grid = {
        cells: [
          {
            id: '0_0',
            center: { lat: 51.5074, lng: -0.1276 },
            bounds: {
              north: 51.5079,
              south: 51.5069,
              east: -0.1271,
              west: -0.1281,
            },
            isWithinBoundary: true,
            isCovered: true,
          },
          {
            id: '0_1',
            center: { lat: 51.5074, lng: -0.1266 },
            bounds: {
              north: 51.5079,
              south: 51.5069,
              east: -0.1261,
              west: -0.1271,
            },
            isWithinBoundary: true,
            isCovered: false,
          },
        ],
        metadata: {
          cellSize: 100,
          totalCells: 2,
          coveredCells: 1,
        },
      };

      const metrics = calculateCoverage(grid);

      expect(metrics.totalCells).toBe(2);
      expect(metrics.coveredCells).toBe(1);
      expect(metrics.coveragePercentage).toBe(50);
      expect(metrics.estimatedArea).toBeGreaterThan(0);
    });

    it('handles fully covered grid', () => {
      const grid = {
        cells: Array(10).fill(null).map((_, i) => ({
          id: `cell_${i}`,
          center: { lat: 51.5074 + i * 0.001, lng: -0.1276 },
          bounds: {
            north: 51.5079 + i * 0.001,
            south: 51.5069 + i * 0.001,
            east: -0.1271,
            west: -0.1281,
          },
          isWithinBoundary: true,
          isCovered: true,
        })),
        metadata: {
          cellSize: 100,
          totalCells: 10,
          coveredCells: 10,
        },
      };

      const metrics = calculateCoverage(grid);

      expect(metrics.coveragePercentage).toBe(100);
      expect(metrics.remainingCells).toBe(0);
    });

    it('calculates area in square kilometers', () => {
      const grid = {
        cells: Array(100).fill(null).map((_, i) => ({
          id: `cell_${i}`,
          center: { lat: 51.5074, lng: -0.1276 },
          bounds: {
            north: 51.5079,
            south: 51.5069,
            east: -0.1271,
            west: -0.1281,
          },
          isWithinBoundary: true,
          isCovered: false,
        })),
        metadata: {
          cellSize: 100, // 100m cells
          totalCells: 100,
          coveredCells: 0,
        },
      };

      const metrics = calculateCoverage(grid);
      
      // 100 cells * 100m * 100m = 1,000,000 m² = 1 km²
      expect(metrics.estimatedArea).toBeCloseTo(1, 1);
    });
  });

  describe('Grid Optimization', () => {
    it('adapts cell size to area density', () => {
      const denseUrbanArea = {
        type: 'Polygon' as const,
        coordinates: [[
          [-0.1280, 51.5070], // Small dense area
          [-0.1275, 51.5070],
          [-0.1275, 51.5075],
          [-0.1280, 51.5075],
          [-0.1280, 51.5070],
        ]],
      };

      const suburbanArea = {
        type: 'Polygon' as const,
        coordinates: [[
          [-0.1400, 51.5000], // Larger suburban area
          [-0.1200, 51.5000],
          [-0.1200, 51.5200],
          [-0.1400, 51.5200],
          [-0.1400, 51.5000],
        ]],
      };

      const denseSize = optimizeGridSize(denseUrbanArea, { density: 'high' });
      const suburbanSize = optimizeGridSize(suburbanArea, { density: 'low' });

      expect(denseSize).toBeLessThan(suburbanSize);
      expect(denseSize).toBeLessThanOrEqual(50); // Dense areas need smaller cells
      expect(suburbanSize).toBeGreaterThanOrEqual(100); // Suburban can use larger cells
    });
  });
});