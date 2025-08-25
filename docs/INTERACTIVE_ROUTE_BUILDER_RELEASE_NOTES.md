# Interactive Route Builder - Release Notes & Testing Guide

**Version**: 1.0.0  
**Release Date**: 2024-08-25  
**Status**: Ready for Testing

## 🎯 Overview

The Interactive Route Builder is a new feature that provides step-by-step control over street coverage route generation. It addresses real-world challenges in urban navigation, particularly optimized for London's complex street network with one-way systems, access restrictions, and disconnected zones.

## 🚀 New Features

### 1. Interactive Route Builder UI (`/routes/builder`)

A comprehensive 7-step workflow for creating coverage routes:

- **Step 1**: Area Selection
- **Step 2**: Street Extraction from OpenStreetMap
- **Step 3**: Network Graph Building
- **Step 4**: Starting Point Selection
- **Step 5**: Route Generation
- **Step 6**: Gap Resolution
- **Step 7**: Route Finalization

Access via:

- Click "Interactive Builder" button on `/routes` page
- Direct URL: `/routes/builder`
- With pre-selected area: `/routes/builder?area={area-id}`

### 2. Enhanced Street Extraction

#### API Endpoints

**`POST /api/areas/[id]/extract-streets`**

- Fetches streets from OpenStreetMap with configurable filtering
- Request body options:
  ```json
  {
    "includeServiceRoads": false,
    "includePrivateRoads": false,
    "respectRestrictions": true,
    "maxAreaSqKm": 10
  }
  ```
- Returns detailed extraction statistics

**`GET /api/areas/[id]/streets`**

- Retrieves previously extracted streets from database
- Returns GeoJSON FeatureCollection with metadata

#### Street Filtering

**Included by Default:**

- Motorways and motorway links
- Trunk roads and trunk links
- Primary, secondary, tertiary roads (and their links)
- Residential streets
- Unclassified roads
- Living streets

**Excluded by Default:**

- Footways, paths, cycleways
- Pedestrian areas
- Steps, tracks, bridleways
- Construction/abandoned roads
- Driveways, parking aisles (unless service roads enabled)
- Private access roads (unless private roads enabled)

### 3. Real-World Constraint Detection

The system now identifies and tracks:

- **One-way streets**: Detected via OSM `oneway` tags
- **Bus gates**: Roads restricted to buses only
- **Access restrictions**: Private, customer-only, delivery-only
- **Dead-ends**: Cul-de-sacs and turning circles
- **LTNs**: Low Traffic Neighbourhoods
- **Time-based restrictions**: School streets, timed access

### 4. Visual Map Features

**Color Coding:**

- 🔵 **Blue**: Area boundaries
- 🟢 **Green**: Two-way streets
- 🔴 **Red**: One-way streets
- 🟡 **Yellow**: Gap locations
- 🟢 **Green Marker**: Selected start point

**Map Controls:**

- Zoom in/out with mouse wheel or buttons
- Pan by clicking and dragging
- Fullscreen mode available
- Auto-fit to area bounds

### 5. Gap Detection & Resolution

When the route generator finds disconnected segments, you can:

1. **Auto-connect**: Use routing API to find drivable path
2. **Manual connection**: Draw custom path (coming soon)
3. **Skip gap**: Leave disconnected for separate coverage passes

### 6. Area Size Validation

- Warns if area exceeds 10 km²
- Recommends splitting large areas into zones
- Shows area size in extraction results

## 📋 Testing Checklist

### Basic Workflow Test

- [ ] **Navigate to Interactive Builder**
  - Go to `/routes`
  - Click "Interactive Builder" button
  - Verify page loads with 7-step sidebar

- [ ] **Test Area Selection**
  - Select "Localtest" from dropdown
  - Verify area boundary appears on map in blue
  - Verify map zooms to fit area

- [ ] **Test Street Extraction**

  ```
  Default settings (all unchecked):
  - [ ] Include service roads: OFF
  - [ ] Include private roads: OFF
  - [ ] Respect restrictions: ON
  ```

  - Click "Extract Streets"
  - Verify progress indicator appears
  - Check toast notification shows statistics
  - Verify streets appear on map (green/red lines)

- [ ] **Test Graph Building**
  - Review statistics displayed
  - Click "Build Network Graph"
  - Verify success message

- [ ] **Test Start Point Selection**
  - Click anywhere on the map
  - Verify green marker appears
  - Verify coordinates shown in sidebar

- [ ] **Test Route Generation**
  - Click "Generate Coverage Route"
  - Verify gap detection (if any)

- [ ] **Test Gap Resolution** (if gaps detected)
  - Try "Auto-connect via Routing"
  - Verify gap counter updates
  - Complete all gaps

- [ ] **Test Route Saving**
  - Click "Save Route to Database"
  - Verify redirect to `/routes` page
  - Check route appears in list

### Advanced Testing

#### Test Different Filter Combinations

- [ ] **Test with Service Roads Enabled**

  ```
  - [x] Include service roads: ON
  - [ ] Include private roads: OFF
  - [x] Respect restrictions: ON
  ```

  - Extract streets
  - Compare street count (should be higher)

- [ ] **Test with Private Roads Enabled**

  ```
  - [ ] Include service roads: OFF
  - [x] Include private roads: ON
  - [x] Respect restrictions: ON
  ```

  - Extract streets
  - Note any private roads included

