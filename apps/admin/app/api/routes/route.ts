import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Fetch all routes with area names
    const routes = await sql`
      SELECT 
        r.id,
        r.area_id,
        a.name as area_name,
        r.created_at,
        r.updated_at,
        r.profile,
        r.params,
        r.status,
        r.progress,
        r.error,
        r.metadata,
        ST_AsGeoJSON(r.geom)::json as geojson,
        r.length_m,
        r.drive_time_s
      FROM coverage_routes r
      LEFT JOIN areas a ON r.area_id = a.id
      ORDER BY r.created_at DESC
    `;

    // Routes now have status as top-level columns
    const transformedRoutes = routes.map((route) => ({
      ...route,
      status: route.status || 'pending',
      progress: route.progress || 0,
      error: route.error || null,
      metadata: route.metadata || {},
    }));

    return NextResponse.json(transformedRoutes);
  } catch (error) {
    console.error('Error fetching routes:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch routes',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const body = await request.json();

    const { area_id, profile = 'driving-car', chunkDuration = 1800 } = body;

    if (!area_id) {
      return NextResponse.json({ error: 'area_id is required' }, { status: 400 });
    }

    // Create a new route job
    const [route] = await sql`
      INSERT INTO coverage_routes (area_id, profile, status, progress, params, metadata)
      VALUES (
        ${area_id}, 
        ${profile},
        'queued',
        0, 
        ${JSON.stringify({
          chunkDuration,
          includeService: false,
        })}::jsonb,
        ${JSON.stringify({
          stage: 'Queued for processing',
          stats: {},
        })}::jsonb
      )
      RETURNING id, area_id, created_at, profile, status, progress, params, metadata
    `;

    return NextResponse.json({
      ...route,
      status: route.status || 'queued',
      progress: route.progress || 0,
    });
  } catch (error) {
    console.error('Error creating route:', error);
    return NextResponse.json(
      {
        error: 'Failed to create route',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
