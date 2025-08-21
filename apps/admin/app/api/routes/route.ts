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
        ST_AsGeoJSON(r.geom)::json as geojson,
        r.length_m,
        r.drive_time_s
      FROM coverage_routes r
      LEFT JOIN areas a ON r.area_id = a.id
      ORDER BY r.created_at DESC
    `;

    // Transform routes to include status from params
    const transformedRoutes = routes.map((route) => {
      const params = route.params as Record<string, unknown>;
      return {
        ...route,
        status: params?.status || 'pending',
        progress: params?.progress || 0,
        error: params?.error || null,
        metadata: params?.metadata || {},
      };
    });

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
      INSERT INTO coverage_routes (area_id, profile, params)
      VALUES (
        ${area_id}, 
        ${profile}, 
        ${JSON.stringify({
          status: 'pending',
          progress: 0,
          chunkDuration,
          metadata: {
            stage: 'Queued for processing',
            stats: {},
          },
        })}::jsonb
      )
      RETURNING id, area_id, created_at, profile, params
    `;

    return NextResponse.json({
      ...route,
      status: 'pending',
      progress: 0,
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
