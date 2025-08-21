import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Fetch route details with area name
    const route = await sql`
      SELECT 
        r.id,
        r.area_id,
        a.name as area_name,
        r.created_at,
        r.updated_at,
        r.profile,
        r.params,
        ST_AsGeoJSON(r.geom)::json as geojson,
        r.length_m,
        r.drive_time_s
      FROM coverage_routes r
      LEFT JOIN areas a ON r.area_id = a.id
      WHERE r.id = ${id}
      LIMIT 1
    `;

    if (route.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Fetch chunks for this route (table might not exist yet)
    let chunks = [];
    try {
      chunks = await sql`
        SELECT 
          id,
          idx as chunk_index,
          ST_AsGeoJSON(geom)::json as geojson,
          length_m,
          time_s as duration_s
        FROM chunks
        WHERE route_id = ${id}
        ORDER BY idx
      `;
    } catch (chunksError) {
      // coverage_chunks table might not exist yet, continue without chunks
      console.warn('Could not fetch chunks:', chunksError);
    }

    // Extract status info from params JSONB
    const routeRecord = route[0];
    const routeParams = routeRecord.params as Record<string, unknown>;

    const routeData = {
      ...routeRecord,
      status: routeParams?.status || 'pending',
      progress: routeParams?.progress || 0,
      error: routeParams?.error || null,
      metadata: routeParams?.metadata || {},
      chunks,
    };

    return NextResponse.json(routeData);
  } catch (error) {
    console.error('Error fetching route:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch route details',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
