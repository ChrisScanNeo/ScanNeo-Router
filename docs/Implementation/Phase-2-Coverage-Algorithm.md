# Phase 2: Coverage Algorithm & Worker Service

## Overview

Implement the Python worker service that processes coverage jobs, extracts OSM data, builds coverage routes, and generates navigable chunks.

## Prerequisites (from Phase 1)

- [ ] Database schema created with PostGIS
- [ ] Queue system (Upstash) configured
- [ ] ORS API key available
- [ ] Cloud Run project ready for deployment

## Tasks

### 2.1 Worker Service Setup

#### Python Environment

```bash
# apps/worker/requirements.txt
osmnx==1.9.1
networkx==3.2
shapely==2.0.2
psycopg2-binary==2.9.9
python-dotenv==1.0.0
fastapi==0.109.0
uvicorn==0.27.0
redis==5.0.1
tenacity==8.2.3
gpxpy==1.6.2
requests==2.31.0
```

#### Docker Configuration

```dockerfile
# apps/worker/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 2.2 Core Worker Implementation

#### Main Application

```python
# apps/worker/main.py
import os
import json
import asyncio
from fastapi import FastAPI, BackgroundTasks
from redis import Redis
import psycopg2
from psycopg2.extras import RealDictCursor
from coverage_builder import CoverageBuilder
from chunker import RouteChunker
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Initialize connections
redis_client = Redis.from_url(os.environ['UPSTASH_REDIS_REST_URL'])
db_url = os.environ['DATABASE_URL']

@app.on_event("startup")
async def startup_event():
    """Start background job processor"""
    asyncio.create_task(process_jobs())

async def process_jobs():
    """Continuously process jobs from queue"""
    while True:
        try:
            # Pop job from queue
            job_data = redis_client.rpop('build-coverage-queue')
            if job_data:
                job = json.loads(job_data)
                await process_coverage_job(job['body']['areaId'])
            else:
                await asyncio.sleep(5)  # Wait if queue is empty
        except Exception as e:
            logger.error(f"Job processing error: {e}")
            await asyncio.sleep(10)

