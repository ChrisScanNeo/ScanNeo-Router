# OpenRouteService API Key Setup

## Issue Identified

Routes are being generated with `completed_with_warnings` status due to missing OpenRouteService (ORS) API key in production. Without the API key:

- Routes have large gaps (400+ meters instead of <30m)
- Disconnected components are connected with straight lines instead of actual roads
- Route continuity validation fails

## Diagnostics from Production

```json
{
  "continuity_valid": false,
  "max_gap_m": 448.76,
  "violations": 156,
  "components_before": 2,
  "components_after": 1
}
```

## Solution: Configure ORS API Key

### Step 1: Get Free API Key

1. Go to https://openrouteservice.org/dev/#/signup
2. Sign up for a free account
3. Confirm your email
4. Go to your dashboard: https://openrouteservice.org/dev/#/home
5. Copy your API key

Free tier includes:

- 2,000 requests/day
- Routing, distance matrix, and geocoding
- All vehicle profiles (car, HGV, bicycle, pedestrian)

### Step 2: Add to GitHub Secrets

1. Go to your repository settings: https://github.com/ChrisScanNeo/ScanNeo-Router/settings/secrets/actions
2. Click "New repository secret"
3. Name: `ORS_API_KEY`
4. Value: Your API key from ORS dashboard
5. Click "Add secret"

### Step 3: Redeploy Worker

The worker will automatically redeploy when you push any change, or you can manually trigger:

1. Go to Actions: https://github.com/ChrisScanNeo/ScanNeo-Router/actions
2. Select "Deploy Worker to Cloud Run"
3. Click "Run workflow"
4. Select branch: main
5. Click "Run workflow"

### Step 4: Verify Deployment

Check worker health endpoint:

```bash
curl https://scanneo-worker-dgseb5nz7q-nw.a.run.app/health
```

Check Cloud Run logs for confirmation:

```
✓ ORS API key configured
```

## Expected Results After Configuration

With ORS API key configured, routes will have:

- ✅ `continuity_valid: true`
- ✅ `max_gap_m: < 30`
- ✅ Proper road-following connections
- ✅ Status: `completed` (not `completed_with_warnings`)

## Alternative: Local Development

For local testing, add to `.env`:

```env
ORS_API_KEY=your_api_key_here
```

## Monitoring Usage

Monitor your API usage at: https://openrouteservice.org/dev/#/home

If you exceed the free tier:

- Consider caching responses with Redis
- Batch nearby connections
- Upgrade to paid plan ($50/month for 20,000 requests/day)

## Troubleshooting

If routes still have gaps after adding the key:

1. Check deployment logs for "✓ ORS API key configured"
2. Verify the key is valid by testing: https://api.openrouteservice.org/v2/status
3. Check for rate limiting (429 errors) in worker logs
4. Ensure the area has actual street data from OSM
