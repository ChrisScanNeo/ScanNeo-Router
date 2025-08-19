# Phase 3: Navigation Features & Mobile App

## Overview

Implement the React Native mobile application with real-time turn-by-turn navigation, off-route detection, rerouting capabilities, and ad-hoc stop support.

## Prerequisites (from Previous Phases)

- [ ] Authentication system (Firebase) configured
- [ ] Reroute API endpoint available
- [ ] Coverage routes and chunks in database
- [ ] Mapbox account and tokens

## Tasks

### 3.1 React Native App Setup

#### Initialize Expo Project

```bash
# Already created in Phase 1, but configure:
cd apps/navigator

# Install core dependencies
npx expo install \
  @rnmapbox/maps \
  expo-location \
  expo-keep-awake \
  expo-speech \
  expo-task-manager \
  @react-navigation/native \
  @react-navigation/stack \
  @react-navigation/bottom-tabs

# Firebase and auth
npm install \
  firebase \
  @react-native-google-signin/google-signin \
  @react-native-async-storage/async-storage

# Utilities
npm install \
  @turf/point-to-line-distance \
  @turf/nearest-point-on-line \
  @turf/distance \
  zustand \
  react-query
```

#### App Configuration

```typescript
// app.config.ts
export default {
  expo: {
    name: 'ScanNeo Navigator',
    slug: 'scanneo-navigator',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.scanneo.navigator',
      infoPlist: {
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Location needed for navigation',
        NSLocationWhenInUseUsageDescription: 'Location needed to show your position',
        UIBackgroundModes: ['location', 'audio'],
      },
    },
    android: {
      package: 'com.scanneo.navigator',
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'FOREGROUND_SERVICE',
      ],
    },
    extra: {
      apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      mapboxToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
      googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      googleAndroidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    },
  },
};
```

### 3.2 Authentication Implementation

```typescript
// services/auth.ts
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  // Your Firebase config
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

export async function signInWithGoogle() {
  try {
    await GoogleSignin.hasPlayServices();
    const { idToken } = await GoogleSignin.signIn();

    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);

    const firebaseToken = await userCredential.user.getIdToken();
    await AsyncStorage.setItem('authToken', firebaseToken);

    return {
      user: userCredential.user,
      token: firebaseToken,
    };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  }
}

export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    await AsyncStorage.setItem('authToken', token);
    return token;
  }
  return AsyncStorage.getItem('authToken');
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function signOut() {
  await auth.signOut();
  await GoogleSignin.signOut();
  await AsyncStorage.removeItem('authToken');
}
```

### 3.3 Navigation State Management

```typescript
// stores/navigationStore.ts
import { create } from 'zustand';
import { Position } from 'expo-location';

interface NavigationState {
  // Route data
  routeId: string | null;
  currentChunkIdx: number;
  currentChunk: ChunkData | null;
  chunks: ChunkData[];

  // Navigation state
  currentPosition: [number, number] | null;
  heading: number;
  speed: number;
  isNavigating: boolean;

  // Instruction state
  currentInstruction: Instruction | null;
  nextInstruction: Instruction | null;
  distanceToNext: number;

  // Rerouting
  isOffRoute: boolean;
  rerouteInProgress: boolean;
  detourRoute: any | null;

  // Actions
  setRoute: (routeId: string) => void;
  updatePosition: (position: Position) => void;
  loadChunk: (idx: number) => Promise<void>;
  nextChunk: () => void;
  startNavigation: () => void;
  stopNavigation: () => void;
  triggerReroute: () => Promise<void>;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  routeId: null,
  currentChunkIdx: 0,
  currentChunk: null,
  chunks: [],
  currentPosition: null,
  heading: 0,
  speed: 0,
  isNavigating: false,
  currentInstruction: null,
  nextInstruction: null,
  distanceToNext: 0,
  isOffRoute: false,
  rerouteInProgress: false,
  detourRoute: null,

  setRoute: (routeId) => set({ routeId, currentChunkIdx: 0 }),

  updatePosition: (position) => {
    const coords: [number, number] = [position.coords.longitude, position.coords.latitude];

    set({
      currentPosition: coords,
      heading: position.coords.heading || 0,
      speed: position.coords.speed || 0,
    });

    // Check if off-route
    const state = get();
    if (state.currentChunk && !state.rerouteInProgress) {
      checkOffRoute(coords, state.currentChunk);
    }
  },

  loadChunk: async (idx) => {
    const { routeId } = get();
    if (!routeId) return;

    const token = await getAuthToken();
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/routes/${routeId}/chunks/${idx}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const chunk = await response.json();
    set({
      currentChunk: chunk,
      currentChunkIdx: idx,
      currentInstruction: chunk.instructions[0],
      nextInstruction: chunk.instructions[1] || null,
    });
  },

  nextChunk: () => {
    const { currentChunkIdx } = get();
    get().loadChunk(currentChunkIdx + 1);
  },

  startNavigation: () => set({ isNavigating: true }),
  stopNavigation: () => set({ isNavigating: false }),

  triggerReroute: async () => {
    const { currentPosition, currentChunk } = get();
    if (!currentPosition || !currentChunk) return;

    set({ rerouteInProgress: true });

    // Find rejoin point (simplified - use last point of chunk)
    const chunkCoords = currentChunk.geometry.coordinates;
    const rejoinPoint = chunkCoords[chunkCoords.length - 1];

    const token = await getAuthToken();
    const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/reroute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        coordinates: [currentPosition, rejoinPoint],
      }),
    });

    const detour = await response.json();
    set({
      detourRoute: detour,
      rerouteInProgress: false,
      isOffRoute: false,
    });
  },
}));
```

