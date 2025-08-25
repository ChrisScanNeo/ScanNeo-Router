const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function checkSchema() {
  try {
    // Try to select from coverage_routes to see what columns exist
    const result = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'coverage_routes'
      ORDER BY ordinal_position
    `;
    
    console.log('Coverage routes columns:');
    result.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSchema();