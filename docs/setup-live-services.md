# Live Services Setup Guide

This guide uses real cloud services for both development and production through Vercel's environment UI.

## Required Services (All have free tiers)

### 1. Neon PostgreSQL (Free: 3GB storage)

1. Sign up at https://neon.tech
2. Create a project
3. Enable PostGIS extension in SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
4. Run the schema from `/infra/sql/schema.sql`
5. Copy the connection string (use the pooled connection string)

### 2. Upstash Redis (Free: 10,000 commands/day)

1. Sign up at https://upstash.com
2. Create a Redis database
3. Copy the REST URL and REST Token

### 3. Firebase Authentication (Free: 50K users/month)

1. Create project at https://console.firebase.google.com
2. Enable Authentication > Google sign-in
3. Go to Project Settings > Service Accounts
4. Generate new private key (download JSON)
5. You'll need:
   - Project ID
   - Client Email
   - Private Key

### 4. OpenRouteService (Free: 2,000 requests/day)

1. Sign up at https://openrouteservice.org
2. Generate API key

### 5. Mapbox (Free: 50,000 loads/month)

1. Sign up at https://mapbox.com
2. Create public token

## Vercel Setup

### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

### Step 2: Link Project

```bash
cd apps/admin
vercel link
```

### Step 3: Pull Environment Variables for Development

```bash
# This creates .env.local from Vercel's environment variables
vercel env pull .env.local
```

### Step 4: Add Environment Variables in Vercel Dashboard

Go to your project in Vercel Dashboard > Settings > Environment Variables

Add these variables for all environments (Production, Preview, Development):

#### Database

```
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require&pgbouncer=true
```

#### Firebase Admin

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

⚠️ **Important**: Copy the private key exactly, including `\n` for line breaks

#### External Services

```
ORS_API_KEY=your-ors-api-key
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

#### Public Variables

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your-mapbox-token
```

### Step 5: Pull Variables for Local Development

```bash
# After adding variables in Vercel Dashboard
cd apps/admin
vercel env pull .env.local
```

This creates a local `.env.local` file with all your production variables for development.

## Development Workflow

### 1. Initial Setup (One Time)

```bash
# Install dependencies
pnpm install
cd apps/admin && npm install

# Link to Vercel and pull environment variables
vercel link
vercel env pull .env.local
```

### 2. Daily Development

```bash
# Start the admin dashboard (uses live services)
pnpm dev:admin

# The app will use:
# - Live Neon database
# - Live Upstash Redis
# - Live Firebase auth
# - Real API keys
```

### 3. Deploy Changes

```bash
# Automatic deployment on push to main
git push origin main

# Or manual deployment
vercel --prod
```

## Testing the Setup

### 1. Test Database Connection

```bash
# Start the dev server
pnpm dev:admin

# Check health endpoint
curl http://localhost:3000/api/reroute
# Should return: {"status":"healthy","service":"reroute-api","hasOrsKey":true}
```

### 2. Test Route Calculation

```bash
# You'll need a Firebase auth token for this
# Or temporarily modify the API to skip auth for testing

curl -X POST http://localhost:3000/api/reroute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{
    "coordinates": [
      [-0.1276, 51.5074],
      [-0.1278, 51.5076]
    ]
  }'
```

## Benefits of This Approach

1. **No local services to manage** - No Docker, no local databases
2. **Same environment everywhere** - Dev and production use same services
3. **Real-world testing** - Development uses actual cloud services
4. **Simple deployment** - Push to deploy, no config differences
5. **Free tier sufficient** - All services have generous free tiers for development

## Updating Environment Variables

### To Add or Change Variables:

1. Go to Vercel Dashboard > Settings > Environment Variables
2. Add/update the variable
3. Pull latest to local:
   ```bash
   vercel env pull .env.local
   ```
4. Restart your dev server

## Security Notes

- `.env.local` is gitignored - never commit it
- All secrets stay in Vercel's environment UI
- Use Vercel's environment-specific variables if needed (Dev vs Prod)

## Quick Commands

```bash
# Pull latest environment variables
vercel env pull .env.local

# Start development (uses live services)
pnpm dev:admin

# Deploy to production
vercel --prod

# Check deployment status
vercel ls

# View logs
vercel logs
```

## Troubleshooting

### Environment variables not working?

```bash
# Re-pull from Vercel
vercel env pull .env.local

# Restart dev server
pnpm dev:admin
```

### Database connection issues?

- Check if PostGIS is enabled
- Verify connection string has `?sslmode=require`
- Use pooled connection string from Neon

### Firebase auth issues?

- Ensure private key has proper `\n` line breaks
- Verify service account email is correct
- Check project ID matches

## Cost Monitoring

With free tiers, you have:

- **Neon**: 3GB storage, ~100K queries/month
- **Upstash**: 10,000 Redis commands/day
- **Firebase**: 50K auth verifications/month
- **OpenRouteService**: 2,000 routing requests/day
- **Mapbox**: 50,000 map loads/month
- **Vercel**: 100GB bandwidth, unlimited deployments

This is more than sufficient for solo development and early usage.