### 3.4 Main Navigation Screen

```typescript
// screens/NavigationScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { useNavigationStore } from '../stores/navigationStore';
import distance from '@turf/distance';
import pointToLineDistance from '@turf/point-to-line-distance';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

export default function NavigationScreen({ route }) {
  const { routeId } = route.params;
  const mapRef = useRef<Mapbox.MapView>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

  useKeepAwake(); // Keep screen on during navigation

  const {
    currentPosition,
    currentChunk,
    currentInstruction,
    isNavigating,
    isOffRoute,
    detourRoute,
    setRoute,
    updatePosition,
    loadChunk,
    nextChunk,
    startNavigation,
    stopNavigation,
    triggerReroute
  } = useNavigationStore();

  const [offRouteTimer, setOffRouteTimer] = useState(0);

  // Initialize route
  useEffect(() => {
    setRoute(routeId);
    loadChunk(0);
    startLocationTracking();
    startNavigation();

    return () => {
      stopNavigation();
      Location.stopLocationUpdatesAsync('navigation-tracking');
    };
  }, [routeId]);

  // Start location tracking
  async function startLocationTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location permission is required for navigation');
      return;
    }

    await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
      },
      (location) => {
        updatePosition(location);
        checkProgress(location);
      }
    );
  }

  // Check navigation progress
  function checkProgress(location: Location.LocationObject) {
    if (!currentChunk || !currentInstruction) return;

    const coords: [number, number] = [
      location.coords.longitude,
      location.coords.latitude
    ];

    // Check distance to current instruction
    if (currentInstruction.maneuver?.location) {
      const instructionPoint = {
        type: 'Point' as const,
        coordinates: currentInstruction.maneuver.location
      };

      const currentPoint = {
        type: 'Point' as const,
        coordinates: coords
      };

      const dist = distance(currentPoint, instructionPoint, { units: 'meters' });

      // Approaching instruction point
      if (dist < 50 && currentInstruction.instruction) {
        Speech.speak(currentInstruction.instruction, {
          language: 'en-US',
          rate: 1.0
        });

        // Move to next instruction
        const instructions = currentChunk.instructions;
        const currentIdx = instructions.indexOf(currentInstruction);
        if (currentIdx < instructions.length - 1) {
          useNavigationStore.setState({
            currentInstruction: instructions[currentIdx + 1],
            nextInstruction: instructions[currentIdx + 2] || null
          });
        } else {
          // End of chunk, load next
          nextChunk();
        }
      }
    }

    // Check if off-route
    if (currentChunk.geometry) {
      const line = {
        type: 'Feature' as const,
        properties: {},
        geometry: currentChunk.geometry
      };

      const point = {
        type: 'Point' as const,
        coordinates: coords
      };

      const distToRoute = pointToLineDistance(point, line, { units: 'meters' });

      if (distToRoute > 50) {
        if (!isOffRoute) {
          useNavigationStore.setState({ isOffRoute: true });
        }
      } else {
        if (isOffRoute) {
          useNavigationStore.setState({ isOffRoute: false });
          setOffRouteTimer(0);
        }
      }
    }
  }

  // Handle off-route timer
  useEffect(() => {
    if (isOffRoute) {
      const timer = setTimeout(() => {
        setOffRouteTimer(prev => {
          const newTime = prev + 1;
          if (newTime >= 10) {
            // Off-route for 10 seconds, trigger reroute
            triggerReroute();
            return 0;
          }
          return newTime;
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isOffRoute, offRouteTimer]);

  // Render route line
  const renderRoute = () => {
    if (!currentChunk) return null;

    return (
      <>
        {/* Main route */}
        <Mapbox.ShapeSource
          id="main-route"
          shape={currentChunk.geometry}
        >
          <Mapbox.LineLayer
            id="main-route-line"
            style={{
              lineColor: '#007AFF',
              lineWidth: 6,
              lineOpacity: 0.8
            }}
          />
        </Mapbox.ShapeSource>

        {/* Detour route if rerouting */}
        {detourRoute && (
          <Mapbox.ShapeSource
            id="detour-route"
            shape={detourRoute.features[0].geometry}
          >
            <Mapbox.LineLayer
              id="detour-route-line"
              style={{
                lineColor: '#FF9500',
                lineWidth: 6,
                lineOpacity: 0.9,
                lineDasharray: [2, 1]
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <Mapbox.MapView style={styles.map} ref={mapRef}>
        <Mapbox.Camera
          ref={cameraRef}
          followUserLocation={isNavigating}
          followUserMode="course"
          zoomLevel={16}
          pitch={45}
        />

        <Mapbox.UserLocation
          visible={true}
          showsUserHeadingIndicator={true}
        />

        {renderRoute()}
      </Mapbox.MapView>

      {/* Navigation Info Panel */}
      <View style={styles.infoPanel}>
        {currentInstruction && (
          <View style={styles.instruction}>
            <Text style={styles.instructionText}>
              {currentInstruction.instruction}
            </Text>
            <Text style={styles.distanceText}>
              {currentInstruction.distance}m
            </Text>
          </View>
        )}

        {isOffRoute && (
          <View style={styles.offRouteWarning}>
            <Text style={styles.warningText}>
              Off Route - Rerouting in {10 - offRouteTimer}s
            </Text>
          </View>
        )}
      </View>

      {/* Control Buttons */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => nextChunk()}
        >
          <Text style={styles.buttonText}>Next Chunk</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.stopButton]}
          onPress={() => {
            stopNavigation();
            // Navigate back
          }}
        >
          <Text style={styles.buttonText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  infoPanel: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  instruction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  instructionText: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  distanceText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 8,
  },
  offRouteWarning: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#FF9500',
    borderRadius: 8,
  },
  warningText: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 32,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  stopButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});
```

