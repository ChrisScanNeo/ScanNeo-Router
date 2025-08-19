Absolutely. Here’s a full, end-to-end implementation plan that fits your stack (Neon + Vercel + Cloud Run worker + ORS) and adds rerouting + ad-hoc stops, plus test blocks at every stage.

0. Monorepo layout
   /city-coverage/
   /apps
   /admin # Next.js (Vercel) – admin UI + APIs
   /navigator # React Native (Expo) – in-car turn-by-turn
   /services
   /worker # Python (Cloud Run) – OSM extract, coverage, ORS batching
   /infra # SQL, IaC, scripts

1. Accounts & keys you’ll need

Neon (Postgres + PostGIS enabled)

OpenRouteService (ORS) API key (start with cloud)

Upstash (Redis + REST/Queues)

Google Cloud / Firebase project (Google sign-in enabled)

Mapbox (for maps in RN & admin UI)

Notes & refs: RN Google sign-in (Expo guide) and Firebase’s signInWithCredential for RN, Mapbox RN docs, Neon serverless driver + PostGIS, ORS directions API, Upstash REST/Queues.
Expo Documentation
rnfirebase.io
rnmapbox.github.io
Neon
+1
openrouteservice.org
Upstash: Serverless Data Platform

2. Environment variables (by app)
   2.1 Admin (Next.js on Vercel)

Vercel → Settings → Environment Variables

# Database

DATABASE_URL=postgresql://<user>:<pass>@<host>/<db>?sslmode=require
NEON_WEB_URL=wss://<your-neon>.neon.tech

# Auth (Firebase Admin service account)

FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ORS (server-side only, never in RN app)

ORS_API_KEY=...

# Upstash

UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

# Mapbox

NEXT_PUBLIC_MAPBOX_TOKEN=...

# (optional) Sentry/Logging

SENTRY_DSN=...

2.2 Worker (Cloud Run – service env)
DATABASE_URL=postgresql://... (same)
ORS_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...

2.3 Navigator (React Native / Expo)

RN bundles public vars. Keep secrets server-side. The RN app should call your Next.js proxy for ORS reroutes—don’t ship the ORS key in the app.

app.config.ts / app.json → extra or EXPO*PUBLIC*\*:

EXPO_PUBLIC_API_BASE_URL=https://<your-vercel-domain>
EXPO_PUBLIC_MAPBOX_TOKEN=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...

Test block

Save envs. In admin: vercel env pull .env.local. In RN: npx expo start and confirm process.env.EXPO_PUBLIC_API_BASE_URL is defined.

3. Database & schema (Neon + PostGIS)

Run this once in Neon:

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

-- Coverage tracking (edges driven)
CREATE TABLE covered_edges(
route_id UUID REFERENCES coverage_routes(id) ON DELETE CASCADE,
edge_id BIGINT REFERENCES edges(id) ON DELETE CASCADE,
device_id TEXT,
covered_at TIMESTAMPTZ DEFAULT now(),
PRIMARY KEY(route_id, edge_id, device_id)
);

Neon supports PostGIS; you can enable it via CREATE EXTENSION postgis.
Neon
PostGIS

Test blocks

Connect from psql and run SELECT PostGIS_Version(); → expect a version string.

4. Admin app (Next.js) – DB + Auth + APIs
   4.1 DB client (Neon serverless driver)

apps/admin/lib/db.ts

import { neon, neonConfig } from '@neondatabase/serverless';
neonConfig.wsProxy = (host) => `https://${host}/v1`;
neonConfig.useSecureWebSocket = true;
export const sql = neon(process.env.DATABASE_URL!);

Serverless driver is ideal for Vercel/Edge.
Neon
GitHub

4.2 Firebase Admin (verify ID tokens on server)

apps/admin/lib/firebaseAdmin.ts

import \* as admin from 'firebase-admin';

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

Use verifyBearer() inside API routes that need auth.

Test block

Call a protected API with no token → 401.

Call with a valid Firebase ID token → 200.

4.3 Import area API (stores polygon, enqueues job)

apps/admin/app/api/import-area/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { buildQueue } from '@/lib/queue';
import { verifyBearer } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
const user = await verifyBearer(req.headers.get('authorization') || undefined);
if (!user) return new NextResponse('Unauthorized', { status: 401 });

const { name, geojson, buffer_m = 0, profile = 'driving-car', includeService = false } = await req.json();

