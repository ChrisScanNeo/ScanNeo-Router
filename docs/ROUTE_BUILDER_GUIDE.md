# Interactive Route Builder Guide

## Overview

The Interactive Route Builder is a powerful tool for creating optimal street coverage routes with full control over street extraction, filtering, and gap resolution. Designed specifically for real-world navigation challenges in London and other complex urban environments.

## Getting Started

### Accessing the Route Builder

There are two ways to access the Interactive Route Builder:

1. **From Routes Page**: Navigate to `/routes` and click the green **"Interactive Builder"** button
2. **Direct URL**: Navigate directly to `/routes/builder`

## Step-by-Step Workflow

The route builder guides you through 7 sequential steps, each building upon the previous:

### Step 1: Select Coverage Area 📍

**What it does**: Choose the geographic area for route generation

**How to use**:

1. Select an area from the dropdown menu
2. The area boundary will appear on the map in blue
3. System automatically checks area size

**Important**:

- Areas larger than 10 km² will trigger a warning
- Large areas should be split into smaller zones for better performance
- You can also access the builder with a pre-selected area using `/routes/builder?area={area-id}`

### Step 2: Extract Streets from OSM 🗺️

**What it does**: Fetches drivable roads from OpenStreetMap with customizable filtering

**Configuration Options**:

| Option                | Default | Description                                                           |
| --------------------- | ------- | --------------------------------------------------------------------- |
| Include service roads | ❌ Off  | Includes service roads (but still excludes driveways, parking aisles) |
| Include private roads | ❌ Off  | Includes roads marked as private access                               |
| Respect restrictions  | ✅ On   | Identifies and marks restricted zones (bus gates, LTNs)               |

**Automatically Excluded**:

- Footways, paths, cycleways, pedestrian areas
- Steps, tracks, bridleways, corridors
- Construction, abandoned, or proposed roads
- Platform and raceway types

**Output Statistics**:

- Total streets found from OSM
- Streets after filtering
- One-way street count
- Restricted access count
- Dead-end/cul-de-sac count
- Total network length in kilometers

### Step 3: Build Network Graph 🔗

**What it does**: Converts extracted streets into a routable network graph

**Statistics Displayed**:

- Total number of streets
- Total length of network
- One-way vs two-way street breakdown
- Connected components count

**Process**:

1. Review the statistics
2. Click "Build Network Graph"
3. System creates directed graph respecting one-way streets

### Step 4: Select Starting Point 🎯

**What it does**: Sets the origin point for route generation

**How to use**:

1. Click anywhere on the map
2. System automatically snaps to nearest street/intersection
3. Green marker appears at selected location
4. Coordinates displayed in sidebar

**Tips**:

- Choose a point with good access to main roads
- Avoid starting in dead-ends
- Consider parking availability at start point

### Step 5: Generate Coverage Route 🛣️

**What it does**: Calculates optimal route covering all streets using Chinese Postman algorithm

**Algorithm Features**:

- Respects one-way street directions
- Minimizes total distance
- Identifies disconnected components
- Detects gaps between segments
- Optimizes for practical navigation

**Output**:

- Complete route geometry
- Gap locations and distances
- Route statistics (length, estimated time)

### Step 6: Resolve Gaps 🔧

**What it does**: Handles disconnected segments in the route

**For each gap, you have three options**:

1. **Auto-connect via Routing** 🔵
   - Uses routing API to find drivable connection
   - Respects road network and restrictions
   - Best for small to medium gaps

2. **Draw Manual Connection** 🟣
   - Create custom path between segments
   - Useful for known shortcuts or special access
   - (Feature in development)

3. **Skip This Gap** 🔴
   - Leave segments disconnected
   - Use for separate coverage zones
   - Requires multiple route passes

**Gap Information Displayed**:

- Gap number (e.g., "Gap 1 of 3")
- Distance in meters
- Start and end coordinates
- Resolution status

### Step 7: Finalize and Save Route ✅

**What it does**: Saves the completed route to database

**Summary Shows**:

- ✅ All streets covered
- ✅ Number of gaps resolved
- ✅ Route optimization complete

**Actions**:

- Click "Save Route to Database"
- Route becomes available in main Routes page
- Ready for export and navigation

## Map Visualization

### Color Coding

| Color           | Element         | Description                              |
| --------------- | --------------- | ---------------------------------------- |
| 🔵 Blue         | Area Boundary   | Selected coverage area outline           |
| 🟢 Green        | Two-way Streets | Roads allowing bidirectional travel      |
| 🔴 Red          | One-way Streets | Roads with directional restrictions      |
| 🟡 Yellow       | Gaps            | Disconnected segments needing resolution |
| ⚫ Black        | Dead-ends       | Cul-de-sacs and no-through roads         |
| 🟢 Green Marker | Start Point     | Selected route origin                    |

