# ScanNeo Router - End-to-End Test Plan

## System Overview

ScanNeo Router is a city coverage routing system that generates optimal driving routes for complete street coverage. The system consists of:

- Admin Dashboard (Next.js on Vercel)
- Python Worker Service (Cloud Run)
- PostgreSQL Database with PostGIS (Neon)
- Mapbox for visualization

## Test Environment Setup

### Prerequisites

1. **Admin Dashboard**: https://scanneo-router-admin.vercel.app
2. **Worker Service**: https://scanneo-worker-dgseb5nz7q-nw.a.run.app
3. **Database**: Neon PostgreSQL with PostGIS enabled
4. **Test Data**: Sample GeoJSON files for different area types

### Required Test Data Files

Create these test GeoJSON files:

1. **Small Area** (`test-small-area.geojson`):
   - Simple polygon covering 1-2 km²
   - Use for quick functionality tests

2. **Medium Area** (`test-medium-area.geojson`):
   - Polygon covering 5-10 km²
   - Use for performance testing

3. **Complex Area** (`test-complex-area.geojson`):
   - MultiPolygon with disconnected regions
   - Use for edge case testing

## Test Scenarios

### 1. Area Import and Management

#### Test 1.1: Import Simple Polygon

**Steps:**

1. Navigate to https://scanneo-router-admin.vercel.app/areas
2. Click "Import GeoJSON" button
3. Upload `test-small-area.geojson`
4. Set Area Name: "Test Small Area"
5. Set Buffer: 50 meters
6. Set Profile: driving-car
7. Click "Import Area"

**Expected Results:**

- ✅ Toast notification: "Area imported successfully"
- ✅ Area appears in the list with correct name
- ✅ Area shows in database with PostGIS geometry
- ✅ Can view area details

#### Test 1.2: Import MultiPolygon

**Steps:**

1. Navigate to /areas
2. Import `test-complex-area.geojson`
3. Set Area Name: "Test Complex Area"
4. Import with default settings

**Expected Results:**

- ✅ MultiPolygon correctly stored in database
- ✅ All disconnected regions visible on map
- ✅ Area statistics correctly calculated

#### Test 1.3: Delete Area

**Steps:**

1. Navigate to /areas
2. Find "Test Small Area" in list
3. Click "Delete" button
4. Confirm deletion

**Expected Results:**

- ✅ Area removed from list
- ✅ Area removed from database
- ✅ Toast notification confirms deletion

### 2. Route Generation

#### Test 2.1: Generate Route for Small Area

**Steps:**

1. Navigate to https://scanneo-router-admin.vercel.app/routes
2. Select "Test Small Area" from dropdown
3. Set Chunk Duration: 30 minutes
4. Click "Generate Coverage Route"

**Expected Results:**

- ✅ Toast notification with Route ID
- ✅ Job appears in "Active Jobs" section
- ✅ Job status changes from "pending" to "processing"
- ✅ Route entry created in database
- ✅ Worker picks up job within 30 seconds

#### Test 2.2: Monitor Route Generation Progress

**Steps:**

1. After starting route generation
2. Watch "Active Jobs" section
3. Note progress updates

**Expected Results:**

- ✅ Progress bar shows advancement
- ✅ Status updates from worker visible
- ✅ Job moves to "Routes" list when complete
- ✅ Route has geometry data in database

#### Test 2.3: Handle Large Area Route Generation

**Steps:**

1. Generate route for "Test Medium Area"
2. Set Chunk Duration: 1 hour
3. Monitor progress

**Expected Results:**

- ✅ Worker processes without timeout
- ✅ Route chunked appropriately
- ✅ Memory usage stays within limits
- ✅ Complete route generated

### 3. Route Visualization

#### Test 3.1: View Route on Map

**Steps:**

1. Navigate to /routes
2. Find completed route
3. Click "Map" button
4. Or navigate to /map and select "Routes" layer

**Expected Results:**

