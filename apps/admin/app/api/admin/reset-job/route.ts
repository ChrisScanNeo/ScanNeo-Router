import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const body = await request.json();
    const { jobId, action = 'reset' } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    if (action === 'reset') {
      // Reset stuck job to pending
      const [updated] = await sql`
        UPDATE coverage_routes
        SET 
          params = jsonb_set(
            jsonb_set(params, '{status}', '"pending"'),
            '{progress}', 
            '0'
          ),
          updated_at = NOW()
        WHERE id = ${jobId}
        AND params->>'status' = 'processing'
        RETURNING id, params->>'status' as status
      `;

      if (updated) {
        return NextResponse.json({
          success: true,
          message: 'Job reset to pending',
          jobId: updated.id,
          newStatus: 'pending',
        });
      } else {
        return NextResponse.json(
          {
            error: 'Job not found or not in processing state',
          },
          { status: 404 }
        );
      }
    } else if (action === 'fail') {
      // Mark job as failed
      const [updated] = await sql`
        UPDATE coverage_routes
        SET 
          params = params || jsonb_build_object(
            'status', 'failed',
            'error', 'Job stuck in processing - manually failed',
            'failedAt', NOW()
          ),
          updated_at = NOW()
        WHERE id = ${jobId}
        RETURNING id, params->>'status' as status
      `;

      if (updated) {
        return NextResponse.json({
          success: true,
          message: 'Job marked as failed',
          jobId: updated.id,
          newStatus: 'failed',
        });
      } else {
        return NextResponse.json(
          {
            error: 'Job not found',
          },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error resetting job:', error);
    return NextResponse.json(
      {
        error: 'Failed to reset job',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
