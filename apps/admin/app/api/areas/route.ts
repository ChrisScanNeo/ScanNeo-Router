import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET all areas
export async function GET() {
  try {
    const areas = await sql`
      SELECT 
        id,
        name,
        ST_AsGeoJSON(geom)::json as geojson,
        buffer_m,
        params,
        created_at,
        updated_at
      FROM areas
      ORDER BY created_at DESC
    `;

    // Transform the results for the frontend
    const formattedAreas = areas.map((area) => ({
      id: area.id,
      name: area.name,
      geojson: area.geojson,
      buffer_m: area.buffer_m,
      profile: area.params?.profile || 'driving-car',
      includeService: area.params?.includeService || false,
      chunkDuration: area.params?.chunkDuration || 3600,
      created_at: area.created_at,
      updated_at: area.updated_at,
    }));

    return NextResponse.json({
      success: true,
      areas: formattedAreas,
      count: formattedAreas.length,
    });
  } catch (error) {
    console.error('Failed to fetch areas:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch areas',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE all areas (for testing)
export async function DELETE() {
  try {
    const result = await sql`
      DELETE FROM areas
      RETURNING id
    `;

    return NextResponse.json({
      success: true,
      deleted: result.length,
      message: `Deleted ${result.length} areas`,
    });
  } catch (error) {
    console.error('Failed to delete areas:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete areas',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