### Map Controls

- **Zoom**: Mouse wheel or +/- buttons
- **Pan**: Click and drag
- **Fullscreen**: Fullscreen button in top-right
- **Reset View**: Double-click to reset

## Real-World Optimizations for London

The route builder includes specific features for London's complex street network:

### One-Way Systems

- Properly handles extensive one-way streets
- Creates legal routes respecting directions
- Shows arrows on one-way streets

### Access Restrictions

- **Bus Gates**: Detected and marked
- **LTNs**: Low Traffic Neighbourhoods identified
- **School Streets**: Time-based restrictions noted
- **Width/Height Limits**: Flagged in metadata

### Dead-End Handling

- Identifies cul-de-sacs requiring backtracking
- Calculates additional distance for dead-ends
- Options to exclude or include based on importance

## Best Practices

### 1. Area Selection

- Start with areas under 5 km² for best performance
- Use natural boundaries (main roads, rivers)
- Consider splitting large areas into zones

### 2. Street Filtering

- **Standard Coverage**: Keep defaults (exclude service/private)
- **Complete Coverage**: Enable all road types
- **Main Roads Only**: Custom filtering in future update

### 3. Gap Resolution

- Gaps under 50m: Usually auto-connect works
- Gaps over 200m: May indicate separate zones
- Multiple small gaps: Consider adjusting filters

### 4. Performance Tips

- Close other browser tabs for better performance
- Allow 30-60 seconds for large area extraction
- Save progress regularly

## Troubleshooting

### Common Issues and Solutions

| Issue                  | Possible Cause            | Solution                          |
| ---------------------- | ------------------------- | --------------------------------- |
| "Area too large" error | Area exceeds 10 km²       | Split into smaller zones          |
| No streets extracted   | Too restrictive filters   | Enable service/private roads      |
| Many gaps detected     | Disconnected road network | Check for rivers, railways, parks |
| Route generation fails | Network too complex       | Reduce area size                  |
| Map not loading        | Missing Mapbox token      | Check environment configuration   |

### Error Messages

- **"Failed to extract streets"**: OSM API timeout - try again or reduce area
- **"Area not found"**: Invalid area ID - select from dropdown
- **"No valid street network"**: No drivable roads in area - check filters

## Advanced Features (Coming Soon)

### Planned Enhancements

1. **GPX Export**: Download route for GPS devices
2. **Coverage Tracking**: Upload GPS traces to track progress
3. **Zone Management**: Automatic area splitting
4. **Time Windows**: Handle time-based restrictions
5. **Multi-vehicle**: Different profiles (car, van, bike)
6. **Route Optimization**: Reorder segments for efficiency

## Example Workflows

### Small Residential Area

```
1. Select "Elm Park Estate" (2 km²)
2. Use default filters
3. Extract streets → 45 streets, 2.3 km total
4. Build graph
5. Click near main entrance for start
6. Generate route → No gaps
7. Save route → Ready!
```

### Mixed Commercial/Residential

```
1. Select "Shoreditch Quarter" (3.5 km²)
2. Enable service roads (for loading bays)
3. Extract streets → 128 streets, 8.7 km total
4. Build graph
5. Start from parking garage
6. Generate route → 3 gaps found
7. Auto-connect all gaps
8. Save route → Complete coverage
```

### Complex Urban Area with Restrictions

```
1. Select "Camden Town Center" (4 km²)
2. Keep restrictions enabled
3. Extract streets → 89 streets (31 restricted)
4. Build graph
5. Start from depot location
6. Generate route → 5 gaps (2 due to bus gates)
7. Skip bus gate gaps, auto-connect others
8. Save route → Requires 2 passes for full coverage
```

## Tips for Success

1. **Test Small First**: Always test with a small area before scaling up
2. **Check the Stats**: Verify street count matches expectations
3. **Review Gaps**: Large gaps often indicate natural boundaries
4. **Save Progress**: Routes are saved permanently to database
5. **Iterate**: Adjust filters and try again if results aren't ideal

## Need Help?

- **GitHub Issues**: Report bugs at [github.com/ChrisScanNeo/ScanNeo-Router/issues](https://github.com/ChrisScanNeo/ScanNeo-Router/issues)
- **Documentation**: Check `/docs` folder for technical details
- **API Reference**: See `/docs/api/` for endpoint documentation

## Version History

- **v1.0.0** (2024-08-25): Initial release with core functionality
- Real-world street filtering
- One-way street support
- Gap detection and resolution
- London-specific optimizations

---

_Last updated: 2024-08-25_