### 3.5 Ad-hoc Stop Feature

```typescript
// components/AddStopModal.tsx
import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Mapbox from '@rnmapbox/maps';

interface AddStopModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (coordinates: [number, number]) => void;
  currentPosition: [number, number] | null;
}

export default function AddStopModal({
  visible,
  onClose,
  onConfirm,
  currentPosition
}: AddStopModalProps) {
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(null);

  const handleMapPress = (event: any) => {
    const { geometry } = event;
    setSelectedLocation(geometry.coordinates);
  };

  const handleConfirm = async () => {
    if (!selectedLocation || !currentPosition) return;

    // Call reroute API with stop
    const token = await getAuthToken();
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/reroute`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          coordinates: [
            currentPosition,
            selectedLocation,
            // Add original destination/rejoin point
          ],
          radiuses: [50, 50, 50] // Allow some flexibility
        })
      }
    );

    const route = await response.json();
    onConfirm(selectedLocation);
    // Update navigation with new route
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Stop</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <Mapbox.MapView
          style={styles.map}
          onPress={handleMapPress}
        >
          {currentPosition && (
            <Mapbox.Camera
              centerCoordinate={currentPosition}
              zoomLevel={14}
            />
          )}

          {selectedLocation && (
            <Mapbox.PointAnnotation
              id="selected-stop"
              coordinate={selectedLocation}
            >
              <View style={styles.marker} />
            </Mapbox.PointAnnotation>
          )}
        </Mapbox.MapView>

        <TouchableOpacity
          style={[styles.confirmButton, !selectedLocation && styles.disabled]}
          onPress={handleConfirm}
          disabled={!selectedLocation}
        >
          <Text style={styles.confirmText}>Add Stop</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  map: {
    flex: 1,
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: 'white',
  },
  confirmButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  confirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

