import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function POST() {
  try {
    // Cancel all running or queued jobs
    const result = await sql`
      UPDATE coverage_routes 
      SET status = 'cancelled', 
          updated_at = NOW(),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{cancelled_at}',
            to_jsonb(NOW()::text)
          )
      WHERE status IN ('queued', 'processing')
      RETURNING id
    `;

    return NextResponse.json({
      success: true,
      cancelledCount: result.length,
      cancelledIds: result.map((r) => r.id),
    });
  } catch (error) {
    console.error('Error cancelling all jobs:', error);
    return NextResponse.json({ error: 'Failed to cancel jobs' }, { status: 500 });
  }
}
