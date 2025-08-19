import { NextRequest, NextResponse } from 'next/server';
// import { verifyBearer } from '@/lib/firebaseAdmin'; // Disabled for demo
import { z } from 'zod';

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic';

// Request validation schema
const RerouteSchema = z.object({
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2, 'At least 2 coordinates required'),
  profile: z.enum(['driving-car', 'driving-hgv']).default('driving-car'),
  radiuses: z.array(z.number()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Skip authentication for demo deployment
    // const user = await verifyBearer(req.headers.get('authorization') || undefined);
    // if (!user) {
    //   return new NextResponse('Unauthorized', { status: 401 });
    // }

    // Parse and validate request body
    const body = await req.json();
    const validatedData = RerouteSchema.parse(body);

    // Check ORS API key is configured
    if (!process.env.ORS_API_KEY) {
      console.error('ORS_API_KEY not configured');
      return NextResponse.json({ error: 'Routing service not configured' }, { status: 503 });
    }

    // Call OpenRouteService API
    const orsResponse = await fetch(
      `https://api.openrouteservice.org/v2/directions/${validatedData.profile}/geojson`,
      {
        method: 'POST',
        headers: {
          Authorization: process.env.ORS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          coordinates: validatedData.coordinates,
          instructions: true,
          units: 'm',
          geometry: true,
          radiuses: validatedData.radiuses,
        }),
      }
    );

    if (!orsResponse.ok) {
      const errorText = await orsResponse.text();
      console.error('ORS API error:', orsResponse.status, errorText);

      if (orsResponse.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to calculate route' },
        { status: orsResponse.status }
      );
    }

    const routeData = await orsResponse.json();

    // Add metadata to response
    const response = {
      ...routeData,
      metadata: {
        profile: validatedData.profile,
        timestamp: new Date().toISOString(),
        demo: true,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Reroute API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to calculate route' }, { status: 500 });
  }
}

// GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'reroute-api',
    hasOrsKey: !!process.env.ORS_API_KEY,
  });
}