const inserted = await sql/_ sql _/`     WITH geom_in AS (
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

4.4 Reroute proxy API (for RN app)

apps/admin/app/api/reroute/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyBearer } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
const user = await verifyBearer(req.headers.get('authorization') || undefined);
if (!user) return new NextResponse('Unauthorized', { status: 401 });

const { coordinates, profile = 'driving-car' } = await req.json(); // [[lon,lat],...]
const r = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
method: 'POST',
headers: {
'Authorization': process.env.ORS_API_KEY!,
'Content-Type': 'application/json'
},
body: JSON.stringify({ coordinates, instructions: true })
});
const json = await r.json();
return NextResponse.json(json);
}

ORS Directions POST /v2/directions/{profile} with geojson works well for merging segments and instructions.
openrouteservice.org
openrouteservice

Test block

curl the reroute API with two coordinates + valid ID token; confirm you get GeoJSON route.

4.5 Queue helper (Upstash)

apps/admin/lib/queue.ts

import { Redis } from '@upstash/redis';
export const redis = new Redis({
url: process.env.UPSTASH_REDIS_REST_URL!,
token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
export const buildQueue = {
async send(msg: any) {
// Simple FIFO push
await redis.lpush('build-coverage-queue', JSON.stringify(msg));
}
};

Test block

await buildQueue.send({name:'build-coverage', body:{areaId:'test'}}) → LRANGE shows the enqueued message.

(If you prefer Upstash QStash/Queues endpoints, you can use their REST queue APIs similarly.)
Upstash: Serverless Data Platform
+2
Upstash: Serverless Data Platform
+2

5. Worker (Cloud Run, Python)

Pulls from Upstash list, processes jobs.

Uses osmnx/networkx to build the drive graph in the polygon, computes a coverage path (greedy + optional Eulerization), calls ORS in batches for instructions, chunks by time, persists.

You already have a solid skeleton from earlier. Two improvements now:

Persist real chunk geometry: concatenate ORS batch Feature coordinates for each chunk to a LineString and store.

Edge coverage marking: expose an endpoint that accepts GPS traces from the RN app; map-match (server side via ORS map-matching) and update covered_edges.

Test block

Run a small polygon (e.g., a few streets), build route, verify chunks exist and GPX export returns a non-empty file.

6. Navigator app (React Native / Expo)
   6.1 Setup
   npx create-expo-app navigator
   cd navigator
   npx expo install @rnmapbox/maps expo-location expo-keep-awake expo-speech
   npm i firebase @react-native-google-signin/google-signin

Configure Mapbox token:

// App.tsx or a bootstrap file
import Mapbox from '@rnmapbox/maps';
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

Docs: @rnmapbox/maps.
rnmapbox.github.io
GitHub

6.2 Google sign-in (native) + Firebase Auth (RN)

Use @react-native-google-signin/google-signin to get the Google ID token, then Firebase Auth signInWithCredential() to issue a Firebase ID token you can send to your server.
Expo Documentation
rnfirebase.io

// services/auth.ts
import auth from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
webClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID, // and iOS if needed
});

export async function signInWithGoogle() {
await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
const { idToken } = await GoogleSignin.signIn();
const credential = auth.GoogleAuthProvider.credential(idToken);
const userCred = await auth().signInWithCredential(credential);
const idTokenFirebase = await userCred.user.getIdToken(); // send as Bearer to your APIs
return { user: userCred.user, idTokenFirebase };
}

Test block

Log in on a device/simulator; hit a protected admin API with Authorization: Bearer <idTokenFirebase> → expect 200.

6.3 Load chunk & navigate
// screens/Navigate.tsx
import Mapbox from '@rnmapbox/maps';
import _ as Location from 'expo-location';
import _ as Speech from 'expo-speech';
import { useEffect, useState, useRef } from 'react';
import { View, Button } from 'react-native';

export default function Navigate({ routeId }: { routeId: string }) {
const [pos, setPos] = useState<[number,number] | null>(null);
const [chunkIdx, setChunkIdx] = useState(0);
const [line, setLine] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
const [steps, setSteps] = useState<any[]>([]);
const tokenRef = useRef<string>("");

async function loadChunk(idx: number) {
const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/routes/${routeId}/chunks/${idx}`, {
headers: { Authorization: `Bearer ${tokenRef.current}` }
});
const json = await res.json(); // { geom, instructions }
setLine(json.geom);
setSteps(json.instructions);
}

useEffect(() => {
(async () => {
await Location.requestForegroundPermissionsAsync();
Location.watchPositionAsync({
accuracy: Location.Accuracy.Highest,
timeInterval: 1000,
distanceInterval: 3,
}, (loc) => setPos([loc.coords.longitude, loc.coords.latitude]));
await loadChunk(0);
})();
}, []);

return (
<View style={{flex:1}}>
<Mapbox.MapView style={{flex:1}}>
{pos && <Mapbox.Camera centerCoordinate={pos} zoomLevel={16} followUserLocation />}
<Mapbox.UserLocation visible />
{line && (
<Mapbox.ShapeSource id="route" shape={line}>
<Mapbox.LineLayer id="route-line" style={{ lineWidth: 6 }} />
</Mapbox.ShapeSource>
)}
</Mapbox.MapView>
<View style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
<Button title="Next chunk" onPress={()=>{ setChunkIdx(c => {const n=c+1; loadChunk(n); return n;}); }} />
</View>
</View>
);
}

Test block

Hardcode a known routeId, load the app, confirm the polyline renders and steps are present.

6.4 Off-route detection & rerouting

Define off-route as: GPS is > 40–60 m from the current chunk line for > 8–10 s. When off-route:

