import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    // Parse request body for options
    const body = await request.json().catch(() => ({}));
    const {
      startPoint,
      coverageMode = true, // Default to coverage mode for U-turn support
      chunkDuration = 3600, // Default 1 hour chunks
      zoneId = null, // Optional zone ID to generate route for specific zone
    } = body;

    // Get database connection
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get area info
    const areaResult = await sql`
      SELECT id, name, ST_AsGeoJSON(geom)::json as geojson
      FROM areas 
      WHERE id = ${id}
    `;

    if (areaResult.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    // Get streets for this area (or zone if specified)
    let streetsResult;

    if (zoneId) {
      // Get zone geometry first
      const zoneCheck = await sql`
        SELECT id FROM zones WHERE id = ${zoneId} AND parent_area_id = ${id}
      `;

      if (zoneCheck.length === 0) {
        return NextResponse.json(
          { error: 'Zone not found or does not belong to this area' },
          { status: 404 }
        );
      }

      // Get streets that intersect with the zone
      streetsResult = await sql`
        SELECT 
          e.id,
          e.way_id,
          e.oneway,
          e.tags,
          ST_AsGeoJSON(e.geom)::json as geometry,
          ST_Length(e.geom::geography) as length_m
        FROM edges e
        JOIN zones z ON ST_Intersects(e.geom, z.geom)
        WHERE e.area_id = ${id} AND z.id = ${zoneId}
        ORDER BY e.id
      `;

      console.log(`Generating route for zone ${zoneId} with ${streetsResult.length} streets`);
    } else {
      // Get all streets for the area
      streetsResult = await sql`
        SELECT 
          id,
          way_id,
          oneway,
          tags,
          ST_AsGeoJSON(geom)::json as geometry,
          ST_Length(geom::geography) as length_m
        FROM edges
        WHERE area_id = ${id}
        ORDER BY id
      `;
    }

    if (streetsResult.length === 0) {
      return NextResponse.json(
        {
          error: 'No streets found',
          details: 'Please extract streets first',
        },
        { status: 400 }
      );
    }

    // Convert to GeoJSON FeatureCollection
    const features = streetsResult.map((street) => ({
      type: 'Feature',
      properties: {
        id: street.id,
        wayId: street.way_id,
        oneway: street.oneway,
        lengthMeters: street.length_m,
        ...street.tags,
      },
      geometry: street.geometry,
    }));

    const streetsGeoJSON = {
      type: 'FeatureCollection',
      features,
    };

    // Call Python worker service
    const workerUrl = process.env.WORKER_SERVICE_URL || 'http://localhost:8000';
    const workerResponse = await fetch(`${workerUrl}/api/generate-route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        streets_geojson: streetsGeoJSON,
        start_point: startPoint,
        coverage_mode: coverageMode,
        chunk_duration: chunkDuration,
        area_id: id,
        area_name: areaResult[0].name,
      }),
    });

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      console.error(`Worker error: ${workerResponse.status} - ${errorText}`);
      return NextResponse.json(
        {
          error: 'Route generation failed',
          details: `Worker service returned ${workerResponse.status}`,
        },
        { status: 500 }
      );
    }

    const routeData = await workerResponse.json();

    // Save route to database
    const routeResult = await sql`
      INSERT INTO coverage_routes (
        area_id,
        area_name,
        zone_id,
        profile,
        status,
        progress,
        params,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        ${id},
        ${areaResult[0].name},
        ${zoneId},
        'driving-car',
        'completed',
        100,
        ${JSON.stringify({
          chunkDuration,
          coverageMode,
          startPoint,
          zoneId,
        })}::jsonb,
        ${JSON.stringify({
          route: routeData,
          generatedAt: new Date().toISOString(),
        })}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING id
    `;

    // If zone was specified, update zone status
    if (zoneId) {
      await sql`
        UPDATE zones 
        SET status = 'in_progress', updated_at = NOW()
        WHERE id = ${zoneId}
      `;
    }

    return NextResponse.json({
      success: true,
      routeId: routeResult[0].id,
      route: routeData,
    });
  } catch (error) {
    console.error('Route generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate route',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

interface StreetFeature {
  geometry: {
    coordinates: number[][];
  };
  properties: {
    lengthMeters: number;
    [key: string]: unknown;
  };
}

interface GapInfo {
  id: number;
  startPoint: number[];
  endPoint: number[];
  distance: number;
  type: 'u-turn' | 'connection';
  resolved: boolean;
}

// Helper function to detect gaps in street network
function detectGaps(features: StreetFeature[]): GapInfo[] {
  const gaps = [];
  const threshold = 50; // meters

  // Build a map of endpoints
  const endpoints = new Map();

  for (const feature of features) {
    const coords = feature.geometry.coordinates;
    const start = coords[0];
    const end = coords[coords.length - 1];

    const startKey = `${start[0].toFixed(6)},${start[1].toFixed(6)}`;
    const endKey = `${end[0].toFixed(6)},${end[1].toFixed(6)}`;

    if (!endpoints.has(startKey)) endpoints.set(startKey, []);
    if (!endpoints.has(endKey)) endpoints.set(endKey, []);

    endpoints.get(startKey).push({ type: 'start', feature });
    endpoints.get(endKey).push({ type: 'end', feature });
  }

  // Find disconnected endpoints
  let gapId = 1;
  for (const [key, connections] of endpoints.entries()) {
    if (connections.length === 1) {
      // This is a dead end or gap
      const [lon, lat] = key.split(',').map(Number);

      // Find nearest other endpoint
      let nearestDist = Infinity;
      let nearestPoint = null;

      for (const [otherKey] of endpoints.entries()) {
        if (otherKey === key) continue;

        const [otherLon, otherLat] = otherKey.split(',').map(Number);
        const dist = haversineDistance([lon, lat], [otherLon, otherLat]);

        if (dist < nearestDist && dist > 1) {
          // Ignore same point
          nearestDist = dist;
          nearestPoint = [otherLon, otherLat];
        }
      }

      if (nearestDist < threshold && nearestPoint) {
        gaps.push({
          id: gapId++,
          startPoint: [lon, lat],
          endPoint: nearestPoint,
          distance: Math.round(nearestDist),
          type: (nearestDist < 20 ? 'u-turn' : 'connection') as 'u-turn' | 'connection',
          resolved: false,
        });
      }
    }
  }

  // Remove duplicate gaps (both directions)
  const uniqueGaps = [];
  const seen = new Set();

  for (const gap of gaps) {
    const key1 = `${gap.startPoint[0]},${gap.startPoint[1]}-${gap.endPoint[0]},${gap.endPoint[1]}`;
    const key2 = `${gap.endPoint[0]},${gap.endPoint[1]}-${gap.startPoint[0]},${gap.startPoint[1]}`;

    if (!seen.has(key1) && !seen.has(key2)) {
      uniqueGaps.push(gap);
      seen.add(key1);
      seen.add(key2);
    }
  }

  return uniqueGaps;
}

// Haversine distance calculation
function haversineDistance(coord1: number[], coord2: number[]): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;
  const deltaLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const deltaLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
