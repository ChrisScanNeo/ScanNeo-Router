import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { currentPosition, rejoinPoint, routeId } = await request.json();

    if (!currentPosition || !rejoinPoint) {
      return NextResponse.json(
        { error: 'Current position and rejoin point are required' },
        { status: 400 }
      );
    }

    // Call OpenRouteService to get reroute path
    const orsApiKey = process.env.ORS_API_KEY;
    if (!orsApiKey) {
      return NextResponse.json({ error: 'Routing service not configured' }, { status: 500 });
    }

    const orsResponse = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: {
        Authorization: orsApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [currentPosition, rejoinPoint],
        radiuses: [50, 50], // Allow some flexibility in matching points
      }),
    });

    if (!orsResponse.ok) {
      const errorText = await orsResponse.text();
      console.error('ORS reroute error:', errorText);

      // Fallback to simple straight line
      return NextResponse.json({
        success: true,
        reroute: {
          type: 'Feature',
          properties: {
            distance: calculateDistance(currentPosition, rejoinPoint),
            duration: 60, // Estimate 1 minute
          },
          geometry: {
            type: 'LineString',
            coordinates: [currentPosition, rejoinPoint],
          },
        },
      });
    }

    const orsData = await orsResponse.json();

    if (!orsData.features || orsData.features.length === 0) {
      return NextResponse.json({ error: 'No route found' }, { status: 404 });
    }

    const rerouteFeature = orsData.features[0];

    return NextResponse.json({
      success: true,
      routeId: routeId,
      reroute: {
        type: 'Feature',
        properties: {
          distance: rerouteFeature.properties.segments[0].distance,
          duration: rerouteFeature.properties.segments[0].duration,
        },
        geometry: rerouteFeature.geometry,
      },
    });
  } catch (error) {
    console.error('Reroute error:', error);
    return NextResponse.json(
      {
        error: 'Failed to calculate reroute',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Simple distance calculation
function calculateDistance(coord1: number[], coord2: number[]): number {
  const R = 6371000; // Earth radius in meters
  const lat1 = (coord1[1] * Math.PI) / 180;
  const lat2 = (coord2[1] * Math.PI) / 180;
  const deltaLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const deltaLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
