import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Temporarily disabled for demo deployment
// import { sql } from '@/lib/db';
// import { buildQueue } from '@/lib/queue';
// import { verifyBearer } from '@/lib/firebaseAdmin';

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

    // For demo deployment - simulate successful import
    const areaId = crypto.randomUUID();
    const jobId = `demo_job_${areaId}_${Date.now()}`;

    console.log('Demo area import:', {
      name: validatedData.name,
      buffer_m: validatedData.buffer_m,
      profile: validatedData.profile,
      includeService: validatedData.includeService,
      chunkDuration: validatedData.chunkDuration,
      areaId,
      jobId,
    });

    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return NextResponse.json({
      success: true,
      areaId: areaId,
      jobId: jobId,
      message: 'Area imported successfully (demo mode)',
      demo: true,
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