### 3.6 Coverage Tracking

```typescript
// services/coverageTracking.ts
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

const COVERAGE_TRACKING_TASK = 'coverage-tracking';

// Define the task
TaskManager.defineTask(COVERAGE_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Coverage tracking error:', error);
    return;
  }

  if (data) {
    const { locations } = data as any;
    await uploadCoverageBreadcrumbs(locations);
  }
});

// Start tracking
export async function startCoverageTracking(routeId: string, deviceId: string) {
  await Location.startLocationUpdatesAsync(COVERAGE_TRACKING_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 10000, // Every 10 seconds
    distanceInterval: 20, // Or every 20 meters
    deferredUpdatesInterval: 30000, // Batch updates every 30 seconds
    deferredUpdatesDistance: 100,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Coverage Tracking',
      notificationBody: 'Recording your route coverage',
      notificationColor: '#007AFF',
    },
  });
}

// Upload breadcrumbs
async function uploadCoverageBreadcrumbs(locations: Location.LocationObject[]) {
  const token = await getAuthToken();
  const breadcrumbs = locations.map((loc) => ({
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    timestamp: loc.timestamp,
    accuracy: loc.coords.accuracy,
  }));

  await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/coverage/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      routeId: getCurrentRouteId(),
      deviceId: getDeviceId(),
      breadcrumbs,
    }),
  });
}

// Stop tracking
export async function stopCoverageTracking() {
  await Location.stopLocationUpdatesAsync(COVERAGE_TRACKING_TASK);
}
```

## Testing Checkpoints

### Authentication Tests

- [ ] Google sign-in works on iOS and Android
- [ ] Firebase token retrieved successfully
- [ ] Token sent correctly in API headers
- [ ] Token refresh works when expired

### Navigation Tests

- [ ] GPS tracking starts and updates position
- [ ] Turn-by-turn instructions spoken at right time
- [ ] Chunk transitions work smoothly
- [ ] Map follows user position and heading

### Off-route Detection Tests

- [ ] Detects when >50m from route
- [ ] 10-second timer before rerouting
- [ ] Returns to route detection when back on track
- [ ] Timer resets if user returns to route

### Rerouting Tests

- [ ] Reroute API called with correct coordinates
- [ ] Detour route displayed on map
- [ ] Navigation switches to detour instructions
- [ ] Rejoins original route at target point

### Ad-hoc Stop Tests

- [ ] Stop selection on map works
- [ ] Route recalculated with stop included
- [ ] Navigation proceeds to stop then continues
- [ ] Original route resumed after stop

### Coverage Tracking Tests

- [ ] Background location updates work
- [ ] Breadcrumbs uploaded periodically
- [ ] Server map-matches and updates coverage
- [ ] Battery usage acceptable

## Performance Requirements

- GPS update rate: 1Hz minimum
- Instruction announcement: 3-5 seconds before maneuver
- Off-route detection: < 3 seconds
- Reroute calculation: < 5 seconds
- Battery life: > 4 hours continuous navigation

## Build & Deployment

### Development Build

```bash
# iOS Simulator
npx expo run:ios

# Android Emulator
npx expo run:android

# Physical device (Expo Go)
npx expo start
```

### Production Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

### Configuration Requirements

- Firebase configuration in app
- Google OAuth client IDs for iOS and Android
- Mapbox access token
- API base URL pointing to production

## Deliverables

1. **Navigation App**: Full React Native app with turn-by-turn
2. **Off-route Detection**: Automatic detection and rerouting
3. **Ad-hoc Stops**: Ability to add stops during navigation
4. **Coverage Tracking**: Background GPS breadcrumb recording
5. **Voice Guidance**: Spoken turn-by-turn instructions

## Success Criteria

- [ ] Can navigate a full coverage route chunk by chunk
- [ ] Reroutes automatically when off-route
- [ ] Voice instructions clear and timely
- [ ] Can add stops without disrupting navigation
- [ ] Coverage tracking records driven streets
- [ ] App stays responsive during long routes

## Next Phase Dependencies

This phase provides:

- Mobile app for testing coverage routes (Phase 4)
- Coverage data for admin dashboard (Phase 4)
- Real-world navigation feedback for algorithm improvements
