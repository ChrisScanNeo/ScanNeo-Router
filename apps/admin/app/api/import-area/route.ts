import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { buildQueue } from '@/lib/queue';
import { verifyBearer } from '@/lib/firebaseAdmin';
import { z } from 'zod';

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
    // Verify authentication
    const user = await verifyBearer(req.headers.get('authorization') || undefined);
    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = ImportAreaSchema.parse(body);

    // Store area in database with PostGIS
    const result = await sql`
      WITH geom_in AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(validatedData.geojson)}), 4326) AS g
      ), geom_buf AS (
        SELECT CASE
          WHEN ${validatedData.buffer_m} > 0 THEN ST_Buffer(g::geography, ${validatedData.buffer_m})::geometry
          ELSE g
        END AS geom
        FROM geom_in
      )
      INSERT INTO areas (name, geom, buffer_m, params)
      SELECT 
        ${validatedData.name}, 
        geom, 
        ${validatedData.buffer_m}, 
        ${JSON.stringify({
          profile: validatedData.profile,
          includeService: validatedData.includeService,
          chunkDuration: validatedData.chunkDuration,
          userId: user.uid,
        })}::jsonb
      FROM geom_buf
      RETURNING id, name, ST_AsGeoJSON(geom) as geojson
    `;

    if (!result || result.length === 0) {
      throw new Error('Failed to insert area');
    }

    const area = result[0];

    // Queue the coverage build job
    const jobId = `job_${area.id}_${Date.now()}`;
    await buildQueue.send({
      id: jobId,
      name: 'build-coverage',
      body: {
        areaId: area.id,
        areaName: area.name,
        profile: validatedData.profile,
        includeService: validatedData.includeService,
        chunkDuration: validatedData.chunkDuration,
      },
      createdAt: new Date().toISOString(),
    });

    // Update job status
    await buildQueue.updateStatus(jobId, {
      status: 'queued',
      areaId: area.id,
      areaName: area.name,
      progress: 0,
      stage: 'Queued for processing',
      startedAt: null,
      completedAt: null,
    });

    return NextResponse.json({
      success: true,
      areaId: area.id,
      jobId: jobId,
      message: 'Area imported successfully and queued for processing',
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
