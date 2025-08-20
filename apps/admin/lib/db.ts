import { neon, neonConfig } from '@neondatabase/serverless';

// Configure Neon for Vercel Edge runtime
neonConfig.wsProxy = (host) => `https://${host}/v1`;
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineTLS = false;

// Create database connection
const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return url;
};

// Export SQL query function
export const sql = neon(getDatabaseUrl());

// Helper to check database connectivity
export async function checkDatabaseConnection() {
  try {
    const result = await sql`SELECT version()`;
    return { connected: true, version: result[0].version };
  } catch (error) {
    console.error('Database connection error:', error);
    return { connected: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Helper to check if PostGIS is enabled
export async function checkPostGIS() {
  try {
    const result = await sql`
      SELECT PostGIS_version() as version
    `;
    return { enabled: true, version: result[0].version };
  } catch (error) {
    console.error('PostGIS check error:', error);
    return { enabled: false, error: 'PostGIS extension not enabled' };
  }
}
