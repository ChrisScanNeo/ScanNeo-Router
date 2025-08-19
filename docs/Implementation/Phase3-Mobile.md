# Phase 3: Mobile Navigator App

**Status**: 🚧 In Progress  
**Target**: React Native mobile app with real-time navigation

## Overview

Phase 3 creates a React Native mobile application that provides turn-by-turn navigation for the coverage routes generated in Phase 2.

## Goals

- **Real-time Navigation**: Voice-guided turn-by-turn directions
- **Offline Support**: Download maps and routes for offline use
- **Progress Tracking**: Track completion of coverage routes
- **Rerouting**: Handle wrong turns and obstacles
- **Battery Optimization**: Efficient background location tracking

## Architecture

```
/apps/navigator (React Native + Expo)
├── /src
│   ├── /components     # Reusable UI components
│   ├── /screens        # App screens
│   ├── /navigation     # Navigation logic
│   ├── /services       # API calls
│   ├── /hooks          # Custom hooks
│   └── /utils          # Helper functions
├── /assets            # Images, sounds
└── app.json           # Expo configuration
```

## Tech Stack

- **Framework**: React Native with Expo
- **Maps**: Mapbox GL Native
- **Navigation**: React Navigation v6
- **State**: Zustand
- **Location**: expo-location
- **Storage**: AsyncStorage + SQLite
- **Audio**: expo-speech (TTS)
- **Background**: expo-background-fetch

## Implementation Plan

### Step 1: Project Setup

```bash
# Initialize React Native app
cd apps/navigator
npx create-expo-app --template blank-typescript
```

### Step 2: Core Dependencies

```json
{
  "dependencies": {
    "@react-navigation/native": "^6.1.9",
    "@react-navigation/stack": "^6.3.20",
    "@mapbox/mapbox-gl-native": "^10.0.0",
    "expo-location": "^16.5.5",
    "expo-speech": "^11.7.0",
    "expo-sqlite": "^13.2.2",
    "zustand": "^4.4.7",
    "react-native-async-storage": "^1.21.0"
  }
}
```

### Step 3: Screen Structure

- **MapScreen**: Main navigation view
- **RoutesScreen**: Available coverage routes
- **SettingsScreen**: App preferences
- **HistoryScreen**: Completed sessions

### Step 4: Key Features

#### 4.1 Map Integration

- Display Mapbox map with current location
- Show coverage route as overlay
- Highlight current segment
- Display turn arrows and directions

#### 4.2 Turn-by-Turn Navigation

- Voice instructions using TTS
- Visual turn indicators
- Distance to next turn
- ETA calculations

#### 4.3 Progress Tracking

- Mark completed route segments
- Calculate coverage percentage
- Sync progress to admin dashboard
- Handle pause/resume

#### 4.4 Offline Mode

- Download route data locally
- Cache map tiles for area
- Work without internet connection
- Sync when reconnected

#### 4.5 Rerouting

- Detect when driver goes off-route
- Calculate new path to next waypoint
- Update voice guidance
- Minimize coverage gaps

## API Integration

### Endpoints Used

```typescript
// Get available routes
GET /api/coverage/routes

// Start navigation session
POST /api/navigation/start
{
  "routeId": "uuid",
  "deviceId": "device-uuid"
}

// Update progress
PUT /api/navigation/progress
{
  "sessionId": "uuid",
  "segmentIndex": 5,
  "location": { "lat": 51.5074, "lng": -0.1276 }
}

// Request reroute
POST /api/navigation/reroute
{
  "sessionId": "uuid",
  "currentLocation": { "lat": 51.5074, "lng": -0.1276 },
  "targetSegment": 8
}
```

## State Management

### Navigation Store

```typescript
interface NavigationState {
  // Current session
  sessionId: string | null;
  routeData: RouteData | null;
  currentSegment: number;

  // Location
  currentLocation: Location | null;
  heading: number;
  speed: number;

  // Progress
  completedSegments: number[];
  totalDistance: number;
  elapsedTime: number;

  // Voice
  isVoiceEnabled: boolean;
  lastInstruction: string;

  // Actions
  startNavigation: (routeId: string) => Promise<void>;
  updateLocation: (location: Location) => void;
  completeSegment: (segmentId: number) => void;
  requestReroute: () => Promise<void>;
}
```

## Testing Strategy

### Unit Tests

- Navigation logic
- Route calculations
- Voice instruction generation
- Progress tracking

### Integration Tests

- API communication
- Location updates
- Offline/online sync
- Background mode

### E2E Tests (Detox)

- Complete navigation flow
- Rerouting scenarios
- Voice guidance
- Progress persistence

## Performance Considerations

### Battery Optimization

- Use significant location changes only
- Reduce GPS frequency when on route
- Pause tracking when stationary
- Background app refresh limits

### Memory Management

- Lazy load route segments
- Clear old location history
- Optimize map tile caching
- Release resources on pause

### Network Efficiency

- Batch API updates
- Cache route data locally
- Compress location data
- Use delta sync for progress

## Build & Deployment

### Development

```bash
# Start development server
npx expo start

# Run on device
npx expo start --tunnel
```

### Production (EAS Build)

```bash
# Configure EAS
npx eas build:configure

# Build for iOS/Android
npx eas build --platform all

# Submit to stores
npx eas submit
```

## Permissions Required

### iOS (Info.plist)

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Navigation requires location access</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Background location tracking for route completion</string>

<key>NSSpeechRecognitionUsageDescription</key>
<string>Voice guidance for turn-by-turn navigation</string>
```

### Android (android/app/src/main/AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

## Success Metrics

- **Accuracy**: GPS tracking within 5m accuracy
- **Battery**: <5% battery drain per hour
- **Performance**: 60fps map rendering
- **Voice**: Clear TTS in 2+ languages
- **Offline**: 24h+ offline operation
- **Sync**: Real-time progress updates

## Timeline

- **Week 1**: Project setup + basic navigation
- **Week 2**: Map integration + location tracking
- **Week 3**: Turn-by-turn + voice guidance
- **Week 4**: Offline mode + data sync
- **Week 5**: Rerouting + error handling
- **Week 6**: Polish + testing + deployment

---

**Next**: Once Phase 3 is complete, Phase 4 will implement the Python worker service for advanced route optimization and background processing.