async def process_coverage_job(area_id: str):
    """Process a single coverage job"""
    logger.info(f"Processing coverage for area {area_id}")

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # 1. Get area geometry
        cur.execute("""
            SELECT id, name, ST_AsGeoJSON(geom) as geojson, params
            FROM areas WHERE id = %s
        """, (area_id,))
        area = cur.fetchone()

        # 2. Extract OSM data and build graph
        builder = CoverageBuilder()
        graph, edges = builder.extract_osm_network(
            json.loads(area['geojson']),
            area['params'].get('includeService', False)
        )

        # 3. Store edges in database
        for edge in edges:
            cur.execute("""
                INSERT INTO edges (area_id, way_id, oneway, tags, geom)
                VALUES (%s, %s, %s, %s, ST_GeomFromGeoJSON(%s))
            """, (
                area_id,
                edge['way_id'],
                edge['oneway'],
                json.dumps(edge['tags']),
                json.dumps(edge['geometry'])
            ))

        # 4. Compute coverage path
        coverage_path = builder.compute_coverage(graph)

        # 5. Get ORS directions for path
        route_geojson = builder.get_ors_directions(
            coverage_path,
            area['params'].get('profile', 'driving-car')
        )

        # 6. Create route record
        cur.execute("""
            INSERT INTO coverage_routes (area_id, profile, length_m, drive_time_s, geom)
            VALUES (%s, %s, %s, %s, ST_GeomFromGeoJSON(%s))
            RETURNING id
        """, (
            area_id,
            area['params'].get('profile', 'driving-car'),
            route_geojson['features'][0]['properties'].get('summary', {}).get('distance'),
            route_geojson['features'][0]['properties'].get('summary', {}).get('duration'),
            json.dumps(route_geojson['features'][0]['geometry'])
        ))
        route_id = cur.fetchone()['id']

        # 7. Chunk the route
        chunker = RouteChunker()
        chunks = chunker.split_route(
            route_geojson,
            target_duration_s=area['params'].get('chunk_duration', 3600)
        )

        # 8. Store chunks
        for idx, chunk in enumerate(chunks):
            cur.execute("""
                INSERT INTO chunks (route_id, idx, length_m, time_s, geom)
                VALUES (%s, %s, %s, %s, ST_GeomFromGeoJSON(%s))
                RETURNING id
            """, (
                route_id,
                idx,
                chunk['length_m'],
                chunk['time_s'],
                json.dumps(chunk['geometry'])
            ))
            chunk_id = cur.fetchone()['id']

            # Store instructions
            for seq, instruction in enumerate(chunk['instructions']):
                cur.execute("""
                    INSERT INTO chunk_instructions (chunk_id, seq, instruction)
                    VALUES (%s, %s, %s)
                """, (chunk_id, seq, json.dumps(instruction)))

        conn.commit()
        logger.info(f"Coverage job completed for area {area_id}")

    except Exception as e:
        conn.rollback()
        logger.error(f"Coverage job failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()

@app.get("/health")
async def health():
    return {"status": "healthy"}
```

### 2.3 Coverage Algorithm Module

```python
# apps/worker/coverage_builder.py
import osmnx as ox
import networkx as nx
from shapely.geometry import shape, LineString
import requests
from tenacity import retry, stop_after_attempt, wait_exponential
import logging

logger = logging.getLogger(__name__)

class CoverageBuilder:
    def __init__(self):
        self.ors_key = os.environ['ORS_API_KEY']
        self.ors_base = 'https://api.openrouteservice.org/v2'

    def extract_osm_network(self, geojson, include_service=False):
        """Extract street network from OSM within polygon"""
        polygon = shape(geojson)

        # Define network type
        network_type = 'drive_service' if include_service else 'drive'

        # Download OSM data
        G = ox.graph_from_polygon(
            polygon,
            network_type=network_type,
            simplify=True,
            retain_all=True
        )

        # Convert to undirected for coverage
        G_undirected = G.to_undirected()

        # Extract edges for database
        edges = []
        for u, v, data in G.edges(data=True):
            edge_geom = LineString([
                (G.nodes[u]['x'], G.nodes[u]['y']),
                (G.nodes[v]['x'], G.nodes[v]['y'])
            ])

            edges.append({
                'way_id': data.get('osmid', 0),
                'oneway': data.get('oneway', False),
                'tags': {
                    'highway': data.get('highway'),
                    'name': data.get('name'),
                    'maxspeed': data.get('maxspeed')
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': list(edge_geom.coords)
                }
            })

        return G_undirected, edges

    def compute_coverage(self, G):
        """Compute coverage path using Chinese Postman approach"""
        # Find odd-degree nodes
        odd_nodes = [v for v in G.nodes() if G.degree(v) % 2 == 1]

        if len(odd_nodes) == 0:
            # Graph is Eulerian
            path = list(nx.eulerian_circuit(G))
        else:
            # Need to augment graph
            # Simple greedy matching for odd nodes
            augmented = G.copy()

            while len(odd_nodes) > 1:
                # Find shortest path between pairs
                min_dist = float('inf')
                min_pair = None

                for i in range(len(odd_nodes)):
                    for j in range(i+1, len(odd_nodes)):
                        try:
                            path = nx.shortest_path(G, odd_nodes[i], odd_nodes[j], weight='length')
                            dist = nx.shortest_path_length(G, odd_nodes[i], odd_nodes[j], weight='length')
                            if dist < min_dist:
                                min_dist = dist
                                min_pair = (odd_nodes[i], odd_nodes[j], path)
                        except nx.NetworkXNoPath:
                            continue

                if min_pair:
                    # Add duplicate edges along shortest path
                    u, v, path = min_pair
                    for k in range(len(path)-1):
                        if not augmented.has_edge(path[k], path[k+1]):
                            augmented.add_edge(path[k], path[k+1])
                    odd_nodes.remove(u)
                    odd_nodes.remove(v)
                else:
                    break

            # Find Eulerian circuit in augmented graph
            if nx.is_eulerian(augmented):
                path = list(nx.eulerian_circuit(augmented))
            else:
                # Fallback to DFS traversal
                path = list(nx.dfs_edges(G))

        # Convert to coordinate list
        coords = []
        for u, v in path:
            coords.append([G.nodes[u]['x'], G.nodes[u]['y']])
        if coords:
            coords.append([G.nodes[path[-1][1]]['x'], G.nodes[path[-1][1]]['y']])

        return coords

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    def get_ors_directions(self, coordinates, profile='driving-car'):
        """Get turn-by-turn directions from ORS"""
        # Batch coordinates if too many (ORS limit ~50-70 waypoints)
        max_waypoints = 50
        batches = []

        for i in range(0, len(coordinates), max_waypoints - 1):
            batch = coordinates[i:i + max_waypoints]
            if i > 0:
                # Overlap with previous batch for continuity
                batch = [coordinates[i-1]] + batch
            batches.append(batch)

        all_features = []

        for batch in batches:
            response = requests.post(
                f"{self.ors_base}/directions/{profile}/geojson",
                headers={'Authorization': self.ors_key},
                json={
                    'coordinates': batch,
                    'instructions': True,
                    'units': 'm'
                }
            )
            response.raise_for_status()
            data = response.json()
            all_features.extend(data['features'])

        # Merge features
        if len(all_features) > 1:
            # Combine geometries and instructions
            merged_coords = []
            merged_instructions = []
            total_distance = 0
            total_duration = 0

            for feature in all_features:
                coords = feature['geometry']['coordinates']
                if merged_coords and coords[0] == merged_coords[-1]:
                    coords = coords[1:]  # Skip duplicate point
                merged_coords.extend(coords)

                if 'segments' in feature['properties']:
                    for segment in feature['properties']['segments']:
                        merged_instructions.extend(segment['steps'])

                summary = feature['properties'].get('summary', {})
                total_distance += summary.get('distance', 0)
                total_duration += summary.get('duration', 0)

            return {
                'type': 'FeatureCollection',
                'features': [{
                    'type': 'Feature',
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': merged_coords
                    },
                    'properties': {
                        'summary': {
                            'distance': total_distance,
                            'duration': total_duration
                        },
                        'segments': [{
                            'steps': merged_instructions
                        }]
                    }
                }]
            }

        return {'type': 'FeatureCollection', 'features': all_features}
