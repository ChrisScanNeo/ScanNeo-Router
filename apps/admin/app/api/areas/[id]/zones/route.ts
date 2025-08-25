import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// GET zones for an area
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    const { id } = params;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get zones with their details
    const zones = await sql`
      SELECT 
        z.id,
        z.zone_index,
        z.zone_name,
        z.estimated_time_hours,
        z.estimated_length_km,
        z.street_count,
        z.status,
        ST_AsGeoJSON(z.geom)::json as geometry,
        z.metadata,
        z.created_at,
        z.updated_at,
        -- Get associated route if exists
        cr.id as route_id,
        cr.length_m as route_length_m,
        cr.drive_time_s as route_time_s,
        -- Get progress info
        zp.completed_at,
        zp.coverage_percentage,
        zp.actual_time_hours
      FROM zones z
      LEFT JOIN coverage_routes cr ON cr.zone_id = z.id
      LEFT JOIN zone_progress zp ON zp.zone_id = z.id
      WHERE z.parent_area_id = ${id}
      ORDER BY z.zone_index
    `;

    // Get area info
    const areaResult = await sql`
      SELECT name, ST_AsGeoJSON(geom)::json as geometry
      FROM areas 
      WHERE id = ${id}
    `;

    if (areaResult.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    // Calculate overall progress
    const totalZones = zones.length;
    const completedZones = zones.filter((z) => z.status === 'completed').length;
    const inProgressZones = zones.filter((z) => z.status === 'in_progress').length;
    const totalEstimatedHours = zones.reduce((sum, z) => sum + (z.estimated_time_hours || 0), 0);
    const actualHoursSpent = zones.reduce((sum, z) => sum + (z.actual_time_hours || 0), 0);

    return NextResponse.json({
      area: {
        id,
        name: areaResult[0].name,
        geometry: areaResult[0].geometry,
      },
      summary: {
        total_zones: totalZones,
        completed_zones: completedZones,
        in_progress_zones: inProgressZones,
        pending_zones: totalZones - completedZones - inProgressZones,
        completion_percentage: totalZones > 0 ? (completedZones / totalZones) * 100 : 0,
        total_estimated_hours: totalEstimatedHours,
        actual_hours_spent: actualHoursSpent,
      },
      zones: zones.map((z) => ({
        id: z.id,
        index: z.zone_index,
        name: z.zone_name,
        status: z.status,
        estimated_time_hours: z.estimated_time_hours,
        estimated_length_km: z.estimated_length_km,
        street_count: z.street_count,
        geometry: z.geometry,
        metadata: z.metadata,
        route: z.route_id
          ? {
              id: z.route_id,
              length_m: z.route_length_m,
              time_s: z.route_time_s,
            }
          : null,
        progress: z.completed_at
          ? {
              completed_at: z.completed_at,
              coverage_percentage: z.coverage_percentage,
              actual_time_hours: z.actual_time_hours,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error('Fetch zones error:', error);
    return NextResponse.json({ error: 'Failed to fetch zones' }, { status: 500 });
  }
}

// Update zone status
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  try {
    const { id } = params;
    const body = await request.json();
    const { zone_id, status, progress_data } = body;

    if (!zone_id || !status) {
      return NextResponse.json({ error: 'zone_id and status are required' }, { status: 400 });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Update zone status
    await sql`
      UPDATE zones 
      SET 
        status = ${status},
        updated_at = now()
      WHERE id = ${zone_id} AND parent_area_id = ${id}
    `;

    // If marking as completed, record progress
    if (status === 'completed' && progress_data) {
      await sql`
        INSERT INTO zone_progress (
          zone_id,
          completed_at,
          coverage_percentage,
          actual_time_hours,
          notes
        ) VALUES (
          ${zone_id},
          now(),
          ${progress_data.coverage_percentage || 100},
          ${progress_data.actual_time_hours || 0},
          ${progress_data.notes || null}
        )
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update zone error:', error);
    return NextResponse.json({ error: 'Failed to update zone' }, { status: 500 });
  }
}
