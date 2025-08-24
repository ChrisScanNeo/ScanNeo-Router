const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function clearStuckJobs() {
  try {
    // First, let's see what jobs are in the database
    const jobs = await sql`
      SELECT id, area_name, status, created_at, updated_at 
      FROM coverage_routes 
      ORDER BY created_at DESC
    `;

    console.log(`📋 Found ${jobs.length} job(s) in database:`);
    jobs.forEach((job) => {
      const created = new Date(job.created_at).toLocaleTimeString();
      console.log(
        `  - ${job.id.substring(0, 8)}... | ${job.area_name} | Status: ${job.status} | Created: ${created}`
      );
    });

    // Mark any "processing" or "queued" jobs as cancelled (since worker was redeployed)
    const stuckJobs = await sql`
      UPDATE coverage_routes 
      SET status = 'cancelled',
          updated_at = NOW(),
          error = 'Job cancelled due to worker restart'
      WHERE status IN ('processing', 'queued')
      RETURNING id, area_name
    `;

    if (stuckJobs.length > 0) {
      console.log(`\n✅ Cancelled ${stuckJobs.length} stuck job(s):`);
      stuckJobs.forEach((job) => {
        console.log(`  - ${job.id.substring(0, 8)}... | ${job.area_name}`);
      });
    }

    // Option to delete all cancelled jobs
    const deleteCancelled = process.argv[2] === '--delete-cancelled';

    if (deleteCancelled) {
      const deleted = await sql`
        DELETE FROM coverage_routes 
        WHERE status = 'cancelled'
        RETURNING id
      `;
      console.log(`\n🗑️  Deleted ${deleted.length} cancelled job(s)`);
    }

    // Show final state
    const remaining = await sql`
      SELECT status, COUNT(*) as count 
      FROM coverage_routes 
      GROUP BY status
    `;

    console.log('\n📊 Final job counts by status:');
    remaining.forEach((r) => {
      console.log(`  - ${r.status}: ${r.count}`);
    });

    if (remaining.length === 0) {
      console.log('  - No jobs in database');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearStuckJobs();