```

### 2.4 Route Chunking Module

```python
# apps/worker/chunker.py
from shapely.geometry import LineString, Point
import json

class RouteChunker:
    def split_route(self, route_geojson, target_duration_s=3600):
        """Split route into time-based chunks"""
        feature = route_geojson['features'][0]
        coordinates = feature['geometry']['coordinates']
        instructions = feature['properties']['segments'][0]['steps']

        chunks = []
        current_chunk = {
            'coordinates': [],
            'instructions': [],
            'time_s': 0,
            'length_m': 0
        }

        coord_idx = 0

        for instruction in instructions:
            duration = instruction.get('duration', 0)
            distance = instruction.get('distance', 0)
            way_points = instruction.get('way_points', [])

            # Would this instruction exceed target duration?
            if current_chunk['time_s'] + duration > target_duration_s and current_chunk['instructions']:
                # Save current chunk
                chunk_geom = LineString(current_chunk['coordinates'])
                chunks.append({
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': current_chunk['coordinates']
                    },
                    'instructions': current_chunk['instructions'],
                    'time_s': current_chunk['time_s'],
                    'length_m': current_chunk['length_m']
                })

                # Start new chunk with overlap
                current_chunk = {
                    'coordinates': [current_chunk['coordinates'][-1]] if current_chunk['coordinates'] else [],
                    'instructions': [],
                    'time_s': 0,
                    'length_m': 0
                }

            # Add instruction to current chunk
            current_chunk['instructions'].append(instruction)
            current_chunk['time_s'] += duration
            current_chunk['length_m'] += distance

            # Add coordinates for this instruction
            if len(way_points) >= 2:
                start_idx = way_points[0]
                end_idx = way_points[1]
                segment_coords = coordinates[start_idx:end_idx + 1]

                # Avoid duplicates
                if current_chunk['coordinates'] and segment_coords:
                    if current_chunk['coordinates'][-1] == segment_coords[0]:
                        segment_coords = segment_coords[1:]

                current_chunk['coordinates'].extend(segment_coords)

        # Add final chunk
        if current_chunk['instructions']:
            chunks.append({
                'geometry': {
                    'type': 'LineString',
                    'coordinates': current_chunk['coordinates']
                },
                'instructions': current_chunk['instructions'],
                'time_s': current_chunk['time_s'],
                'length_m': current_chunk['length_m']
            })

        return chunks
