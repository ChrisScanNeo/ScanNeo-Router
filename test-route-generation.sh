#!/bin/bash

# Test route generation with the Python worker

echo "Testing route generation with Chinese Postman algorithm..."
echo "============================================="
echo ""

# Test GeoJSON for a small area
GEOJSON='{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {"name": "Street 1"},
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-1.06, 50.80],
          [-1.055, 50.805]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {"name": "Street 2"},
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-1.055, 50.805],
          [-1.05, 50.81]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {"name": "Street 3"},
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [-1.05, 50.81],
          [-1.055, 50.815]
        ]
      }
    }
  ]
}'

# Call the worker API
echo "Sending request to worker..."
curl -X POST http://localhost:8000/api/generate-route \
  -H "Content-Type: application/json" \
  -d "{
    \"streets_geojson\": $GEOJSON,
    \"coverage_mode\": true
  }" | python -m json.tool

echo ""
echo "Test complete!"