import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

interface ZoneDivisionParams {
  targetHours?: number;
  method?: 'grid' | 'clustering' | 'density';
  maxZones?: number;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    const { id } = params;
    const body: ZoneDivisionParams = await request.json().catch(() => ({}));
    const {
      targetHours = 1.0, // Default 1 hour per zone
      method = 'grid', // Default to grid-based division
      maxZones = 50, // Maximum zones to create
    } = body;

    // Get database connection
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Check if area exists and get its data
    const areaResult = await sql`
      SELECT 
        id, 
        name, 
        ST_AsGeoJSON(geom)::json as geojson,
        ST_Area(geom::geography) / 1000000 as area_km2,
        ST_XMin(geom) as min_lon,
        ST_XMax(geom) as max_lon,
        ST_YMin(geom) as min_lat,
        ST_YMax(geom) as max_lat
      FROM areas 
      WHERE id = ${id}
    `;

    if (areaResult.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    const area = areaResult[0] as AreaData;

    // Check if zones already exist for this area
    const existingZones = await sql`
      SELECT COUNT(*) as count FROM zones WHERE parent_area_id = ${id}
    `;

    if (existingZones[0].count > 0) {
      return NextResponse.json(
        {
          error: 'Zones already exist for this area',
          details: 'Delete existing zones before creating new ones',
        },
        { status: 400 }
      );
    }

    // Get street statistics for the area
    const streetStats = await sql`
      SELECT 
        COUNT(*) as street_count,
        SUM(ST_Length(geom::geography)) / 1000 as total_length_km
      FROM edges
      WHERE area_id = ${id}
    `;

    const { street_count, total_length_km } = streetStats[0];

    if (!street_count || street_count === 0) {
      return NextResponse.json(
        {
          error: 'No streets found',
          details: 'Extract streets before dividing into zones',
        },
        { status: 400 }
      );
    }

    // Estimate total driving time (with coverage overhead)
    const avgSpeedKmh = 30; // Average city driving speed
    const coverageMultiplier = 1.8; // Account for coverage pattern (not direct routes)
    const totalHours = (total_length_km * coverageMultiplier) / avgSpeedKmh;

    // Calculate number of zones needed
    const numZones = Math.min(maxZones, Math.max(1, Math.ceil(totalHours / targetHours)));

    console.log(`Area: ${area.name}, Streets: ${street_count}, Length: ${total_length_km}km`);
    console.log(`Estimated total time: ${totalHours.toFixed(1)}h, Creating ${numZones} zones`);

    // Create zones based on selected method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let zones: any[] = [];

    if (method === 'grid') {
      zones = await createGridZones(sql, area, numZones, id);
    } else if (method === 'density') {
      zones = await createDensityBasedZones(sql, area, numZones, id);
    } else {
      // Fallback to simple grid
      zones = await createGridZones(sql, area, numZones, id);
    }

    // Calculate estimated time for each zone based on streets within it
    for (const zone of zones) {
      const zoneStreets = await sql`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(ST_Length(e.geom::geography)) / 1000, 0) as length_km
        FROM edges e
        WHERE e.area_id = ${id}
        AND ST_Intersects(e.geom, ${zone.geom}::geometry)
      `;

      zone.street_count = zoneStreets[0].count;
      zone.estimated_length_km = zoneStreets[0].length_km;
      zone.estimated_time_hours = (zoneStreets[0].length_km * coverageMultiplier) / avgSpeedKmh;
    }

    // Insert zones into database
    const insertedZones = [];
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      const result = await sql`
        INSERT INTO zones (
          parent_area_id,
          zone_index,
          zone_name,
          estimated_time_hours,
          estimated_length_km,
          street_count,
          status,
          geom,
          metadata
        ) VALUES (
          ${id},
          ${i + 1},
          ${zone.name || `Zone ${i + 1}`},
          ${zone.estimated_time_hours || 0},
          ${zone.estimated_length_km || 0},
          ${zone.street_count || 0},
          'pending',
          ST_GeomFromGeoJSON(${JSON.stringify(zone.geom)}),
          ${JSON.stringify(zone.metadata || {})}
        )
        RETURNING id, zone_index, zone_name, estimated_time_hours, street_count, status
      `;
      insertedZones.push(result[0]);
    }

    return NextResponse.json({
      success: true,
      area_name: area.name,
      area_km2: area.area_km2,
      total_streets: street_count,
      total_length_km: total_length_km,
      estimated_total_hours: totalHours,
      target_hours_per_zone: targetHours,
      zones_created: insertedZones.length,
      zones: insertedZones,
    });
  } catch (error) {
    console.error('Zone division error:', error);
    return NextResponse.json(
      {
        error: 'Failed to divide area into zones',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Helper function to create grid-based zones
interface AreaData {
  name: string;
  area_km2: number;
  min_lon: number;
  max_lon: number;
  min_lat: number;
  max_lat: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createGridZones(sql: any, area: AreaData, numZones: number, areaId: string) {
  const zones = [];

  // Calculate grid dimensions
  const cols = Math.ceil(Math.sqrt(numZones));
  const rows = Math.ceil(numZones / cols);

  const width = area.max_lon - area.min_lon;
  const height = area.max_lat - area.min_lat;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  let zoneIndex = 0;
  for (let row = 0; row < rows && zoneIndex < numZones; row++) {
    for (let col = 0; col < cols && zoneIndex < numZones; col++) {
      const minLon = area.min_lon + col * cellWidth;
      const maxLon = minLon + cellWidth;
      const minLat = area.min_lat + row * cellHeight;
      const maxLat = minLat + cellHeight;

      // Create zone polygon
      const zonePolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [minLon, minLat],
            [maxLon, minLat],
            [maxLon, maxLat],
            [minLon, maxLat],
            [minLon, minLat],
          ],
        ],
      };

      // Clip zone to area boundary
      const clippedResult = await sql`
        SELECT ST_AsGeoJSON(
          ST_Intersection(
            ST_GeomFromGeoJSON(${JSON.stringify(zonePolygon)}),
            geom
          )
        )::json as clipped
        FROM areas
        WHERE id = ${areaId}
      `;

      if (clippedResult[0]?.clipped) {
        zones.push({
          name: `Zone ${String.fromCharCode(65 + row)}${col + 1}`, // A1, A2, B1, B2, etc.
          geom: clippedResult[0].clipped,
          metadata: {
            method: 'grid',
            grid_position: { row, col },
          },
        });
        zoneIndex++;
      }
    }
  }

  return zones;
}

// Helper function to create density-based zones (placeholder for future implementation)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createDensityBasedZones(sql: any, area: AreaData, numZones: number, areaId: string) {
  // For now, fallback to grid method
  // Future: Implement k-means clustering based on street density
  return createGridZones(sql, area, numZones, areaId);
}

// DELETE endpoint to remove zones
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    const { id } = params;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Delete all zones for this area
    const result = await sql`
      DELETE FROM zones 
      WHERE parent_area_id = ${id}
      RETURNING id
    `;

    return NextResponse.json({
      success: true,
      deleted: result.length,
    });
  } catch (error) {
    console.error('Zone deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete zones' }, { status: 500 });
  }
}
