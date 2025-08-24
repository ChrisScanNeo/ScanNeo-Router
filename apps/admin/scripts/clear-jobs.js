const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function clearJobs() {
  try {
    // Check the structure of coverage_routes table
    const columns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'coverage_routes'
      ORDER BY ordinal_position
    `;

    if (columns.length > 0) {
      console.log('Table coverage_routes columns:', columns);

      // Delete all jobs from coverage_routes table
      const result = await sql`
        DELETE FROM coverage_routes
        RETURNING id
      `;

      console.log(`✅ Deleted ${result.length} jobs`);
      if (result.length > 0) {
        console.log(
          'Deleted job IDs:',
          result.map((r) => r.id.substring(0, 8) + '...')
        );
      }

      // Verify table is empty
      const check = await sql`SELECT COUNT(*) as count FROM coverage_routes`;
      console.log(`📊 Jobs remaining in table: ${check[0].count}`);
    } else {
      console.log('⚠️  Table coverage_routes appears to be missing or has no columns');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearJobs();
