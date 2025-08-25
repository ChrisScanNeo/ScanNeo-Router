#!/usr/bin/env python3
import requests
import json

# Test with disconnected streets
geojson = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {"name": "Street 1"},
            "geometry": {
                "type": "LineString",
                "coordinates": [[-1.06, 50.80], [-1.055, 50.805]]
            }
        },
        {
            "type": "Feature",
            "properties": {"name": "Street 2 (disconnected)"},
            "geometry": {
                "type": "LineString",
                "coordinates": [[-1.05, 50.81], [-1.045, 50.815]]
            }
        }
    ]
}

response = requests.post(
    "http://localhost:8000/api/generate-route",
    json={
        "streets_geojson": geojson,
        "coverage_mode": True
    }
)

print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    print(f"Success: {data.get('success')}")
    if data.get('route'):
        route = data['route']
        print(f"Route points: {len(route.get('geometry', {}).get('coordinates', []))}")
        print(f"Gaps: {len(route.get('gaps', []))}")
else:
    print(f"Error: {response.text}")