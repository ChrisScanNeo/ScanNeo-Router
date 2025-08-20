import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

// GET single area by ID
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await sql`
      SELECT 
        id,
        name,
        ST_AsGeoJSON(geom)::json as geojson,
        ST_AsGeoJSON(ST_Envelope(geom))::json as bounds,
        buffer_m,
        params,
        created_at,
        updated_at
      FROM areas
      WHERE id = ${id}
    `;

    if (!result || result.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    const area = result[0];

    return NextResponse.json({
      success: true,
      area: {
        id: area.id,
        name: area.name,
        geojson: area.geojson,
        bounds: area.bounds,
        buffer_m: area.buffer_m,
        profile: area.params?.profile || 'driving-car',
        includeService: area.params?.includeService || false,
        chunkDuration: area.params?.chunkDuration || 3600,
        created_at: area.created_at,
        updated_at: area.updated_at,
      },
    });
  } catch (error) {
    console.error('Failed to fetch area:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch area',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// DELETE single area by ID
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await sql`
      DELETE FROM areas
      WHERE id = ${id}
      RETURNING id, name
    `;

    if (!result || result.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      deleted: result[0],
      message: `Area "${result[0].name}" deleted successfully`,
    });
  } catch (error) {
    console.error('Failed to delete area:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete area',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
