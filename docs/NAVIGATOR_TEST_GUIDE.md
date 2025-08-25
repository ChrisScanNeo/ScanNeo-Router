# ScanNeo Navigator - Test Guide

## Overview

The ScanNeo Navigator is a tablet-optimized, turn-by-turn navigation interface designed for in-car use during street coverage operations. This guide covers how to test and use the navigation system.

## Quick Start

### 1. Prerequisites
- Generated route (completed status)
- Modern browser with GPS/location services
- Tablet or device with location capabilities
- Active internet connection for map tiles

### 2. Accessing the Navigator

#### From Routes List:
1. Navigate to http://localhost:3000/routes
2. Find a completed route
3. Click the green "Navigate" button

#### From Route Details:
1. Go to any route details page
2. Click the prominent "🚗 Start Navigation" button

## Navigation Interface

### Main Components

#### 1. **Full-Screen Map**
- Navigation-optimized Mapbox style
- Auto-rotating based on heading
- 45° pitch for better forward visibility
- Smooth camera transitions

#### 2. **Progress Bar (Top)**
```
┌─────────────────────────────────┐
│ Route Progress         75.3%     │
│ ████████████████████░░░░░░      │
└─────────────────────────────────┘
```
- Shows percentage of route completed
- Green fill indicates progress
- Updates in real-time

#### 3. **Speed Display (Top Left)**
```
┌──────────┐
│ Speed    │
│ 32 km/h  │
└──────────┘
```
- Current speed from GPS
- Large, readable font

#### 4. **Off-Route Warning (Top Right)**
```
┌─────────────────────┐
│    OFF ROUTE        │
│ Rerouting in 7s     │
└─────────────────────┘
```
- Red pulsing alert
- Countdown timer
- Auto-reroutes after 10 seconds

#### 5. **Control Buttons (Bottom)**
- **Start Navigation**: Begin GPS tracking
- **Stop Navigation**: End session
- **Test Reroute**: Simulate off-route (for testing)

## Color Coding

### Route Visualization
- 🔵 **Blue Line**: Roads yet to be covered
- 🟢 **Green Line**: Roads already covered
- 🔴 **Red Pulse**: Off-route indicator
- 🔵 **Blue Dot**: Your current position

## Testing Procedures

### Test 1: Basic Navigation Start
1. Open a completed route in navigator
2. Click "Start Navigation"
3. **Expected**: 
   - GPS permission prompt
   - Blue dot appears at your location
   - Map centers on your position
   - Speed shows "0 km/h" if stationary

### Test 2: Route Progress Tracking
1. Start navigation
2. Move along the route (or simulate movement)
3. **Expected**:
   - Covered segments turn green
   - Progress percentage increases
   - Map follows your position
   - Camera rotates with heading

### Test 3: Off-Route Detection
1. Start navigation
2. Click "Test Reroute" button (or move >50m from route)
3. **Expected**:
   - Red "OFF ROUTE" warning appears
   - 10-second countdown begins
   - After countdown, reroute calculated
   - New path shown to rejoin route

### Test 4: Manual Rerouting
1. During navigation, go off route
2. Wait for off-route detection
3. Return to route before countdown ends
4. **Expected**:
   - Warning disappears
   - Timer resets
   - Navigation continues normally

### Test 5: Coverage Visualization
1. Navigate along route
2. Complete several segments
3. **Expected**:
   - Completed segments show in green
   - Uncompleted segments remain blue
   - Progress bar updates accordingly

## Desktop Testing (Without GPS)

### Using Browser Developer Tools

1. **Open Chrome/Edge DevTools** (F12)
2. **Click three dots menu → More tools → Sensors**
3. **Set custom location**:
   ```
   Latitude: 50.805
   Longitude: -1.055
   ```
4. **Simulate movement**:
   - Change coordinates gradually
   - Update every few seconds
   - Follow the route path

### Test Coordinates for Portsmouth Area
```javascript
// Start point
{ lat: 50.8050, lng: -1.0550 }

// Mid-route points
{ lat: 50.8055, lng: -1.0545 }
{ lat: 50.8060, lng: -1.0540 }
{ lat: 50.8065, lng: -1.0535 }

// Off-route point (triggers reroute)
{ lat: 50.8070, lng: -1.0520 }
```

## Tablet Setup

### Optimal Configuration
1. **Screen Settings**:
   - Brightness: Maximum for daylight
   - Auto-rotate: Off
   - Sleep: Never during navigation

