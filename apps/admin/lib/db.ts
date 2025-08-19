import { neon, neonConfig } from '@neondatabase/serverless';

// Configure Neon for serverless/edge runtime
neonConfig.wsProxy = (host) => `https://${host}/v1`;
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineConnect = 'password';

// Initialize database connection
export const sql = neon(process.env.DATABASE_URL!);

// Export the sql function directly for use in API routes
// The Neon sql function uses template literals, not regular strings
