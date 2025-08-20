# ScanNeo Worker Service

Python worker service for processing coverage route generation jobs.

## Features

- 🔄 Automatic job polling from PostgreSQL database
- 🗺️ OpenStreetMap data fetching via Overpass API
- 🚗 Chinese Postman algorithm for optimal route coverage
- 📊 Route chunking based on time duration
- 🐳 Docker containerization for Cloud Run deployment
- 🔍 Health check and monitoring endpoints

## Architecture

```
PostgreSQL (Neon) → Worker → OpenStreetMap API
                      ↓
                  Calculate Route
                      ↓
                  Save Results → Database
```

## Local Development

### Prerequisites

- Python 3.11+
- PostgreSQL database with PostGIS
- Docker (optional)

### Setup

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Copy environment variables:

```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Run the worker:

```bash
python main.py
```

Or using Docker:

```bash
docker-compose up
```

## API Endpoints

- `GET /` - Root health check
- `GET /health` - Detailed health status
- `GET /status` - Worker status and stats
- `POST /process/manual` - Manually trigger job (dev only)

## Job Processing Flow

1. **Poll**: Check for pending jobs every 30 seconds
2. **Claim**: Update job status to "processing"
3. **Fetch Area**: Get area geometry from database
4. **Get Streets**: Query OpenStreetMap for road network
5. **Calculate**: Run Chinese Postman algorithm
6. **Chunk**: Split route by time duration
7. **Save**: Store results in database
8. **Complete**: Mark job as completed

## Deployment

### Google Cloud Run

1. Build and push image:

```bash
docker build -t gcr.io/PROJECT_ID/scanneo-worker .
docker push gcr.io/PROJECT_ID/scanneo-worker
```

2. Deploy to Cloud Run:

```bash
gcloud run deploy scanneo-worker \
  --image gcr.io/PROJECT_ID/scanneo-worker \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL=$DATABASE_URL
```

## Environment Variables

| Variable        | Description                          | Default                                 |
| --------------- | ------------------------------------ | --------------------------------------- |
| `DATABASE_URL`  | PostgreSQL connection string         | Required                                |
| `ORS_API_KEY`   | OpenRouteService API key             | Optional                                |
| `OVERPASS_URL`  | Overpass API endpoint                | https://overpass-api.de/api/interpreter |
| `POLL_INTERVAL` | Job check interval (seconds)         | 30                                      |
| `JOB_TIMEOUT`   | Max processing time (seconds)        | 3600                                    |
| `ENVIRONMENT`   | Environment (development/production) | development                             |
| `LOG_LEVEL`     | Logging level                        | INFO                                    |

## Testing

### Manual Job Trigger

In development mode, you can manually trigger a job:

```bash
curl -X POST http://localhost:8080/process/manual \
  -H "Content-Type: application/json" \
  -d '{
    "area_id": "YOUR_AREA_UUID",
    "profile": "driving-car",
    "chunk_duration": 3600
  }'
```

## Monitoring

The worker logs all activities and provides health endpoints for monitoring:

- Health check: `/health` - Database connectivity
- Status: `/status` - Worker running state

## Algorithm Details

### Chinese Postman Problem

The worker solves the Chinese Postman Problem to find the shortest route that covers every street at least once:

1. Build graph from street network
2. Find nodes with odd degree
3. Add minimum edges to make graph Eulerian
4. Find Eulerian circuit
5. Convert to navigable route

### Route Chunking

Routes are split into time-based chunks for practical navigation:

- Default chunk duration: 1 hour
- Each chunk contains turn-by-turn instructions
- Chunks start/end at convenient locations

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Check DATABASE_URL format
   - Ensure PostGIS extension is enabled
   - Verify network connectivity

2. **OSM data fetch timeout**
   - Area might be too large
   - Try with smaller buffer distance
   - Check Overpass API status

3. **No streets found**
   - Verify area has valid geometry
   - Check area bounds are correct
   - Ensure OSM has data for region

## License

Part of ScanNeo Router project
