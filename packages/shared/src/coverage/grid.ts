export interface GridCell {
  id: string;
  center: { lat: number; lng: number };
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  isWithinBoundary: boolean;
  isCovered?: boolean;
}

export interface Grid {
  cells: GridCell[];
  metadata: {
    cellSize: number;
    totalCells: number;
    coveredCells?: number;
  };
}

export interface CoverageMetrics {
  totalCells: number;
  coveredCells: number;
  coveragePercentage: number;
  remainingCells: number;
  estimatedArea: number; // km²
}

export interface GridOptions {
  cellSize?: number; // meters
  density?: 'low' | 'medium' | 'high';
}

// Calculate distance between two points using Haversine formula
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

// Check if a point is inside a polygon
function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: number[][]
): boolean {
  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pointI = polygon[i];
    const pointJ = polygon[j];
    if (!pointI || !pointJ) continue;
    
    const xi = pointI[0];
    const yi = pointI[1];
    const xj = pointJ[0];
    const yj = pointJ[1];
    
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) continue;

    const intersect =
      yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!;
    if (intersect) inside = !inside;
  }

  return inside;
}

export function calculateCellBounds(
  center: { lat: number; lng: number },
  sizeMeters: number
): GridCell['bounds'] {
  // Convert meters to degrees (approximate)
  const latDegrees = sizeMeters / 111320; // 1 degree latitude ≈ 111.32 km
  const lngDegrees = sizeMeters / (111320 * Math.cos((center.lat * Math.PI) / 180));

  return {
    north: center.lat + latDegrees / 2,
    south: center.lat - latDegrees / 2,
    east: center.lng + lngDegrees / 2,
    west: center.lng - lngDegrees / 2,
  };
}

export function optimizeGridSize(
  area: { type: 'Polygon'; coordinates: number[][][] },
  options: GridOptions = {}
): number {
  const polygon = area.coordinates[0];
  if (!polygon) return 100; // default if no polygon
  
  // Calculate area bounds
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const point of polygon) {
    if (!point) continue;
    const lng = point[0];
    const lat = point[1];
    if (lng === undefined || lat === undefined) continue;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  // Calculate area dimensions in meters
  const width = haversineDistance(minLat!, minLng!, minLat!, maxLng!);
  const height = haversineDistance(minLat!, minLng!, maxLat!, minLng!);
  const areaSize = Math.sqrt(width * height);

  // Determine cell size based on area and density
  let baseSize = 100; // Default 100m

  if (areaSize < 1000) {
    // Small area (< 1km across)
    baseSize = 50;
  } else if (areaSize < 5000) {
    // Medium area (1-5km)
    baseSize = 100;
  } else {
    // Large area (> 5km)
    baseSize = 200;
  }

  // Adjust for density
  if (options.density === 'high') {
    baseSize *= 0.5; // Smaller cells for dense areas
  } else if (options.density === 'low') {
    baseSize *= 1.5; // Larger cells for sparse areas
  }

  return Math.min(200, Math.max(25, baseSize)); // Clamp between 25-200m
}

export function getGridCells(
  area: { type: 'Polygon'; coordinates: number[][][] },
  cellSize: number
): GridCell[] {
  const polygon = area.coordinates[0];
  if (!polygon) return [];
  const cells: GridCell[] = [];

  // Calculate bounds
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const point of polygon) {
    if (!point) continue;
    const lng = point[0];
    const lat = point[1];
    if (lng === undefined || lat === undefined) continue;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  // Convert cell size to degrees
  const latStep = cellSize / 111320;
  const lngStep = cellSize / (111320 * Math.cos(((minLat! + maxLat!) / 2 * Math.PI) / 180));

  // Generate grid cells
  let row = 0;
  for (let lat = minLat!; lat <= maxLat!; lat += latStep) {
    let col = 0;
    for (let lng = minLng!; lng <= maxLng!; lng += lngStep) {
      const center = {
        lat: lat + latStep / 2,
        lng: lng + lngStep / 2,
      };

      const isWithinBoundary = isPointInPolygon(center, polygon);

      if (isWithinBoundary) {
        cells.push({
          id: `${row}_${col}`,
          center,
          bounds: calculateCellBounds(center, cellSize),
          isWithinBoundary,
        });
      }
      col++;
    }
    row++;
  }

  return cells;
}

export function calculateGrid(
  area: { type: 'Polygon'; coordinates: number[][][] },
  options: GridOptions = {}
): Grid {
  const cellSize = options.cellSize || optimizeGridSize(area, options);
  const cells = getGridCells(area, cellSize);

  return {
    cells,
    metadata: {
      cellSize,
      totalCells: cells.length,
    },
  };
}

export function mergeAdjacentCells(cells: GridCell[]): GridCell[] {
  if (cells.length <= 1) return cells;

  const merged: GridCell[] = [];
  const processed = new Set<string>();

  for (const cell of cells) {
    if (processed.has(cell.id)) continue;

    // Find horizontally adjacent cells
    const adjacentCells = [cell];
    const idParts = cell.id.split('_');
    const row = idParts[0] ? Number(idParts[0]) : 0;
    const col = idParts[1] ? Number(idParts[1]) : 0;

    // Look for adjacent cells to the right
    for (let nextCol = col + 1; ; nextCol++) {
      const adjacentId = `${row}_${nextCol}`;
      const adjacent = cells.find(c => c.id === adjacentId);
      
      if (!adjacent || !adjacent.isWithinBoundary) break;
      
      adjacentCells.push(adjacent);
      processed.add(adjacentId);
    }

    if (adjacentCells.length > 1) {
      // Merge the cells
      const firstCell = adjacentCells[0];
      const lastCell = adjacentCells[adjacentCells.length - 1];
      
      if (firstCell && lastCell) {
        merged.push({
          id: `${firstCell.id}-${lastCell.id}`,
          center: {
            lat: (firstCell.center.lat + lastCell.center.lat) / 2,
            lng: (firstCell.center.lng + lastCell.center.lng) / 2,
          },
          bounds: {
            north: Math.max(firstCell.bounds.north, lastCell.bounds.north),
            south: Math.min(firstCell.bounds.south, lastCell.bounds.south),
            east: lastCell.bounds.east,
            west: firstCell.bounds.west,
          },
          isWithinBoundary: true,
        });
      }
    } else {
      merged.push(cell);
    }

    processed.add(cell.id);
  }

  return merged;
}

export function calculateCoverage(grid: Grid): CoverageMetrics {
  const coveredCells = grid.cells.filter(cell => cell.isCovered).length;
  const totalCells = grid.cells.length;
  const coveragePercentage = totalCells > 0 ? (coveredCells / totalCells) * 100 : 0;
  
  // Estimate area in km²
  const cellAreaM2 = Math.pow(grid.metadata.cellSize, 2);
  const totalAreaKm2 = (totalCells * cellAreaM2) / 1_000_000;

  return {
    totalCells,
    coveredCells,
    coveragePercentage,
    remainingCells: totalCells - coveredCells,
    estimatedArea: totalAreaKm2,
  };
}