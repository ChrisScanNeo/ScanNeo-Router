import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';

// Request validation schema
const ImportAreaSchema = z.object({
  name: z.string().min(1, 'Area name is required'),
  geojson: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
  buffer_m: z.number().min(0).max(100).default(0),
  profile: z.enum(['driving-car', 'driving-hgv']).default('driving-car'),
  includeService: z.boolean().default(false),
  chunkDuration: z.number().min(600).max(7200).default(3600),
});

export async function POST(req: NextRequest) {
  try {
    // Parse and validate request body
    const body = await req.json();
    const validatedData = ImportAreaSchema.parse(body);

    // Prepare parameters for storage
    const params = {
      profile: validatedData.profile,
      includeService: validatedData.includeService,
      chunkDuration: validatedData.chunkDuration,
    };

    // Insert area into database with PostGIS geometry
    const result = await sql`
      INSERT INTO areas (name, geom, buffer_m, params)
      VALUES (
        ${validatedData.name},
        ST_GeomFromGeoJSON(${JSON.stringify(validatedData.geojson)}),
        ${validatedData.buffer_m},
        ${JSON.stringify(params)}::jsonb
      )
      RETURNING id, name, buffer_m, created_at
    `;

    if (!result || result.length === 0) {
      throw new Error('Failed to insert area into database');
    }

    const area = result[0];
    console.log('Area imported successfully:', area);

    return NextResponse.json({
      success: true,
      areaId: area.id,
      area: {
        id: area.id,
        name: area.name,
        buffer_m: area.buffer_m,
        created_at: area.created_at,
      },
      message: 'Area imported successfully',
    });
  } catch (error) {
    console.error('Import area error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to import area' }, { status: 500 });
  }
}

// GET endpoint for health check
export async function GET() {
  try {
    const { checkDatabaseConnection, checkPostGIS } = await import('@/lib/db');

    const dbStatus = await checkDatabaseConnection();
    const postgisStatus = await checkPostGIS();

    return NextResponse.json({
      status: 'healthy',
      database: dbStatus,
      postgis: postgisStatus,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
