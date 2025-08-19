# ScanNeo Router Admin Dashboard

Next.js admin dashboard for the ScanNeo Router system.

## Deployment

This app is deployed to Vercel as a separate project:

- Project: `scanneo-router-admin`
- Root Directory: `apps/admin`
- URL: https://scanneo-router-admin.vercel.app

## Local Development

```bash
# From repository root
pnpm dev:admin

# Or from this directory
pnpm dev
```

## API Endpoints

- `/api/import-area` - Import GeoJSON areas for coverage
- `/api/reroute` - Calculate routes using OpenRouteService

## Environment Variables

Required environment variables (set in Vercel Dashboard):

- `DATABASE_URL` - Neon PostgreSQL connection
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key
- `ORS_API_KEY` - OpenRouteService API key
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- `NEXT_PUBLIC_MAPBOX_TOKEN` - Mapbox public token
