import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params;

    // Get database connection
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get area info
    const areaResult = await sql`
      SELECT id, name, ST_AsGeoJSON(geom)::json as geojson
      FROM areas 
      WHERE id = ${id}
    `;

    if (areaResult.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    // Get streets for this area
    const streetsResult = await sql`
      SELECT 
        id,
        way_id,
        oneway,
        tags,
        ST_AsGeoJSON(geom)::json as geometry,
        ST_Length(geom::geography) as length_m
      FROM edges
      WHERE area_id = ${id}
      ORDER BY id
    `;

    // Convert to GeoJSON FeatureCollection
    const features = streetsResult.map((street) => ({
      type: 'Feature',
      properties: {
        id: street.id,
        wayId: street.way_id,
        oneway: street.oneway,
        lengthMeters: street.length_m,
        ...street.tags,
      },
      geometry: street.geometry,
    }));

    // Calculate statistics
    const totalLength = streetsResult.reduce((sum, s) => sum + s.length_m, 0);
    const onewayCount = streetsResult.filter((s) => s.oneway).length;

    return NextResponse.json({
      success: true,
      area: {
        id: areaResult[0].id,
        name: areaResult[0].name,
        boundary: areaResult[0].geojson,
      },
      statistics: {
        streetCount: streetsResult.length,
        totalLengthKm: (totalLength / 1000).toFixed(2),
        onewayStreets: onewayCount,
        twowayStreets: streetsResult.length - onewayCount,
      },
      streets: {
        type: 'FeatureCollection',
        features,
      },
    });
  } catch (error) {
    console.error('Error fetching streets:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch streets',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
