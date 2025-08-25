import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST(request: NextRequest) {
  try {
    const { routeId, coveredSegments, currentPosition, deviceId } = await request.json();

    if (!routeId) {
      return NextResponse.json({ error: 'Route ID is required' }, { status: 400 });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Store covered segments (if edge tracking is available)
    if (coveredSegments && coveredSegments.length > 0) {
      // Note: This would require the covered_edges table and edge tracking
      // For now, we'll just log progress
      console.log(`Route ${routeId}: ${coveredSegments.length} segments covered`);
    }

    // Store breadcrumb for position tracking
    if (currentPosition) {
      // In a full implementation, we'd store this in a breadcrumbs table
      // For now, we'll just update the route's metadata with progress
      const progressPercentage = coveredSegments
        ? Math.min(100, (coveredSegments.length / 100) * 100)
        : 0;

      await sql`
        UPDATE coverage_routes
        SET 
          progress = ${progressPercentage},
          updated_at = NOW()
        WHERE id = ${routeId}
      `;
    }

    return NextResponse.json({
      success: true,
      routeId: routeId,
      progress: coveredSegments?.length || 0,
      position: currentPosition,
    });
  } catch (error) {
    console.error('Progress update error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update progress',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');

    if (!routeId) {
      return NextResponse.json({ error: 'Route ID is required' }, { status: 400 });
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const sql = neon(databaseUrl);

    // Get current progress
    const result = await sql`
      SELECT 
        id,
        progress,
        status,
        updated_at
      FROM coverage_routes
      WHERE id = ${routeId}
      LIMIT 1
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      routeId: result[0].id,
      progress: result[0].progress || 0,
      status: result[0].status,
      lastUpdate: result[0].updated_at,
    });
  } catch (error) {
    console.error('Progress fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch progress',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
