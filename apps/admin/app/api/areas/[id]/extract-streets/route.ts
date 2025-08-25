import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Overpass API URL
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Drivable highway types (what we WANT to include)
const DRIVABLE_HIGHWAYS = [
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'residential',
  'unclassified',
  'living_street',
  'service', // Will filter specific service types later
];

// Highway types to explicitly EXCLUDE
const EXCLUDED_HIGHWAYS = [
  'footway',
  'path',
  'cycleway',
  'pedestrian',
  'steps',
  'track',
  'bridleway',
  'corridor',
  'proposed',
  'construction',
  'abandoned',
  'platform',
  'raceway',
];

// Service road types to EXCLUDE
const EXCLUDED_SERVICE_TYPES = ['driveway', 'parking_aisle', 'emergency_access'];

// Access tags that mean we can't drive there
const EXCLUDED_ACCESS = ['private', 'no', 'customers', 'delivery'];

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    // Parse optional filters from request body
    const body = await request.json().catch(() => ({}));
    const {
      includeServiceRoads = false,
      includePrivateRoads = false,
      respectRestrictions = true,
      maxAreaSqKm = 10, // Default max area size
    } = body;

    // Get database connection
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get area from database with size calculation
    const areaResult = await sql`
      SELECT 
        id, 
        name, 
        ST_AsGeoJSON(geom)::json as geojson, 
        buffer_m,
        ST_Area(geom::geography) / 1000000 as area_sq_km
      FROM areas 
      WHERE id = ${id}
    `;

    if (areaResult.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    const area = areaResult[0];

    // Warn if area is too large
    if (area.area_sq_km > maxAreaSqKm) {
      return NextResponse.json(
        {
          error: 'Area too large',
          details: `Area is ${area.area_sq_km.toFixed(2)} km². Maximum recommended is ${maxAreaSqKm} km². Consider splitting into smaller zones.`,
          area_sq_km: area.area_sq_km,
        },
        { status: 400 }
      );
    }

    // Get bounding box for Overpass query
    const geometry = area.geojson;
    const bounds = getBounds(geometry);
    const bbox = `${bounds.minLat},${bounds.minLon},${bounds.maxLat},${bounds.maxLon}`;

    // Build Overpass query with proper filtering
    const query = buildOverpassQuery(bbox, {
      includeServiceRoads,
      includePrivateRoads,
      respectRestrictions,
    });

    console.log('Fetching streets with filters:', {
      includeServiceRoads,
      includePrivateRoads,
      respectRestrictions,
    });

    // Fetch streets from Overpass API
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const osmData = await response.json();

    // Convert OSM data to GeoJSON with enhanced filtering
    const streets = convertOsmToGeoJSON(osmData, {
      includeServiceRoads,
      includePrivateRoads,
      respectRestrictions,
    });

    // Clear existing edges for this area
    await sql`DELETE FROM edges WHERE area_id = ${id}`;

    // Insert new edges with detailed metadata
    let insertedCount = 0;
    let oneWayCount = 0;
    let restrictedCount = 0;
    let deadEndCount = 0;

    for (const street of streets.features) {
      const geom = street.geometry as GeoJSON.LineString;
      const coords = geom.coordinates;
      const linestring = `LINESTRING(${coords.map((c: GeoJSON.Position) => `${c[0]} ${c[1]}`).join(',')})`;

      // Track statistics
      if (street.properties?.oneway) oneWayCount++;
      if (street.properties?.hasRestrictions) restrictedCount++;
      if (street.properties?.isDeadEnd) deadEndCount++;

      await sql`
        INSERT INTO edges (area_id, way_id, oneway, tags, geom)
        VALUES (
          ${id},
          ${street.properties?.osmId || null},
          ${street.properties?.oneway || false},
          ${JSON.stringify(street.properties || {})}::jsonb,
          ST_GeomFromText(${linestring}, 4326)
        )
      `;
      insertedCount++;
    }

    // Get summary statistics
    const stats = await sql`
      SELECT 
        COUNT(*) as street_count,
        COALESCE(SUM(ST_Length(geom::geography)), 0) as total_length_m
      FROM edges
      WHERE area_id = ${id}
    `;

    return NextResponse.json({
      success: true,
      area: {
        name: area.name,
        size_sq_km: area.area_sq_km.toFixed(2),
      },
      extraction: {
        streets_found: osmData.elements?.length || 0,
        streets_filtered: insertedCount,
        one_way_streets: oneWayCount,
        restricted_streets: restrictedCount,
        dead_ends: deadEndCount,
        total_length_km: ((stats[0].total_length_m || 0) / 1000).toFixed(2),
      },
      filters_applied: {
        includeServiceRoads,
        includePrivateRoads,
        respectRestrictions,
      },
      geojson: streets,
    });
  } catch (error) {
    console.error('Street extraction error:', error);
    return NextResponse.json(
      {
        error: 'Failed to extract streets',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function buildOverpassQuery(
  bbox: string,
  options: {
    includeServiceRoads: boolean;
    includePrivateRoads: boolean;
    respectRestrictions: boolean;
  }
): string {
  // Build highway filter
  let highwayFilter = DRIVABLE_HIGHWAYS.map((h) => `"highway"="${h}"`).join('');
  highwayFilter = `["highway"~"^(${DRIVABLE_HIGHWAYS.join('|')})$"]`;

  // Build exclusion filters
  const excludeFilters: string[] = [];

  // Exclude non-drivable highways
  excludeFilters.push(`["highway"!~"^(${EXCLUDED_HIGHWAYS.join('|')})$"]`);

  // Exclude area=yes (these are polygons, not roads)
  excludeFilters.push('["area"!="yes"]');

  // Service road filtering
  if (!options.includeServiceRoads) {
    excludeFilters.push(`["service"!~"^(${EXCLUDED_SERVICE_TYPES.join('|')})$"]`);
  }

  // Access filtering
  if (!options.includePrivateRoads) {
    excludeFilters.push(`["access"!~"^(${EXCLUDED_ACCESS.join('|')})$"]`);
  }

  return `
    [out:json][timeout:180];
    (
      way${highwayFilter}
      ${excludeFilters.join('\n      ')}
      (${bbox});
    );
    out geom;
  `;
}

type Geometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

function getBounds(geometry: Geometry): {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
} {
  let minLat = Infinity,
    minLon = Infinity;
  let maxLat = -Infinity,
    maxLon = -Infinity;

  function processCoordinate(coord: number[]) {
    const [lon, lat] = coord;
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  function processCoordinates(
    coords: GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][]
  ): void {
    if (!coords || !Array.isArray(coords)) return;

    if (typeof coords[0] === 'number') {
      processCoordinate(coords as unknown as number[]);
    } else if (Array.isArray(coords[0])) {
      if (typeof coords[0][0] === 'number') {
        // Array of positions
        (coords as GeoJSON.Position[]).forEach((coord) => processCoordinate(coord as number[]));
      } else {
        // Array of arrays
        (coords as GeoJSON.Position[][] | GeoJSON.Position[][][]).forEach((ring) =>
          processCoordinates(ring)
        );
      }
    }
  }

  if (geometry.type === 'Polygon') {
    processCoordinates(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    (geometry.coordinates as unknown as GeoJSON.Position[][][][]).forEach((polygon) =>
      processCoordinates(polygon)
    );
  }

  return { minLat, minLon, maxLat, maxLon };
}

interface OsmElement {
  type: string;
  id: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: {
    highway?: string;
    name?: string;
    oneway?: string;
    lanes?: string;
    maxspeed?: string;
    surface?: string;
    access?: string;
    service?: string;
    motor_vehicle?: string;
    bus?: string;
    restriction?: string;
    junction?: string;
  };
}

interface OsmData {
  elements: OsmElement[];
}

function convertOsmToGeoJSON(
  osmData: OsmData,
  options: {
    includeServiceRoads: boolean;
    includePrivateRoads: boolean;
    respectRestrictions: boolean;
  }
): { type: string; features: GeoJSON.Feature[] } {
  const features: GeoJSON.Feature[] = [];

  if (!osmData.elements) return { type: 'FeatureCollection', features };

  for (const element of osmData.elements) {
    if (element.type === 'way' && element.geometry) {
      const coords = element.geometry.map((node) => [node.lon, node.lat]);

      // Additional filtering based on tags
      const tags = element.tags || {};

      // Skip if it's a service road we don't want
      if (tags.service && !options.includeServiceRoads) {
        if (EXCLUDED_SERVICE_TYPES.includes(tags.service)) {
          continue;
        }
      }

      // Skip if it's private access and we don't want those
      if (tags.access && !options.includePrivateRoads) {
        if (EXCLUDED_ACCESS.includes(tags.access)) {
          continue;
        }
      }

      // Detect restrictions
      const hasRestrictions = !!(
        tags.motor_vehicle === 'no' ||
        (tags.bus === 'yes' && tags.motor_vehicle !== 'yes') ||
        tags.restriction
      );

      // Detect if it's a dead end (simplified - would need graph analysis for accuracy)
      const isDeadEnd = tags.junction === 'cul-de-sac' || tags.highway === 'turning_circle';

      if (coords.length >= 2) {
        features.push({
          type: 'Feature' as const,
          properties: {
            osmId: element.id,
            highway: tags.highway || 'unknown',
            name: tags.name || '',
            oneway: tags.oneway === 'yes' || tags.oneway === '1' || tags.oneway === 'true',
            lanes: tags.lanes || null,
            maxspeed: tags.maxspeed || null,
            surface: tags.surface || null,
            access: tags.access || 'yes',
            service: tags.service || null,
            hasRestrictions,
            isDeadEnd,
            busGate: tags.bus === 'yes' && tags.motor_vehicle === 'no',
            restrictionType: tags.restriction || null,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
