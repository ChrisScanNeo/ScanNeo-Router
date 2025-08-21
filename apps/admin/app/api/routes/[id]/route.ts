import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Fetch route details with area name
    const route = await sql`
      SELECT 
        r.id,
        r.area_id,
        a.name as area_name,
        r.status,
        r.progress,
        r.created_at,
        r.updated_at,
        r.profile,
        r.params,
        r.metadata,
        r.error,
        ST_AsGeoJSON(r.geojson)::json as geojson,
        r.length_m,
        r.drive_time_s
      FROM coverage_routes r
      LEFT JOIN areas a ON r.area_id = a.id
      WHERE r.id = ${params.id}
      LIMIT 1
    `;

    if (route.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Fetch chunks for this route
    const chunks = await sql`
      SELECT 
        id,
        chunk_index,
        ST_AsGeoJSON(geojson)::json as geojson,
        length_m,
        duration_s
      FROM coverage_chunks
      WHERE route_id = ${params.id}
      ORDER BY chunk_index
    `;

    const routeData = {
      ...route[0],
      chunks,
    };

    return NextResponse.json(routeData);
  } catch (error) {
    console.error('Error fetching route:', error);
    return NextResponse.json({ error: 'Failed to fetch route details' }, { status: 500 });
  }
}
