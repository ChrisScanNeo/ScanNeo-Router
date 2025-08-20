import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';

// GeoJSON validation schemas
const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
});

const MultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(z.array(z.tuple([z.number(), z.number()])))),
});

const FeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.union([PolygonSchema, MultiPolygonSchema]),
  properties: z.record(z.string(), z.unknown()).optional(),
});

const FeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(FeatureSchema),
});

// Request validation schema
const ImportAreaSchema = z.object({
  name: z.string().min(1, 'Area name is required'),
  geojson: z.union([PolygonSchema, MultiPolygonSchema, FeatureSchema, FeatureCollectionSchema]),
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

    // Extract the actual geometry from Feature or FeatureCollection
    type GeoJSONGeometry = {
      type: string;
      coordinates: number[] | number[][] | number[][][] | number[][][][];
    };

    let geometryToStore: GeoJSONGeometry = validatedData.geojson as GeoJSONGeometry;

    if (validatedData.geojson.type === 'Feature') {
      geometryToStore = validatedData.geojson.geometry as GeoJSONGeometry;
    } else if (validatedData.geojson.type === 'FeatureCollection') {
      // For FeatureCollection, we'll combine all features into a single MultiPolygon
      const geometries = validatedData.geojson.features.map((f) => f.geometry);

      // If all geometries are Polygons, create a MultiPolygon
      // If there are already MultiPolygons, we need to merge them
      const polygons: number[][][][] = [];

      for (const geom of geometries) {
        if (geom.type === 'Polygon') {
          polygons.push(geom.coordinates as number[][][]);
        } else if (geom.type === 'MultiPolygon') {
          polygons.push(...(geom.coordinates as number[][][][]));
        }
      }

      geometryToStore = {
        type: 'MultiPolygon',
        coordinates: polygons,
      };
    }

    // Insert area into database with PostGIS geometry
    const result = await sql`
      INSERT INTO areas (name, geom, buffer_m, params)
      VALUES (
        ${validatedData.name},
        ST_GeomFromGeoJSON(${JSON.stringify(geometryToStore)}),
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
      console.error('Validation issues:', error.issues);
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    // Log database errors with more detail
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      // Check for specific PostGIS errors
      if (error.message.includes('ST_GeomFromGeoJSON')) {
        return NextResponse.json(
          { error: 'Invalid GeoJSON geometry format', details: error.message },
          { status: 400 }
        );
      }

      if (error.message.includes('parse')) {
        return NextResponse.json(
          { error: 'Failed to parse GeoJSON', details: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to import area',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
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
