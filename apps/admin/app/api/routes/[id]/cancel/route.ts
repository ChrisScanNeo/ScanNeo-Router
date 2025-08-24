import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    // Update job status to cancelled
    const result = await sql`
      UPDATE coverage_routes 
      SET status = 'cancelled', 
          updated_at = NOW(),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{cancelled_at}',
            to_jsonb(NOW())
          )
      WHERE id = ${id} 
      AND status IN ('queued', 'processing')
      RETURNING id, status
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: 'Job not found or not cancellable' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      id: result[0].id,
      status: result[0].status,
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
