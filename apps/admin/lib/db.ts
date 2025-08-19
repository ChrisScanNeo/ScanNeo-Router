import { neon, neonConfig } from '@neondatabase/serverless';

// Configure Neon for serverless/edge runtime
neonConfig.wsProxy = (host) => `https://${host}/v1`;
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineConnect = 'password';

// Initialize database connection
export const sql = neon(process.env.DATABASE_URL!);

// Type-safe query helper
export async function query<T = unknown>(queryText: string, params?: unknown[]): Promise<T[]> {
  try {
    const result = await sql(queryText, params);
    return result as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}