2. **Browser Settings**:
   - Full-screen mode (F11)
   - Location services: Always allow
   - Keep tabs active

3. **Mounting**:
   - Secure tablet mount
   - Landscape orientation
   - Within easy reach
   - Avoid windshield obstruction

## Performance Metrics

### Expected Performance
- **GPS Update Rate**: 1 Hz (once per second)
- **Position Accuracy**: <10 meters
- **Off-route Detection**: <3 seconds
- **Reroute Calculation**: <5 seconds
- **Map Rendering**: 60 FPS
- **Battery Life**: 3-4 hours continuous

### Monitoring Performance
Check debug info (top right corner):
```
Segments: 45 / 120
Position: 50.80500, -1.05500
Off Route: No
```

## Troubleshooting

### Issue: Location Not Working
**Solution**:
1. Check browser permissions
2. Ensure HTTPS connection (or localhost)
3. Enable device location services
4. Clear browser cache

### Issue: Map Not Loading
**Solution**:
1. Check internet connection
2. Verify Mapbox token in .env.local
3. Check browser console for errors
4. Refresh page

### Issue: Off-Route Too Sensitive
**Solution**:
- Current threshold: 50 meters
- Can be adjusted in navigation page
- Consider GPS accuracy limitations

### Issue: Route Not Showing
**Solution**:
1. Ensure route has geometry data
2. Check route status is "completed"
3. Verify route was generated with worker
4. Check browser console for API errors

## API Endpoints

### Navigation Start
```bash
POST /api/navigation/start
{
  "routeId": "uuid-here"
}
```

### Reroute Request
```bash
POST /api/navigation/reroute
{
  "currentPosition": [lng, lat],
  "rejoinPoint": [lng, lat],
  "routeId": "uuid-here"
}
```

### Progress Update
```bash
POST /api/navigation/progress
{
  "routeId": "uuid-here",
  "coveredSegments": [1, 2, 3],
  "currentPosition": [lng, lat]
}
```

## Best Practices

### For Drivers
1. **Start navigation before driving**
2. **Mount tablet securely**
3. **Set brightness to maximum in daylight**
4. **Keep charger connected**
5. **Pull over to interact with screen**

### For Testing
1. **Test in different lighting conditions**
2. **Test with poor GPS signal**
3. **Test rapid direction changes**
4. **Test long routes (>1 hour)**
5. **Test battery consumption**

## Safety Guidelines

⚠️ **IMPORTANT SAFETY NOTES**:
- **Never interact while driving**
- **Use voice feedback when available**
- **Have co-pilot handle navigation**
- **Pull over for adjustments**
- **Keep eyes on road**

## Known Limitations

1. **GPS Accuracy**: Urban canyons may affect accuracy
2. **Tunnel/Bridge**: GPS signal lost temporarily  
3. **Battery Drain**: High with screen + GPS
4. **Data Usage**: Requires internet for map tiles
5. **Browser Limits**: Some browsers limit background GPS

## Future Enhancements

### Planned Features
- [ ] Voice turn-by-turn instructions
- [ ] Offline map support
- [ ] Speed limit warnings
- [ ] ETA calculations
- [ ] Route optimization on-the-fly
- [ ] Coverage statistics dashboard
- [ ] Multi-stop support
- [ ] Night mode auto-switch
- [ ] Breadcrumb recording
- [ ] Team member positions

## Support

### Reporting Issues
Include in bug reports:
- Browser and version
- Device type
- Route ID
- Time of issue
- Screenshot/video
- Console errors (F12)

### Getting Help
- Check this guide first
- Review console for errors
- Verify route data exists
- Test with different browser
- Contact development team

## Appendix: Technical Details

### Technology Stack
- **Frontend**: Next.js 15 with TypeScript
- **Mapping**: Mapbox GL JS v3
- **Location**: Browser Geolocation API
- **Routing**: OpenRouteService API
- **Database**: PostgreSQL with PostGIS

### Browser Compatibility
- ✅ Chrome 90+
- ✅ Edge 90+
- ✅ Safari 14+
- ✅ Firefox 88+
- ⚠️ Opera (untested)
- ❌ Internet Explorer

### GPS Requirements
- Hardware GPS preferred
- WiFi positioning fallback
- Cell tower triangulation
- Minimum accuracy: 50m

---

*Last Updated: November 2024*
*Version: 1.0.0*