Find rejoin target: nearest upcoming vertex/step on the chunk line (or the chunk end).

POST to your /api/reroute with [current, rejoin] coordinates.

Replace current in-progress polyline with the temporary detour polyline + instructions.

When you reach the rejoin target (within 15–20 m), switch back to the main chunk steps.

import distanceToLine from '@turf/point-to-line-distance'; // or a small custom util

async function maybeReroute(current: [number,number]) {
if (!line) return;
const distM = distanceToLine({type:'Point',coordinates:current}, line);
if (distM < 50) return; // on route
// find nearest upcoming point on line
const coords = line.geometry.coordinates;
const target = coords[Math.min(coords.length-1, Math.floor(coords.length*0.8))]; // simple heuristic
const res = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/reroute`, {
method: 'POST',
headers: { 'Content-Type':'application/json', Authorization: `Bearer ${tokenRef.current}` },
body: JSON.stringify({ coordinates: [current, target] })
});
const reroute = await res.json(); // ORS GeoJSON FeatureCollection
// swap the guidance temporarily
// ... render reroute.features[0].geometry as overlay and read its instructions
}

ORS Directions POST accepts your coordinate array and returns GeoJSON route & instructions.
openrouteservice.org

Test block

Simulate off-route by tapping a “Teleport” test button that sets a fake GPS 150 m away → observe a reroute overlay & spoken instruction.

6.5 Add a stop (ad-hoc)

UI flow: “Add Stop” → user selects map point → call /api/reroute with [current, stop, rejoin]. Drive to stop → app resumes original chunk.

Test block

Add a stop, confirm the route diverts and rejoins.

6.6 Coverage tracking (optional in MVP)

Every 10–15 seconds, upload a thin GPS breadcrumb; the server map-matches (ORS map-matching) and updates covered_edges. Later you can create a “mop-up chunk” from remaining edges.

Test block

After a short drive (or simulation), query covered_edges count increases.

7. Admin UI essentials

Upload/import GeoJSON (borough polygon), preview on map.

Configure: buffer, include/exclude service, target chunk duration.

Start build → show job progress (Redis hash: extraction → graph → coverage → routing → chunking).

List chunks with stats; download GPX per chunk.

(Later) Coverage dashboard: % edges covered, missed edges, button to “Generate mop-up chunk”.

Test block

Import Tower Hamlets polygon, click Build, see progress, and download one GPX.

8. Worker details & batching rules

Directions batching: keep ≤ ~50 waypoints per request; overlap last waypoint of batch N as first of batch N+1 to stitch. (Public ORS backends impose waypoint limits; batching avoids errors.)
openrouteservice.org

Matrix (optional for better ETA chunking): batch to stay within request size limits.

Retries: exponential backoff on 429/5xx (tenacity).

Test block

Run a “dense” downtown polygon and verify your batching doesn’t hit HTTP 413/400.

9. Auth flows recap

RN app → Admin APIs: send Firebase ID token in Authorization: Bearer .... Server verifies via Firebase Admin.

RN app → ORS: never directly. Always via your proxy (/api/reroute), so the ORS key stays server-side.

Admin web can also sign in with Firebase JS SDK and use the same token to call APIs.

Test block

Expire token → ensure API returns 401. Refresh token → API accepts.

10. Testing strategy (unit → integration → E2E)

Unit

Path splitting/batching (Directions batches size & overlap).

Off-route detector (polyline distance calculation).

Chunker (accumulate duration, split near target).

Integration

/api/reroute with mocked ORS responses.

Worker run on a tiny polygon fixture → verifies DB writes: edges, route, chunks, instructions.

E2E

Device sim: feed a recorded GPX trace (simulation mode in app) and ensure:

Guidance speaks maneuvers.

Off-route triggers reroute and rejoins.

Coverage endpoints record edges.

Test block

Add SIMULATION=true flag in app to read coordinates from a local JSON/GPX and drive the UI without GPS.

11. Deployment checklist

Admin: vercel --prod (set envs first). Ensure Node runtime for API routes that use Firebase Admin (not Edge).

Worker: gcloud run deploy coverage-worker --region=europe-west2 --source . --set-env-vars ...

Navigator: eas build -p android (and iOS if needed). Add Android SHA1 to Firebase; configure iOS URL schemes.

12. Observability & safety

Structured logs: add request_id, area_id, route_id, chunk_idx.

Rate limiting: proxy /api/reroute with per-device limits (Upstash counters).

Error telemetry: Sentry in admin & worker.

Backups: nightly dump of areas/edges/routes/chunks.

What you’ll have when done

Admin can import a borough geofence → system builds a legal, edge-coverage tour → chunks it → exports GPX.

RN app signs in with your existing Google auth (Firebase), plays turn-by-turn, reroutes off-course, and supports ad-hoc stops.

Server tracks coverage progress and can generate mop-up routes later.

If you want, I can package the starter files (admin API routes, worker scaffold, and RN screen) into a repo structure next so you can drop in your keys and run.
