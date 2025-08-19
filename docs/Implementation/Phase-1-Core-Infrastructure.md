# Phase 1: Core Infrastructure

## Overview

Establish the foundation for the ScanNeo-Router system including database setup, authentication, basic APIs, and initial application scaffolding.

## Prerequisites

- [ ] Neon account with PostgreSQL + PostGIS enabled
- [ ] OpenRouteService API key
- [ ] Upstash account (Redis + REST/Queues)
- [ ] Google Cloud/Firebase project with authentication enabled
- [ ] Mapbox account for mapping
- [ ] Vercel account for deployment

## Tasks

### 1.1 Database Setup (Neon + PostGIS)

#### Schema Creation

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE areas(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  geom GEOMETRY(POLYGON, 4326) NOT NULL,
  buffer_m INTEGER NOT NULL DEFAULT 0,
  params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE edges(
  id BIGSERIAL PRIMARY KEY,
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  way_id BIGINT,
  oneway BOOLEAN DEFAULT FALSE,
  tags JSONB,
  geom GEOMETRY(LINESTRING, 4326) NOT NULL
);
CREATE INDEX ON edges USING GIST (geom);

CREATE TABLE coverage_routes(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
  profile TEXT NOT NULL,
  length_m INTEGER,
  drive_time_s INTEGER,
  params JSONB NOT NULL DEFAULT '{}',
  geom GEOMETRY(LINESTRING, 4326),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chunks(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID REFERENCES coverage_routes(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  length_m INTEGER,
  time_s INTEGER,
  geom GEOMETRY(LINESTRING, 4326) NOT NULL
);
CREATE INDEX ON chunks(route_id, idx);
CREATE INDEX ON chunks USING GIST (geom);

CREATE TABLE chunk_instructions(
  id BIGSERIAL PRIMARY KEY,
  chunk_id UUID REFERENCES chunks(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  instruction JSONB NOT NULL
);

CREATE TABLE covered_edges(
  route_id UUID REFERENCES coverage_routes(id) ON DELETE CASCADE,
  edge_id BIGINT REFERENCES edges(id) ON DELETE CASCADE,
  device_id TEXT,
  covered_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(route_id, edge_id, device_id)
);
```

#### Test Verification

```bash
# Connect and verify PostGIS
psql $DATABASE_URL -c "SELECT PostGIS_Version();"
```

### 1.2 Application Structure

#### Create Base Applications

```bash
# Admin Dashboard (Next.js)
npx create-next-app@latest apps/admin --typescript --tailwind --app --eslint

# Navigator Mobile App (React Native)
npx create-expo-app apps/navigator --template expo-template-blank-typescript

# Worker Service (Python)
mkdir -p apps/worker
```

#### Create Shared Packages

```bash
# Shared utilities
mkdir -p packages/shared/src/{types,utils,hooks}

# UI components
mkdir -p packages/ui/src/components

# Configuration
mkdir -p packages/config
```

### 1.3 Authentication Setup (Firebase)

#### Admin App Authentication

```typescript
// apps/admin/lib/firebaseAdmin.ts
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
}

export async function verifyBearer(authorization?: string) {
  if (!authorization?.startsWith('Bearer ')) return null;
  const idToken = authorization.slice(7);
  try {
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    return null;
  }
}
```

#### Environment Variables Setup

```bash
# Admin (Next.js on Vercel)
DATABASE_URL=postgresql://<user>:<pass>@<host>/<db>?sslmode=require
NEON_WEB_URL=wss://<your-neon>.neon.tech
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ORS_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
NEXT_PUBLIC_MAPBOX_TOKEN=...

# Worker (Cloud Run)
DATABASE_URL=postgresql://...
ORS_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Navigator (React Native)
EXPO_PUBLIC_API_BASE_URL=https://<your-vercel-domain>
EXPO_PUBLIC_MAPBOX_TOKEN=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
```

### 1.4 Core API Endpoints

#### Database Connection

```typescript
// apps/admin/lib/db.ts
import { neon, neonConfig } from '@neondatabase/serverless';
neonConfig.wsProxy = (host) => `https://${host}/v1`;
neonConfig.useSecureWebSocket = true;
export const sql = neon(process.env.DATABASE_URL!);
```

#### Import Area API

```typescript
// apps/admin/app/api/import-area/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { buildQueue } from '@/lib/queue';
import { verifyBearer } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  const user = await verifyBearer(req.headers.get('authorization') || undefined);
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const {
    name,
    geojson,
    buffer_m = 0,
    profile = 'driving-car',
    includeService = false,
  } = await req.json();

  const inserted = await sql`
    WITH geom_in AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326) AS g
    ), geom_buf AS (
      SELECT CASE
        WHEN ${buffer_m} > 0 THEN ST_Buffer(g::geography, ${buffer_m})::geometry
        ELSE g
      END AS geom
      FROM geom_in
    )
    INSERT INTO areas (name, geom, buffer_m, params)
    SELECT ${name}, geom, ${buffer_m}, ${JSON.stringify({ profile, includeService })}
    FROM geom_buf
    RETURNING id;
  `;

  const areaId = inserted[0].id;
  await buildQueue.send({ name: 'build-coverage', body: { areaId } });

  return NextResponse.json({ areaId, queued: true });
}
```

#### Reroute Proxy API

```typescript
// apps/admin/app/api/reroute/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyBearer } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await verifyBearer(req.headers.get('authorization') || undefined);
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { coordinates, profile = 'driving-car' } = await req.json();
  const r = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: process.env.ORS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coordinates, instructions: true }),
  });
  const json = await r.json();
  return NextResponse.json(json);
}
```

### 1.5 Queue System (Upstash)

```typescript
// apps/admin/lib/queue.ts
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const buildQueue = {
  async send(msg: any) {
    await redis.lpush('build-coverage-queue', JSON.stringify(msg));
  },
};
```

## Testing Checkpoints

### Database Tests

- [ ] PostGIS extension installed and working
- [ ] All tables created successfully
- [ ] Spatial indexes created
- [ ] Test insert/select with geometry data

### Authentication Tests

- [ ] Firebase Admin SDK configured
- [ ] Bearer token verification working
- [ ] Protected endpoints return 401 without token
- [ ] Protected endpoints return 200 with valid token

### API Tests

- [ ] Import area endpoint accepts GeoJSON
- [ ] Reroute proxy forwards to ORS correctly
- [ ] Queue system enqueues messages
- [ ] Database connections from API routes work

### Environment Tests

- [ ] All environment variables set in Vercel
- [ ] Local development with `.env.local` working
- [ ] Worker can connect to database
- [ ] React Native app can reach API endpoints

## Deliverables

1. **Database**: Fully configured Neon PostgreSQL with PostGIS and schema
2. **Authentication**: Working Firebase authentication system
3. **APIs**: Core endpoints for area import and rerouting
4. **Queue**: Upstash Redis queue for job processing
5. **Structure**: Monorepo with apps and packages directories

## Success Criteria

- [ ] Can import a GeoJSON polygon via API
- [ ] Authentication protects all endpoints
- [ ] Queue receives and stores jobs
- [ ] Database stores spatial data correctly
- [ ] All tests pass

## Next Phase Dependencies

This phase provides:

- Database schema for coverage algorithm (Phase 2)
- Authentication for navigation app (Phase 3)
- API structure for admin interface (Phase 4)
- Queue system for worker processing (Phase 2)
