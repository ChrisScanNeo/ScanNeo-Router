import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    // Only allow deletion of failed, completed, or cancelled jobs
    const result = await sql`
      DELETE FROM coverage_routes 
      WHERE id = ${id} 
      AND status IN ('failed', 'completed', 'completed_with_warnings', 'cancelled')
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Job not found or cannot be deleted (may be running)' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      id: result[0].id,
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
}
