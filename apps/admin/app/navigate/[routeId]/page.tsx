'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Types
interface RouteData {
  id: string;
  geometry: {
    type: string;
    coordinates: number[][];
  };
  metadata?: {
    route?: {
      geometry?: {
        coordinates: number[][];
      };
    };
  };
}

interface NavigationState {
  currentPosition: [number, number] | null;
  heading: number;
  speed: number;
  isNavigating: boolean;
  offRoute: boolean;
  offRouteTimer: number;
  coveredSegments: Set<number>;
  currentSegmentIndex: number;
}

export default function NavigationPage() {
  console.log('🚗 Navigation component loaded');

  const params = useParams();
  const routeId = params.routeId as string;

  console.log('Route ID:', routeId);

  // Map references
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const userMarker = useRef<mapboxgl.Marker | null>(null);
  const watchId = useRef<number | null>(null);

  // State
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navState, setNavState] = useState<NavigationState>({
    currentPosition: null,
    heading: 0,
    speed: 0,
    isNavigating: false,
    offRoute: false,
    offRouteTimer: 0,
    coveredSegments: new Set(),
    currentSegmentIndex: 0,
  });

  const [mapReady, setMapReady] = useState(false);
  const [initializing, setInitializing] = useState(false);

  // Initialize map
  useEffect(() => {
    console.log('🗺️ Map initialization useEffect triggered');

    // Prevent multiple initialization attempts
    if (initializing || map.current) {
      console.log('Skipping map init - already initializing or exists');
      return;
    }

    // Add a small delay to ensure DOM is ready
    const initMap = () => {
      if (!mapContainer.current) {
        console.log('Container not ready, retrying...');
        setTimeout(initMap, 100);
        return;
      }

      if (map.current) {
        console.log('Skipping map init - map already exists');
        return;
      }

      console.log('Starting map initialization...');
      setInitializing(true);

      console.log('Container ready, initializing map...');
      console.log(
        'Container dimensions:',
        mapContainer.current?.offsetWidth,
        'x',
        mapContainer.current?.offsetHeight
      );

      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
      console.log('Token check:', token ? 'Token present' : 'Token missing');

      if (!token) {
        console.error('No Mapbox token found');
        setError('Mapbox token not found. Check NEXT_PUBLIC_MAPBOX_TOKEN environment variable.');
        return;
      }

      try {
        mapboxgl.accessToken = token;
        console.log('Initializing Mapbox with token:', token.substring(0, 20) + '...');

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v11', // Use basic style instead of navigation-day-v1
          center: [-1.055, 50.805], // Default center
          zoom: 16,
          pitch: 0, // Remove pitch for simpler rendering
          bearing: 0,
        });

        console.log('Mapbox instance created successfully');

        // Add timeout for loading
        let timeoutTriggered = false;
        const timeoutId = setTimeout(() => {
          timeoutTriggered = true;
          console.warn('⏰ Map loading timeout after 10 seconds');
          setError('Map loading timeout - please check your internet connection');
        }, 10000);

        map.current.on('load', () => {
          console.log('✅ Map loaded successfully');

          // Clear timeout since map loaded successfully
          if (!timeoutTriggered) {
            clearTimeout(timeoutId);
            console.log('🕒 Loading timeout cleared');
          }

          // Clear any previous errors and set map as ready
          setError(null);
          setMapReady(true);
          setInitializing(false);

          // Force resize to ensure map displays correctly
          setTimeout(() => {
            map.current?.resize();
            console.log('📐 Map resized after load');
          }, 100);

          // Add navigation controls
          map.current?.addControl(new mapboxgl.NavigationControl(), 'top-right');

          // Create user location marker
          const el = document.createElement('div');
          el.className = 'user-location-marker';
          el.style.width = '20px';
          el.style.height = '20px';
          el.style.borderRadius = '50%';
          el.style.backgroundColor = '#007AFF';
          el.style.border = '3px solid white';
          el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';

          userMarker.current = new mapboxgl.Marker(el).setLngLat([0, 0]).addTo(map.current!);
        });

        // Add error handling
        map.current.on('error', (e) => {
          console.error('❌ Mapbox error:', e);
          clearTimeout(timeoutId); // Clear timeout on error too
          setInitializing(false);
          setError(`Map loading failed: ${e.error?.message || 'Unknown error'}`);
        });
      } catch (err) {
        console.error('❌ Error creating Mapbox instance:', err);
        setInitializing(false);
        setError(
          `Failed to initialize map: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    };

    // Start initialization
    initMap();

    return () => {
      console.log('🧹 Cleaning up map');
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setMapReady(false);
      setInitializing(false);
    };
  }, []); // Remove mapReady dependency to prevent re-runs

  // Load route data
  useEffect(() => {
    console.log('🔄 Loading route data useEffect triggered');

    const loadRoute = async () => {
      try {
        console.log('🌐 Fetching route data from navigation API...');
        const response = await fetch(`/api/navigation/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ routeId }),
        });

        console.log('📡 Navigation API response:', response.status);

        if (!response.ok) {
          // Fallback to regular route API
          const routeResponse = await fetch(`/api/routes/${routeId}`);
          if (!routeResponse.ok) throw new Error('Failed to load route');

          const data = await routeResponse.json();

          // Extract coordinates from metadata (nested structure)
          const coordinates =
            data.metadata?.route?.route?.geometry?.coordinates ||
            data.metadata?.route?.geometry?.coordinates ||
            data.geojson?.coordinates ||
            [];

          setRouteData({
            id: routeId,
            geometry: {
              type: 'LineString',
              coordinates: coordinates,
            },
            metadata: data.metadata,
          });
        } else {
          const data = await response.json();
          console.log('✅ Route data received:', {
            id: data.id,
            coordinatesLength: data.geometry?.coordinates?.length || 0,
            hasMetadata: !!data.metadata,
          });
          setRouteData(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load route');
      } finally {
        setLoading(false);
      }
    };

    loadRoute();
  }, [routeId]);

  // Draw route on map
  useEffect(() => {
    console.log('🎨 Draw route useEffect triggered:', {
      hasMap: !!map.current,
      mapReady: mapReady,
      hasRouteData: !!routeData,
      coordinatesLength: routeData?.geometry?.coordinates?.length || 0,
    });

    if (!map.current || !mapReady || !routeData || !routeData.geometry.coordinates.length) {
      console.log('❌ Skipping route draw - missing requirements');
      return;
    }

    const onMapLoad = () => {
      console.log('🗺️ Drawing route on map...');
      // Remove existing route layers
      if (map.current?.getSource('route')) {
        map.current.removeLayer('route-upcoming');
        map.current.removeLayer('route-covered');
        map.current.removeSource('route');
      }

      // Process coordinates to separate segments (avoid straight lines between distant points)
      const processedSegments: [number, number][][] = [];
      const coords = routeData.geometry.coordinates;
      const maxSegmentDistance = 0.005; // ~500m max distance between consecutive points

      let currentSegment: [number, number][] = [];
      for (let i = 0; i < coords.length; i++) {
        const currentPoint = coords[i] as [number, number];

        // Add first point or if within reasonable distance
        if (currentSegment.length === 0) {
          currentSegment.push(currentPoint);
        } else {
          const lastPoint = currentSegment[currentSegment.length - 1];
          const distance = Math.sqrt(
            Math.pow(currentPoint[0] - lastPoint[0], 2) +
              Math.pow(currentPoint[1] - lastPoint[1], 2)
          );

          // If distance is too large, start a new segment
          if (distance > maxSegmentDistance) {
            if (currentSegment.length > 1) {
              processedSegments.push([...currentSegment]);
            }
            currentSegment = [currentPoint];
          } else {
            currentSegment.push(currentPoint);
          }
        }
      }

      // Add final segment
      if (currentSegment.length > 1) {
        processedSegments.push(currentSegment);
      }

      console.log(`📍 Split route into ${processedSegments.length} segments`);

      // Add route source as MultiLineString
      map.current?.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiLineString',
            coordinates: processedSegments,
          },
        },
      });

      // Add upcoming route layer (blue)
      map.current?.addLayer({
        id: 'route-upcoming',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#007AFF',
          'line-width': 6,
          'line-opacity': 0.8,
        },
      });

      // Add covered route layer (green) - will be updated as we progress
      map.current?.addLayer({
        id: 'route-covered',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#00B140',
          'line-width': 8,
          'line-opacity': 0.9,
        },
        filter: ['==', '$id', 'none'], // Initially hide
      });

      // Fit map to route bounds
      const bounds = new mapboxgl.LngLatBounds();
      processedSegments.forEach((segment) => {
        segment.forEach((coord) => {
          bounds.extend(coord as [number, number]);
        });
      });
      map.current?.fitBounds(bounds, { padding: 50 });

      console.log('✅ Route drawn successfully on map with', processedSegments.length, 'segments');
    };

    if (map.current?.loaded()) {
      onMapLoad();
    } else {
      map.current?.on('load', onMapLoad);
    }
  }, [routeData, mapReady]); // Add mapReady dependency

  // Start navigation
  const startNavigation = useCallback(() => {
    console.log('🚀 Starting GPS navigation...');

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setNavState((prev) => ({ ...prev, isNavigating: true }));

    // Watch position with enhanced options
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const newPosition: [number, number] = [position.coords.longitude, position.coords.latitude];

        const accuracy = position.coords.accuracy;
        console.log(
          `📍 GPS Update: ${newPosition[1].toFixed(6)}, ${newPosition[0].toFixed(6)} (±${accuracy.toFixed(0)}m)`
        );

        setNavState((prev) => ({
          ...prev,
          currentPosition: newPosition,
          heading: position.coords.heading || prev.heading,
          speed: position.coords.speed || 0,
        }));

        // Update user marker
        if (userMarker.current) {
          userMarker.current.setLngLat(newPosition);
          console.log('📌 User marker updated');
        }

        // Center map on user (less aggressive following)
        if (map.current && navState.isNavigating) {
          map.current.easeTo({
            center: newPosition,
            bearing: position.coords.heading || map.current.getBearing(),
            duration: 2000,
            zoom: Math.max(map.current.getZoom(), 17), // Ensure good zoom level
          });
        }

        // Check route progress and coverage
        checkRouteProgress(newPosition);
      },
      (error) => {
        console.error('Position error:', error);
        setError(`Location error: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      }
    );
  }, [navState.isNavigating]);

  // Check route progress and off-route status
  const checkRouteProgress = useCallback(
    (position: [number, number]) => {
      if (!routeData) return;

      console.log('🔍 Checking route progress...');

      // Find minimum distance to any route segment
      const coords = routeData.geometry.coordinates;
      let minDistance = Infinity;
      let nearestSegmentIndex = -1;

      // Check distance to each consecutive pair of coordinates (simple line segments)
      for (let i = 0; i < coords.length - 1; i++) {
        const segmentDistance = distanceToLineSegment(
          position,
          coords[i] as [number, number],
          coords[i + 1] as [number, number]
        );
        if (segmentDistance < minDistance) {
          minDistance = segmentDistance;
          nearestSegmentIndex = i;
        }
      }

      const distanceInMeters = minDistance * 111000; // Rough conversion to meters
      console.log(`📏 Distance to route: ${distanceInMeters.toFixed(1)}m`);

      if (distanceInMeters > 50) {
        // Off route
        console.log('🔴 OFF ROUTE detected');
        setNavState((prev) => ({
          ...prev,
          offRoute: true,
          offRouteTimer: prev.offRouteTimer + 1,
        }));
      } else {
        // On route
        console.log('🟢 ON ROUTE');
        setNavState((prev) => ({ ...prev, offRoute: false, offRouteTimer: 0 }));

        // Mark segment as covered
        if (nearestSegmentIndex >= 0) {
          setNavState((prev) => {
            const newCovered = new Set(prev.coveredSegments);
            const wasNew = !newCovered.has(nearestSegmentIndex);
            newCovered.add(nearestSegmentIndex);

            if (wasNew) {
              console.log(`✅ New segment covered: ${nearestSegmentIndex}`);
            }

            return {
              ...prev,
              coveredSegments: newCovered,
              currentSegmentIndex: nearestSegmentIndex,
            };
          });
        }
      }
    },
    [routeData]
  );

  // Distance calculation functions
  const distanceToLineSegment = (
    point: [number, number],
    lineStart: [number, number],
    lineEnd: [number, number]
  ): number => {
    const [px, py] = point;
    const [x1, y1] = lineStart;
    const [x2, y2] = lineEnd;

    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Simple distance calculation (Haversine)
  const calculateDistance = (coord1: [number, number], coord2: [number, number]): number => {
    const R = 6371000; // Earth radius in meters
    const lat1 = (coord1[1] * Math.PI) / 180;
    const lat2 = (coord2[1] * Math.PI) / 180;
    const deltaLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
    const deltaLon = ((coord2[0] - coord1[0]) * Math.PI) / 180;

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const findMinDistanceToRoute = (position: [number, number], route: number[][]): number => {
    let minDist = Infinity;
    for (const coord of route) {
      const dist = calculateDistance(position, coord as [number, number]);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  };

  const findNearestSegment = (position: [number, number], route: number[][]): number => {
    let minDist = Infinity;
    let nearestIdx = -1;

    for (let i = 0; i < route.length; i++) {
      const dist = calculateDistance(position, route[i] as [number, number]);
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }

    return nearestIdx;
  };

  const updateCoveredRoute = (upToIndex: number) => {
    if (!map.current || !routeData) return;

    // Create covered route up to current position
    const coveredCoords = routeData.geometry.coordinates.slice(0, upToIndex + 1);

    if (map.current.getSource('route-covered')) {
      (map.current.getSource('route-covered') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coveredCoords,
        },
      });
    } else {
      map.current.addSource('route-covered', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coveredCoords,
          },
        },
      });
    }
  };

  // Stop navigation
  const stopNavigation = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setNavState((prev) => ({ ...prev, isNavigating: false }));
  }, []);

  // Handle off-route timer
  useEffect(() => {
    if (navState.offRoute && navState.isNavigating) {
      const timer = setTimeout(() => {
        setNavState((prev) => ({
          ...prev,
          offRouteTimer: prev.offRouteTimer + 1,
        }));

        if (navState.offRouteTimer >= 10) {
          // Trigger reroute
          handleReroute();
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [navState.offRoute, navState.offRouteTimer, navState.isNavigating]);

  const handleReroute = async () => {
    if (!navState.currentPosition || !routeData) return;

    try {
      // Find nearest point on route to rejoin
      const nearestIdx = findNearestSegment(
        navState.currentPosition,
        routeData.geometry.coordinates
      );
      const rejoinPoint = routeData.geometry.coordinates[nearestIdx];

      const response = await fetch('/api/navigation/reroute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPosition: navState.currentPosition,
          rejoinPoint: rejoinPoint,
          routeId: routeId,
        }),
      });

      if (response.ok) {
        const rerouteData = await response.json();
        // Update route with reroute path
        console.log('Reroute calculated:', rerouteData);
        setNavState((prev) => ({ ...prev, offRoute: false, offRouteTimer: 0 }));
      }
    } catch (err) {
      console.error('Reroute failed:', err);
    }
  };

  // Calculate progress percentage
  const progressPercentage = routeData
    ? (navState.coveredSegments.size / routeData.geometry.coordinates.length) * 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-2xl mb-4">Loading route...</div>
          <div className="text-sm opacity-70">Preparing navigation interface</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-2xl text-red-500 mb-4">Error</div>
          <div className="mb-4">{error}</div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!routeData || !routeData.geometry.coordinates.length) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="text-2xl text-yellow-500 mb-4">No Route Data</div>
          <div className="mb-4">This route doesn&apos;t have navigation coordinates</div>
          <div className="text-sm opacity-70">The route may still be processing</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Map Container */}
      <div
        ref={mapContainer}
        className="absolute inset-0 w-full h-full"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1,
        }}
      />

      {/* Map Loading Overlay */}
      {!mapReady && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center z-50">
          <div className="text-white text-center">
            <div className="text-2xl mb-4">Loading Map...</div>
            <div className="text-sm opacity-70 mb-2">Initializing Mapbox GL</div>
            <div className="text-xs opacity-50">Check browser console (F12) for details</div>
            {/* Loading spinner */}
            <div className="mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation HUD */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none z-10">
        {/* Progress Bar */}
        <div className="bg-black/70 backdrop-blur rounded-lg p-4 mb-4 pointer-events-auto">
          <div className="flex justify-between text-white mb-2">
            <span className="text-lg font-semibold">Route Progress</span>
            <span className="text-lg">{progressPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className="bg-green-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Turn-by-Turn Instructions */}
        {navState.isNavigating && (
          <div className="bg-blue-600/90 backdrop-blur rounded-lg p-4 mb-4 pointer-events-auto">
            <div className="text-white text-center">
              <div className="text-2xl font-bold mb-2">🧭</div>
              <div className="text-lg font-semibold">
                {navState.offRoute ? 'Return to Route' : 'Follow Coverage Route'}
              </div>
              <div className="text-sm opacity-90">
                {navState.offRoute
                  ? 'Navigate back to the blue route line'
                  : `Segment ${navState.currentSegmentIndex + 1} of ${routeData?.geometry.coordinates.length || 0}`}
              </div>
            </div>
          </div>
        )}

        {/* Speed and Status */}
        <div className="flex justify-between">
          <div className="bg-black/70 backdrop-blur rounded-lg p-4 pointer-events-auto">
            <div className="text-white">
              <div className="text-sm opacity-70">Speed</div>
              <div className="text-2xl font-bold">
                {navState.speed ? `${(navState.speed * 3.6).toFixed(0)} km/h` : '0 km/h'}
              </div>
            </div>
          </div>

          {navState.offRoute && (
            <div className="bg-red-600/90 backdrop-blur rounded-lg p-4 pointer-events-auto animate-pulse">
              <div className="text-white text-center">
                <div className="text-lg font-bold">OFF ROUTE</div>
                <div className="text-sm">Rerouting in {10 - navState.offRouteTimer}s</div>
              </div>
            </div>
          )}

          {/* Debug Info */}
          <div className="bg-black/70 backdrop-blur rounded-lg p-3 pointer-events-auto text-xs text-white">
            <div>Route Points: {routeData?.geometry.coordinates.length || 0}</div>
            <div>
              GPS:{' '}
              {navState.currentPosition
                ? `${navState.currentPosition[1].toFixed(6)}, ${navState.currentPosition[0].toFixed(6)}`
                : 'No location'}
            </div>
            <div>Map: {map.current ? 'Loaded' : 'Loading'}</div>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
        <div className="flex gap-4">
          {!navState.isNavigating ? (
            <button
              onClick={startNavigation}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xl font-bold py-6 px-8 rounded-lg shadow-lg transition-colors"
            >
              Start Navigation
            </button>
          ) : (
            <>
              <button
                onClick={stopNavigation}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xl font-bold py-6 px-8 rounded-lg shadow-lg transition-colors"
              >
                Stop Navigation
              </button>
              <button
                onClick={() => setNavState((prev) => ({ ...prev, offRoute: true }))}
                className="bg-yellow-600 hover:bg-yellow-700 text-white text-xl font-bold py-6 px-8 rounded-lg shadow-lg transition-colors"
              >
                Test Reroute
              </button>
            </>
          )}
        </div>
      </div>

      {/* Debug Info (remove in production) */}
      <div className="absolute top-4 right-4 bg-black/50 text-white text-xs p-2 rounded">
        <div>
          Segments: {navState.coveredSegments.size} / {routeData?.geometry.coordinates.length || 0}
        </div>
        <div>
          Position: {navState.currentPosition?.map((c) => c.toFixed(5)).join(', ') || 'Unknown'}
        </div>
        <div>Off Route: {navState.offRoute ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
}