```

### 2.5 GPX Export Endpoint

```python
# apps/worker/gpx_export.py
import gpxpy
import gpxpy.gpx
from datetime import datetime

@app.get("/export/gpx/{route_id}")
async def export_gpx(route_id: str):
    """Export route as GPX file"""
    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # Get route and chunks
        cur.execute("""
            SELECT ST_AsGeoJSON(geom) as geojson
            FROM coverage_routes
            WHERE id = %s
        """, (route_id,))
        route = cur.fetchone()

        if not route:
            return {"error": "Route not found"}

        # Create GPX
        gpx = gpxpy.gpx.GPX()
        gpx.name = f"Coverage Route {route_id}"
        gpx.time = datetime.now()

        # Create track
        gpx_track = gpxpy.gpx.GPXTrack()
        gpx.tracks.append(gpx_track)

        # Add segment
        gpx_segment = gpxpy.gpx.GPXTrackSegment()
        gpx_track.segments.append(gpx_segment)

        # Add points
        geojson = json.loads(route['geojson'])
        for coord in geojson['coordinates']:
            point = gpxpy.gpx.GPXTrackPoint(
                latitude=coord[1],
                longitude=coord[0]
            )
            gpx_segment.points.append(point)

        return gpx.to_xml()

    finally:
        cur.close()
        conn.close()
```

## Testing Checkpoints

### Algorithm Tests

- [ ] OSM extraction works for small polygon
- [ ] Coverage path visits all edges
- [ ] Path is continuous (no gaps)
- [ ] Chunking respects time limits

### ORS Integration Tests

- [ ] Batching handles large routes (>50 waypoints)
- [ ] Retry logic handles rate limits
- [ ] Instructions are preserved through batching
- [ ] Geometry merging maintains continuity

### Database Tests

- [ ] Edges stored with correct geometry
- [ ] Routes linked to areas
- [ ] Chunks indexed properly
- [ ] Instructions stored in order

### Export Tests

- [ ] GPX export produces valid file
- [ ] GPX contains all waypoints
- [ ] File can be imported into navigation apps

## Performance Targets

- Small area (< 10 km²): < 30 seconds
- Medium area (10-50 km²): < 2 minutes
- Large area (50-100 km²): < 5 minutes
- Memory usage: < 2GB for large areas

## Deployment

### Cloud Run Deployment

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/PROJECT_ID/coverage-worker
gcloud run deploy coverage-worker \
  --image gcr.io/PROJECT_ID/coverage-worker \
  --platform managed \
  --region europe-west2 \
  --memory 2Gi \
  --timeout 900 \
  --max-instances 10 \
  --set-env-vars DATABASE_URL=$DATABASE_URL,ORS_API_KEY=$ORS_API_KEY
```

## Deliverables

1. **Worker Service**: Python FastAPI application processing coverage jobs
2. **Coverage Algorithm**: OSM extraction and Chinese Postman implementation
3. **ORS Integration**: Batched routing with retry logic
4. **Chunking System**: Time-based route splitting
5. **GPX Export**: Standard format for navigation devices

## Success Criteria

- [ ] Can process a city borough (e.g., Tower Hamlets)
- [ ] Generates complete coverage path
- [ ] Chunks are navigable and time-appropriate
- [ ] GPX export works with standard navigation apps
- [ ] Worker handles failures gracefully

## Next Phase Dependencies

This phase provides:

- Coverage routes for navigation (Phase 3)
- Chunks with instructions for turn-by-turn (Phase 3)
- Job processing status for admin UI (Phase 4)
