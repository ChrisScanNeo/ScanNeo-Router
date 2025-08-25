import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST(request: NextRequest) {
  try {
    const { routeId } = await request.json();

    if (!routeId) {
      return NextResponse.json({ error: 'Route ID is required' }, { status: 400 });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get route data with metadata
    const routeResult = await sql`
      SELECT 
        r.id,
        r.area_id,
        r.metadata,
        r.params,
        a.name as area_name,
        ST_AsGeoJSON(r.geom)::json as geojson
      FROM coverage_routes r
      LEFT JOIN areas a ON r.area_id = a.id
      WHERE r.id = ${routeId}
      LIMIT 1
    `;

    if (routeResult.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    const route = routeResult[0];

    // Extract route coordinates from metadata
    let coordinates = [];

    // Try to get coordinates from metadata (nested structure)
    if (route.metadata?.route?.route?.geometry?.coordinates) {
      coordinates = route.metadata.route.route.geometry.coordinates;
    }
    // Fallback to direct metadata path
    else if (route.metadata?.route?.geometry?.coordinates) {
      coordinates = route.metadata.route.geometry.coordinates;
    }
    // Fallback to geojson if available
    else if (route.geojson?.coordinates) {
      coordinates = route.geojson.coordinates;
    }

    // Get any existing covered segments for this route
    const coverageResult = await sql`
      SELECT 
        edge_id,
        covered_at
      FROM covered_edges
      WHERE route_id = ${routeId}
      ORDER BY covered_at
    `;

    return NextResponse.json({
      id: route.id,
      areaId: route.area_id,
      areaName: route.area_name,
      geometry: {
        type: 'LineString',
        coordinates: coordinates,
      },
      metadata: route.metadata,
      params: route.params,
      coveredSegments: coverageResult.map((r) => r.edge_id),
      success: true,
    });
  } catch (error) {
    console.error('Navigation start error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start navigation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
