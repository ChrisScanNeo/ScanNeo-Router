const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function updateTable() {
  try {
    console.log('📋 Updating coverage_routes table structure...');

    // Add missing columns
    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS area_name TEXT`;
      console.log('✅ area_name column added/verified');
    } catch (e) {
      console.log('ℹ️  area_name:', e.message);
    }

    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued'`;
      console.log('✅ status column added/verified');
    } catch (e) {
      console.log('ℹ️  status:', e.message);
    }

    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0`;
      console.log('✅ progress column added/verified');
    } catch (e) {
      console.log('ℹ️  progress:', e.message);
    }

    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`;
      console.log('✅ metadata column added/verified');
    } catch (e) {
      console.log('ℹ️  metadata:', e.message);
    }

    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS result JSONB`;
      console.log('✅ result column added/verified');
    } catch (e) {
      console.log('ℹ️  result:', e.message);
    }

    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS error TEXT`;
      console.log('✅ error column added/verified');
    } catch (e) {
      console.log('ℹ️  error:', e.message);
    }

    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS duration_s NUMERIC`;
      console.log('✅ duration_s column added/verified');
    } catch (e) {
      console.log('ℹ️  duration_s:', e.message);
    }

    try {
      await sql`ALTER TABLE coverage_routes ADD COLUMN IF NOT EXISTS chunk_count INTEGER`;
      console.log('✅ chunk_count column added/verified');
    } catch (e) {
      console.log('ℹ️  chunk_count:', e.message);
    }

    // Update area_name for existing records
    await sql`
      UPDATE coverage_routes cr
      SET area_name = COALESCE(a.name, 'Unknown Area')
      FROM areas a
      WHERE cr.area_id = a.id
      AND cr.area_name IS NULL
    `;

    console.log('✅ Table structure updated successfully');

    // Show current structure
    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'coverage_routes'
      ORDER BY ordinal_position
    `;

    console.log('\n📊 Current table structure:');
    columns.forEach((col) => {
      console.log(
        `  - ${col.column_name}: ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}${col.column_default ? ` DEFAULT ${col.column_default}` : ''}`
      );
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateTable();