- ✅ Map loads with route displayed
- ✅ Route shown in green (#A6CE39)
- ✅ Can zoom/pan to explore route
- ✅ Click route for popup with details

#### Test 3.2: View Route Details

**Steps:**

1. Navigate to /routes
2. Click "View" on completed route
3. Review route details page

**Expected Results:**

- ✅ Route statistics displayed (distance, time)
- ✅ Map preview shows route
- ✅ Chunks listed if applicable
- ✅ Download buttons functional

#### Test 3.3: Filter Routes on Map

**Steps:**

1. Navigate to /map
2. Select "Generated Routes" layer
3. Use "Filter by Route" dropdown
4. Select specific route

**Expected Results:**

- ✅ Only selected route displayed
- ✅ Map zooms to route bounds
- ✅ Statistics update for selected route

### 4. Route Export

#### Test 4.1: Export as GeoJSON

**Steps:**

1. Navigate to route details page
2. Click "Download GeoJSON" button
3. Save file

**Expected Results:**

- ✅ File downloads with correct name
- ✅ Valid GeoJSON format
- ✅ Contains route geometry
- ✅ Includes metadata properties

#### Test 4.2: Export as GPX

**Steps:**

1. Navigate to route details page
2. Click "Export to GPX" button
3. Save file

**Expected Results:**

- ✅ File downloads as .gpx
- ✅ Valid GPX XML format
- ✅ Can import into GPS devices
- ✅ Track points in correct order

### 5. Worker Service Health

#### Test 5.1: Worker Health Check

**Steps:**

1. Access https://scanneo-worker-dgseb5nz7q-nw.a.run.app/health
2. Check response

**Expected Results:**

- ✅ Returns 200 OK
- ✅ Shows "healthy" status
- ✅ Database connection confirmed

#### Test 5.2: Worker Job Processing

**Steps:**

1. Generate new route
2. Monitor Cloud Run logs
3. Check database updates

**Expected Results:**

- ✅ Worker polls every 30 seconds
- ✅ Picks up pending jobs
- ✅ Updates job status in database
- ✅ Stores route geometry on completion

### 6. Error Handling

#### Test 6.1: Invalid GeoJSON Upload

**Steps:**

1. Navigate to /areas
2. Try uploading invalid/corrupted GeoJSON
3. Observe error handling

**Expected Results:**

- ✅ Error message displayed
- ✅ No partial data saved
- ✅ Can retry with valid file

#### Test 6.2: Network Failure Recovery

**Steps:**

1. Start route generation
2. Simulate network interruption
3. Restore connection

**Expected Results:**

- ✅ Job remains in queue
- ✅ Worker retries processing
- ✅ No data corruption

### 7. Performance Tests

#### Test 7.1: Concurrent Route Generation

**Steps:**

1. Generate routes for 3 different areas
2. Monitor all jobs simultaneously
3. Check completion

**Expected Results:**

- ✅ All jobs processed
- ✅ No job interference
- ✅ Worker handles queue properly

#### Test 7.2: Large Area Processing

**Steps:**

1. Import area > 20 km²
2. Generate route with 30-min chunks
3. Monitor memory/CPU usage

**Expected Results:**

- ✅ Worker doesn't crash
- ✅ Completes within timeout
- ✅ All chunks generated

## Validation Checklist

### Database Validation

- [ ] Areas table contains imported geometries
- [ ] coverage_routes table has route records
- [ ] params JSONB contains status/progress
- [ ] Geometry columns properly indexed
- [ ] PostGIS functions working

### API Validation

- [ ] GET /api/areas returns all areas
- [ ] POST /api/routes creates route job
- [ ] GET /api/routes lists all routes
- [ ] GET /api/routes/[id] returns details
- [ ] GET /api/routes/[id]/export works

### UI Validation

- [ ] All pages load without errors
- [ ] Forms validate input correctly
- [ ] Toast notifications appear
- [ ] Map renders properly
- [ ] Responsive design works

### Worker Validation

- [ ] Polls database regularly
- [ ] Processes jobs correctly
- [ ] Updates job status
- [ ] Handles errors gracefully
- [ ] Generates valid routes

## Success Criteria

The system is considered fully functional when:

1. **Area Management**: Can import, view, and delete areas
2. **Route Generation**: Successfully generates routes for various area sizes
3. **Visualization**: Routes display correctly on map with filtering
4. **Export**: Can download routes in GeoJSON and GPX formats
5. **Performance**: Handles areas up to 50 km² without issues
6. **Reliability**: Worker processes jobs consistently
7. **User Experience**: Clear feedback for all operations

## Known Limitations

1. **Chunks Table**: Not yet implemented (routes stored as single geometry)
2. **Real-time Updates**: Job progress updates every 5 seconds (not real-time)
3. **Coverage Progress**: Layer not yet implemented
4. **Authentication**: Firebase Auth backend ready but not integrated in UI

## Test Execution Log

| Date       | Tester | Test Scenario           | Result  | Notes                                           |
| ---------- | ------ | ----------------------- | ------- | ----------------------------------------------- |
| 2025-08-21 | Chris  | Area Import (Baffins 3) | ✅ PASS | Successfully imported GeoJSON area              |
| 2025-08-21 | Chris  | Route Generation        | ✅ PASS | Route created, worker picked up job             |
| 2025-08-21 | Chris  | Worker Processing       | ✅ PASS | Completed in ~6 minutes for 59.7km route        |
| 2025-08-21 | Chris  | Route Visualization     | ✅ PASS | Route displays on map                           |
| 2025-08-21 | Chris  | Route Export            | ✅ PASS | GeoJSON and GPX export working                  |
| 2025-08-21 | Chris  | Stuck Job Recovery      | ✅ PASS | Reset endpoint successfully recovered stuck job |
| 2025-08-21 | Chris  | Route Quality           | ❌ FAIL | Routes jump across city, not following roads    |

## Issues Found

| ID   | Severity | Description                                                 | Status   | Resolution                            |
| ---- | -------- | ----------------------------------------------------------- | -------- | ------------------------------------- |
| #001 | HIGH     | Routes contain jumps - not following connected road network | Open     | Need to fix route algorithm           |
| #002 | HIGH     | Routes cross areas without using roads (straight lines)     | Open     | Missing road connectivity validation  |
| #003 | MEDIUM   | Route sequence not optimized for continuous driving         | Open     | Need proper Eulerian path calculation |
| #004 | LOW      | Old jobs stuck in processing state                          | Resolved | Added admin reset endpoint            |

## Route Quality Issues (Critical - Needs Fix)

### Current Problems

1. **Disconnected Segments**: Route jumps between non-connected road segments
2. **No Road Following**: Creates straight lines across the city instead of following roads
3. **Improper Sequencing**: Does not create a continuous driveable path
4. **Missing Turn-by-Turn**: No proper navigation between segments

### Root Causes

1. **Algorithm Issue**: Chinese Postman implementation not creating proper Eulerian path
2. **Graph Construction**: Road network graph may not be properly connected
3. **Missing Routing**: No actual routing between disconnected components
4. **Coordinate Ordering**: LineString coordinates not in driving sequence

### Required Fixes

1. **Validate Graph Connectivity**: Ensure all streets form connected components
2. **Use Routing Service**: Route between disconnected segments using OpenRouteService
3. **Proper Path Construction**: Build continuous path that can be driven
4. **Add Route Validation**: Check route continuity before saving

## Recommendations

1. **Priority 1**: Fix route generation algorithm for continuous paths
2. **Priority 2**: Add route validation and quality checks
3. **Priority 3**: Implement proper turn-by-turn navigation
4. **Priority 4**: Add progress percentage calculation
5. **Future**: Add authentication flow
6. **Future**: Implement coverage tracking

## Conclusion

This test plan covers the complete end-to-end flow of the ScanNeo Router system. Execute all test scenarios to validate that the system is ready for production use. Document any issues found and ensure critical functionality works before deployment.