- [ ] **Test without Restrictions**

  ```
  - [ ] Include service roads: OFF
  - [ ] Include private roads: OFF
  - [ ] Respect restrictions: OFF
  ```

  - Extract streets
  - Check for bus lanes/restricted zones

#### Test Edge Cases

- [ ] **Large Area Warning**
  - Try selecting an area > 10 km²
  - Verify warning message appears

- [ ] **Empty Area**
  - Select area with no streets
  - Verify appropriate error message

- [ ] **Network Refresh**
  - Extract streets
  - Go back to Step 2
  - Extract again with different filters
  - Verify old streets are replaced

### Map Functionality

- [ ] **Zoom Controls**
  - Test zoom in/out buttons
  - Test mouse wheel zoom
  - Verify zoom level appropriate

- [ ] **Pan Controls**
  - Click and drag to pan
  - Verify smooth movement

- [ ] **Fullscreen Mode**
  - Click fullscreen button
  - Verify map expands
  - Exit fullscreen

### Console Checks

Open browser console (F12) and verify:

- [ ] No error messages in red
- [ ] See "Initializing Mapbox map..."
- [ ] See "Mapbox token: Token present"
- [ ] See "Map loaded successfully"
- [ ] See "Displaying streets on map" after extraction
- [ ] See "Streets layer added successfully"

## 🐛 Known Issues & Limitations

### Current Limitations

1. **Manual gap connection** - UI exists but drawing functionality not yet implemented
2. **Arrow indicators** - One-way streets shown in red but arrow symbols may not display
3. **Route visualization** - Generated route path not yet displayed on map
4. **GPX Export** - Button exists but export functionality coming soon
5. **Coverage tracking** - GPS trace upload feature planned for next release

### Potential Issues

| Issue                | Cause                | Solution                                 |
| -------------------- | -------------------- | ---------------------------------------- |
| Map not loading      | Missing Mapbox token | Check Vercel environment variables       |
| Streets not visible  | Map not fully loaded | Wait for loading spinner to complete     |
| Area not in dropdown | API response format  | Refresh page, check console              |
| Extraction fails     | OSM API timeout      | Try again or reduce area size            |
| Many gaps detected   | Disconnected network | Check for rivers, railways dividing area |

## 📊 Expected Results

### For "Localtest" Area

Based on your test area, you should see approximately:

- **Total streets**: 60-80 (depending on filters)
- **One-way streets**: 5-15
- **Two-way streets**: 45-65
- **Dead-ends**: 2-5
- **Total length**: 5-15 km

### Extraction Times

- Small area (< 2 km²): 5-10 seconds
- Medium area (2-5 km²): 10-20 seconds
- Large area (5-10 km²): 20-40 seconds

## 🔧 Configuration

### Environment Variables

Ensure these are set in Vercel:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
DATABASE_URL=your_postgres_connection_string
```

### Database Tables Used

- `areas` - Stores coverage area polygons
- `edges` - Stores extracted street segments
- `coverage_routes` - Stores generated routes (when saved)

## 📝 Data Flow

1. **Area Selection** → Fetches from `areas` table
2. **Street Extraction** → Calls Overpass API → Stores in `edges` table
3. **Graph Building** → In-memory NetworkX graph (Python worker)
4. **Route Generation** → Chinese Postman algorithm (Python worker)
5. **Gap Resolution** → OpenRouteService API for connections
6. **Save Route** → Stores in `coverage_routes` table

## 🎓 Tips for Testing

1. **Start Small**: Test with your Localtest area first
2. **Check Statistics**: Verify street counts match expectations
3. **Try Different Filters**: Test all checkbox combinations
4. **Monitor Console**: Keep developer console open for debugging
5. **Test Repeatedly**: Try the same area multiple times

## 📸 What to Look For

### Visual Confirmations

- ✅ Blue boundary around selected area
- ✅ Green lines for two-way streets
- ✅ Red lines for one-way streets
- ✅ Streets fit within area boundary
- ✅ Green marker at start point
- ✅ Loading spinner while processing

### Statistical Confirmations

- ✅ Street count reasonable for area size
- ✅ One-way percentage typical for area type
- ✅ Total length proportional to area size
- ✅ Extraction time under 1 minute

## 🚦 Success Criteria

The feature is working correctly if you can:

1. ✅ Select an area and see it on the map
2. ✅ Extract streets with visible results
3. ✅ See different results with different filters
4. ✅ Progress through all 7 steps
5. ✅ Save a route (even if mock data for now)

## 📞 Support & Feedback

### Reporting Issues

When reporting issues, please include:

1. Browser and version
2. Step where issue occurred
3. Console error messages (if any)
4. Screenshot of the issue
5. Area name and filters used

### Debug Information

Press F12 and check:

- Console tab for errors
- Network tab for failed requests
- Application tab → Local Storage for cached data

## 🔄 Recent Updates

### 2024-08-25 (Latest)

- Fixed area dropdown not showing areas
- Fixed map visualization for extracted streets
- Added loading spinner for map initialization
- Improved error handling and console logging
- Added Mapbox token validation

### 2024-08-24 (Initial Release)

- Interactive route builder UI
- OSM street extraction with filtering
- Real-world constraint detection
- Gap detection interface
- Map visualization

---

**Ready to test!** Start with the basic workflow test and work through each section. Report any issues or unexpected behavior.

_Document Version: 1.0.0_  
_Last Updated: 2024-08-25_
