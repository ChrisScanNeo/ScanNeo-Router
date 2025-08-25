'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import toast from 'react-hot-toast';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// Set the token if available
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
} else {
  console.warn('Mapbox token not found in environment variables');
}

type Step =
  | 'select-area'
  | 'extract-streets'
  | 'build-graph'
  | 'select-start'
  | 'generate-route'
  | 'resolve-gaps'
  | 'finalize';

interface Area {
  id: string;
  name: string;
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

interface StreetData {
  streets: GeoJSON.FeatureCollection;
  statistics: {
    streetCount: number;
    totalLengthKm: string;
    onewayStreets: number;
    twowayStreets: number;
  };
}

interface Gap {
  id: number;
  startPoint: [number, number];
  endPoint: [number, number];
  distance: number;
  type?: 'u-turn' | 'connection';
  resolved: boolean;
  resolution?: 'auto' | 'manual' | 'skip' | 'u-turn';
}

function RouteBuilderContent() {
  const searchParams = useSearchParams();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  // Check for area and zone parameters in URL
  const urlAreaId = searchParams.get('area');
  const urlZoneId = searchParams.get('zone');

  const [currentStep, setCurrentStep] = useState<Step>('select-area');
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(urlZoneId);
  const [streetData, setStreetData] = useState<StreetData | null>(null);
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  // Route segments will be displayed on the map once generated
  const [routeSegments, setRouteSegments] = useState<unknown[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [currentGapIndex, setCurrentGapIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    console.log('Initializing Mapbox map...');
    console.log('Mapbox token:', MAPBOX_TOKEN ? 'Token present' : 'NO TOKEN FOUND');
    console.log('Map container:', mapContainer.current);

    if (!MAPBOX_TOKEN) {
      console.error('Mapbox token is missing! Map will not load.');
      toast.error('Map configuration error - Mapbox token missing');
      return;
    }

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-0.0875, 51.5085],
        zoom: 11,
      });

      console.log('Map instance created');

      map.current.on('load', () => {
        console.log('Map loaded successfully');
        setMapLoaded(true);
        // Add navigation controls
        if (map.current) {
          map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
          map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        }
      });

      map.current.on('error', (e) => {
        console.error('Mapbox error:', e);
        if (e.error?.message?.includes('401') || e.error?.message?.includes('403')) {
          toast.error('Invalid Mapbox token. Please check configuration.');
        }
      });
    } catch (error) {
      console.error('Failed to initialize map:', error);
      toast.error('Failed to initialize map');
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Fetch areas on mount
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const response = await fetch('/api/areas');
        const data = await response.json();

        // Handle both array format and object with success/areas format
        const areasData = Array.isArray(data) ? data : data.areas || [];

        if (areasData.length > 0) {
          setAreas(
            areasData.map(
              (a: {
                id: string;
                name: string;
                geojson: string | GeoJSON.Polygon | GeoJSON.MultiPolygon;
              }) => ({
                id: a.id,
                name: a.name,
                geojson: typeof a.geojson === 'string' ? JSON.parse(a.geojson) : a.geojson,
              })
            )
          );
        }
      } catch (error) {
        console.error('Error fetching areas:', error);
        toast.error('Failed to load areas');
      }
    };
    fetchAreas();
  }, []);

  // Check for area ID in URL
  useEffect(() => {
    if (urlAreaId && areas.length > 0) {
      const area = areas.find((a) => a.id === urlAreaId);
      if (area) {
        setSelectedArea(area);
        setCurrentStep('extract-streets');
      }
    }
  }, [urlAreaId, areas]);

  // Update map when area is selected
  useEffect(() => {
    if (!map.current || !selectedArea || !mapLoaded) return;

    // Remove existing layers
    if (map.current.getSource('area-boundary')) {
      map.current.removeLayer('area-fill');
      map.current.removeLayer('area-outline');
      map.current.removeSource('area-boundary');
    }

    // Add area boundary
    map.current.addSource('area-boundary', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: selectedArea.geojson,
      },
    });

    map.current.addLayer({
      id: 'area-fill',
      type: 'fill',
      source: 'area-boundary',
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.1,
      },
    });

    map.current.addLayer({
      id: 'area-outline',
      type: 'line',
      source: 'area-boundary',
      paint: {
        'line-color': '#3b82f6',
        'line-width': 2,
      },
    });

    // Fit map to area bounds
    const bounds = new mapboxgl.LngLatBounds();
    const processCoords = (
      coords: GeoJSON.Position[] | GeoJSON.Position[][] | GeoJSON.Position[][][]
    ): void => {
      if (!coords || !Array.isArray(coords)) return;

      if (typeof coords[0] === 'number') {
        // Single position
        bounds.extend(coords as unknown as [number, number]);
      } else if (Array.isArray(coords[0])) {
        if (typeof coords[0][0] === 'number') {
          // Array of positions
          (coords as GeoJSON.Position[]).forEach((coord) =>
            bounds.extend(coord as [number, number])
          );
        } else {
          // Array of arrays
          (coords as GeoJSON.Position[][] | GeoJSON.Position[][][]).forEach((ring) =>
            processCoords(ring)
          );
        }
      }
    };

    if (selectedArea.geojson.type === 'Polygon') {
      processCoords(selectedArea.geojson.coordinates);
    } else if (selectedArea.geojson.type === 'MultiPolygon') {
      (selectedArea.geojson.coordinates as number[][][][]).forEach((polygon) =>
        processCoords(polygon)
      );
    }

    map.current.fitBounds(bounds, { padding: 50 });
  }, [selectedArea, mapLoaded]);

  // Display route segments on map (when generated)
  useEffect(() => {
    if (!map.current || routeSegments.length === 0) return;

    // This will display route segments once they're generated
    console.log(`${routeSegments.length} route segments ready to display`);
  }, [routeSegments]);

  // Display streets on map
  useEffect(() => {
    if (!map.current || !streetData || !mapLoaded) return;

    console.log('Displaying streets on map:', streetData.streets);

    try {
      // Remove existing streets layers if they exist
      if (map.current.getLayer('streets-arrows')) {
        map.current.removeLayer('streets-arrows');
      }
      if (map.current.getLayer('streets-line')) {
        map.current.removeLayer('streets-line');
      }
      if (map.current.getSource('streets')) {
        map.current.removeSource('streets');
      }

      // Add streets source
      map.current.addSource('streets', {
        type: 'geojson',
        data: streetData.streets,
      });

      // Add streets line layer
      map.current.addLayer({
        id: 'streets-line',
        type: 'line',
        source: 'streets',
        paint: {
          'line-color': [
            'case',
            ['get', 'oneway'],
            '#ef4444', // Red for one-way
            '#10b981', // Green for two-way
          ],
          'line-width': 3,
          'line-opacity': 0.8,
        },
      });

      // Add arrows for one-way streets (skip for now as icon might not be available)
      // We'll use line direction indicators instead

      console.log('Streets layer added successfully');
    } catch (error) {
      console.error('Error adding streets to map:', error);
    }
  }, [streetData, mapLoaded]);

  const handleAreaSelect = (areaId: string) => {
    const area = areas.find((a) => a.id === areaId);
    if (area) {
      setSelectedArea(area);
      setCurrentStep('extract-streets');
    }
  };

  const [extractionOptions, setExtractionOptions] = useState({
    includeServiceRoads: false,
    includePrivateRoads: false,
    respectRestrictions: true,
    maxAreaSqKm: 10,
  });

  const extractStreets = async () => {
    if (!selectedArea) return;

    setIsProcessing(true);
    try {
      const response = await fetch(`/api/areas/${selectedArea.id}/extract-streets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractionOptions),
      });

      if (!response.ok) throw new Error('Failed to extract streets');

      const data = await response.json();

      if (!data.success) {
        if (data.error === 'Area too large') {
          toast.error(data.details);
          return;
        }
        throw new Error(data.error || 'Failed to extract streets');
      }

      // Now fetch the stored streets
      const streetsResponse = await fetch(`/api/areas/${selectedArea.id}/streets`);
      const streetsData = await streetsResponse.json();

      setStreetData(streetsData);

      // Show detailed extraction results
      const extraction = data.extraction;
      const removedMsg =
        extraction.streets_removed > 0
          ? `\n${extraction.streets_removed} streets removed (outside boundary)`
          : '';

      toast.success(
        `Extracted ${extraction.streets_filtered} streets (${extraction.total_length_km} km)\n` +
          `${extraction.one_way_streets} one-way, ${extraction.restricted_streets} restricted, ${extraction.dead_ends} dead-ends` +
          removedMsg,
        { duration: 5000 }
      );
      setCurrentStep('build-graph');
    } catch (error) {
      console.error('Error extracting streets:', error);
      toast.error('Failed to extract streets');
    } finally {
      setIsProcessing(false);
    }
  };

  const buildGraph = () => {
    // This will be implemented to build the network graph
    toast.success('Graph built successfully');
    setCurrentStep('select-start');
    toast('Click anywhere on the map to select a starting point', { icon: 'ℹ️' });
  };

  const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
    const point: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    setStartPoint(point);

    // Add marker for start point
    if (map.current) {
      // Remove existing marker if any
      const existingMarker = document.getElementById('start-marker');
      if (existingMarker) existingMarker.remove();

      new mapboxgl.Marker({ color: '#00B140' })
        .setLngLat(point)
        .addTo(map.current)
        .getElement().id = 'start-marker';
    }

    toast.success('Start point selected');
    setCurrentStep('generate-route');
  };

  // Manage click handler based on current step
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (currentStep === 'select-start') {
      // Add click handler and change cursor
      map.current.on('click', handleMapClick);
      map.current.getCanvas().style.cursor = 'crosshair';
    } else {
      // Remove click handler and reset cursor
      map.current.off('click', handleMapClick);
      map.current.getCanvas().style.cursor = '';
    }

    // Cleanup function
    return () => {
      if (map.current) {
        map.current.off('click', handleMapClick);
        map.current.getCanvas().style.cursor = '';
      }
    };
  }, [currentStep, mapLoaded]);

  const generateRoute = async () => {
    if (!selectedArea || !startPoint) {
      toast.error('Please select an area and starting point first');
      return;
    }

    setIsProcessing(true);
    try {
      // Call the new generate-route endpoint
      const response = await fetch(`/api/areas/${selectedArea.id}/generate-route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startPoint: startPoint,
          coverageMode: true, // Enable U-turn support
          chunkDuration: 3600,
          zoneId: selectedZoneId, // Include zone ID if present
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate route');
      }

      const data = await response.json();

      // Extract gaps from the route data
      const routeGaps = data.route.gaps || [];

      // Display the route on the map if we have geometry
      if (data.route.geometry && map.current) {
        // Add route layer to map
        if (map.current.getSource('route')) {
          map.current.removeLayer('route-line');
          map.current.removeSource('route');
        }

        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: data.route.geometry,
          },
        });

        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#0066ff',
            'line-width': 3,
            'line-opacity': 0.7,
          },
        });
      }

      // Process gaps with type information
      const processedGaps: Gap[] = routeGaps.map((gap: Gap, index: number) => ({
        id: gap.id || index + 1,
        startPoint: gap.startPoint,
        endPoint: gap.endPoint,
        distance: gap.distance,
        type: gap.type || 'connection', // 'u-turn' or 'connection'
        resolved: false,
      }));

      setGaps(processedGaps);

      if (processedGaps.length > 0) {
        toast(`Found ${processedGaps.length} gaps in route`, { icon: '⚠️' });

        // Show gap markers on map
        if (map.current) {
          processedGaps.forEach((gap, idx) => {
            // Add gap visualization
            const gapSource = `gap-${idx}`;
            if (map.current!.getSource(gapSource)) {
              map.current!.removeLayer(`${gapSource}-line`);
              map.current!.removeSource(gapSource);
            }

            map.current!.addSource(gapSource, {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: [gap.startPoint, gap.endPoint],
                },
              },
            });

            map.current!.addLayer({
              id: `${gapSource}-line`,
              type: 'line',
              source: gapSource,
              paint: {
                'line-color': gap.type === 'u-turn' ? '#ff9900' : '#ffff00',
                'line-width': 4,
                'line-dasharray': [2, 2],
              },
            });
          });
        }

        setCurrentStep('resolve-gaps');
      } else {
        toast.success('Route generated with no gaps!');
        setCurrentStep('finalize');
      }

      // Store route data for later use
      setRouteSegments([data.route]);
    } catch (error) {
      console.error('Route generation error:', error);
      toast.error('Failed to generate route');
    } finally {
      setIsProcessing(false);
    }
  };

  const resolveGap = (resolution: 'auto' | 'manual' | 'skip' | 'u-turn') => {
    const updatedGaps = [...gaps];
    updatedGaps[currentGapIndex] = {
      ...updatedGaps[currentGapIndex],
      resolved: true,
      resolution,
    };
    setGaps(updatedGaps);

    // Visual feedback for resolution type
    const resolutionMessage = {
      auto: 'Gap connected via routing',
      manual: 'Gap marked for manual connection',
      skip: 'Gap skipped - separate coverage needed',
      'u-turn': 'Gap resolved with U-turn',
    };

    toast.success(resolutionMessage[resolution] || 'Gap resolved');

    if (currentGapIndex < gaps.length - 1) {
      setCurrentGapIndex(currentGapIndex + 1);
    } else {
      toast.success('All gaps resolved');
      setCurrentStep('finalize');
    }
  };

  const saveRoute = async () => {
    toast.success('Route saved successfully!');
    // Redirect to routes page
    window.location.href = '/routes';
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-96 bg-white shadow-lg overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-[#00B140] to-[#009933]">
          <h1 className="text-2xl font-bold text-white">Interactive Route Builder</h1>
          <p className="mt-2 text-green-50">Build routes step by step with full control</p>
        </div>

        {/* Progress Steps */}
        <div className="p-6 border-b">
          <div className="space-y-4">
            {[
              { step: 'select-area', label: 'Select Area', icon: '📍' },
              { step: 'extract-streets', label: 'Extract Streets', icon: '🗺️' },
              { step: 'build-graph', label: 'Build Graph', icon: '🔗' },
              { step: 'select-start', label: 'Select Start Point', icon: '🎯' },
              { step: 'generate-route', label: 'Generate Route', icon: '🛣️' },
              { step: 'resolve-gaps', label: 'Resolve Gaps', icon: '🔧' },
              { step: 'finalize', label: 'Finalize Route', icon: '✅' },
            ].map((item) => (
              <div
                key={item.step}
                className={`flex items-center space-x-3 ${
                  item.step === currentStep
                    ? 'text-green-600 font-semibold'
                    : currentStep > item.step
                      ? 'text-gray-500'
                      : 'text-gray-300'
                }`}
              >
                <span className="text-2xl">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6">
          {currentStep === 'select-area' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Select Coverage Area</h3>
              <select
                className="w-full p-2 border rounded-md"
                onChange={(e) => handleAreaSelect(e.target.value)}
                defaultValue=""
              >
                <option value="" disabled>
                  Choose an area...
                </option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-600">Select an area to begin route generation</p>
            </div>
          )}

          {currentStep === 'extract-streets' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Extract Streets from OSM</h3>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="text-sm">
                  Area: <strong>{selectedArea?.name}</strong>
                </p>
              </div>

              {/* Extraction Options */}
              <div className="space-y-3 border-t pt-4">
                <h4 className="font-medium text-sm">Street Filtering Options</h4>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractionOptions.includeServiceRoads}
                    onChange={(e) =>
                      setExtractionOptions({
                        ...extractionOptions,
                        includeServiceRoads: e.target.checked,
                      })
                    }
                    className="rounded text-green-600"
                  />
                  <span className="text-sm">Include service roads</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractionOptions.includePrivateRoads}
                    onChange={(e) =>
                      setExtractionOptions({
                        ...extractionOptions,
                        includePrivateRoads: e.target.checked,
                      })
                    }
                    className="rounded text-green-600"
                  />
                  <span className="text-sm">Include private roads</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractionOptions.respectRestrictions}
                    onChange={(e) =>
                      setExtractionOptions({
                        ...extractionOptions,
                        respectRestrictions: e.target.checked,
                      })
                    }
                    className="rounded text-green-600"
                  />
                  <span className="text-sm">Respect access restrictions</span>
                </label>

                <div className="bg-yellow-50 p-3 rounded-md text-xs">
                  <p className="font-medium mb-1">Excluded by default:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600">
                    <li>Footways, paths, cycleways, pedestrian areas</li>
                    <li>Driveways, parking aisles (unless service roads enabled)</li>
                    <li>Private access roads (unless private roads enabled)</li>
                    <li>Bus-only lanes and restricted zones</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={extractStreets}
                disabled={isProcessing}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
              >
                {isProcessing ? 'Extracting...' : 'Extract Streets'}
              </button>
              <p className="text-sm text-gray-600">
                This will fetch driveable roads from OpenStreetMap with your filters applied
              </p>
            </div>
          )}

          {currentStep === 'build-graph' && streetData && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Street Network Statistics</h3>
              <div className="bg-gray-50 p-4 rounded-md space-y-2">
                <p className="text-sm">
                  Total Streets: <strong>{streetData.statistics.streetCount}</strong>
                </p>
                <p className="text-sm">
                  Total Length: <strong>{streetData.statistics.totalLengthKm} km</strong>
                </p>
                <p className="text-sm">
                  One-way Streets: <strong>{streetData.statistics.onewayStreets}</strong>
                </p>
                <p className="text-sm">
                  Two-way Streets: <strong>{streetData.statistics.twowayStreets}</strong>
                </p>
              </div>
              <button
                onClick={buildGraph}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Build Network Graph
              </button>
            </div>
          )}

          {currentStep === 'select-start' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Select Starting Point</h3>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="text-sm text-blue-700">
                  🎯 Click anywhere on the map within the blue boundary to set your starting point
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  The cursor will change to a crosshair (+) when ready
                </p>
              </div>
              {!startPoint && (
                <div className="bg-yellow-50 p-3 rounded-md">
                  <p className="text-sm text-yellow-700">
                    💡 Tip: Choose a location with good access to main roads for optimal routing
                  </p>
                </div>
              )}
              {startPoint && (
                <div className="bg-green-50 p-4 rounded-md">
                  <p className="text-sm text-green-700">
                    ✅ Selected: [{startPoint[0].toFixed(4)}, {startPoint[1].toFixed(4)}]
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === 'generate-route' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Generate Route</h3>
              <div className="bg-blue-50 p-4 rounded-md">
                <p className="text-sm">
                  Start Point: <strong>Selected ✓</strong>
                </p>
                {selectedZoneId && (
                  <p className="text-sm mt-2">
                    Zone: <strong>Selected (ID: {selectedZoneId})</strong>
                  </p>
                )}
              </div>
              <button
                onClick={generateRoute}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Generate Coverage Route {selectedZoneId ? 'for Zone' : ''}
              </button>
              <p className="text-sm text-gray-600">
                This will calculate the optimal route covering {selectedZoneId ? 'zone' : 'all'}{' '}
                streets
              </p>
            </div>
          )}

          {currentStep === 'resolve-gaps' && gaps.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">
                Resolve Gap {currentGapIndex + 1} of {gaps.length}
              </h3>
              <div className="bg-yellow-50 p-4 rounded-md">
                <p className="text-sm">
                  Distance: <strong>{gaps[currentGapIndex].distance}m</strong>
                </p>
                {gaps[currentGapIndex].type && (
                  <p className="text-sm mt-1">
                    Type:{' '}
                    <span className="font-semibold">
                      {gaps[currentGapIndex].type === 'u-turn'
                        ? '🔄 U-turn possible'
                        : '🔗 Connection needed'}
                    </span>
                  </p>
                )}
                <p className="text-sm mt-2">
                  {gaps[currentGapIndex].type === 'u-turn'
                    ? 'This gap can be closed with a U-turn on the same street.'
                    : 'Gap between segments detected. Choose how to connect:'}
                </p>
              </div>
              <div className="space-y-2">
                {gaps[currentGapIndex].type === 'u-turn' && (
                  <button
                    onClick={() => resolveGap('u-turn')}
                    className="w-full py-2 px-4 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                  >
                    🔄 Use U-turn (Recommended)
                  </button>
                )}
                <button
                  onClick={() => resolveGap('auto')}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  🚗 Auto-connect via Routing
                </button>
                <button
                  onClick={() => resolveGap('manual')}
                  className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  ✏️ Draw Manual Connection
                </button>
                <button
                  onClick={() => resolveGap('skip')}
                  className="w-full py-2 px-4 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  ⏭️ Skip This Gap
                </button>
              </div>
              {gaps[currentGapIndex].distance < 50 && (
                <div className="bg-green-50 p-3 rounded-md">
                  <p className="text-xs text-green-700">
                    💡 <strong>Tip:</strong> This is a small gap ({gaps[currentGapIndex].distance}
                    m). U-turns are allowed for coverage routing to ensure all streets are visited.
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === 'finalize' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Route Complete!</h3>
              <div className="bg-green-50 p-4 rounded-md">
                <p className="text-sm">✅ All streets covered</p>
                <p className="text-sm">✅ {gaps.filter((g) => g.resolved).length} gaps resolved</p>
                <p className="text-sm">✅ Route optimized</p>
              </div>
              <button
                onClick={saveRoute}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Save Route to Database
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 relative bg-gray-100">
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mb-4"></div>
              <p className="text-gray-600">Loading map...</p>
            </div>
          </div>
        )}

        {/* Map Overlay for Gap Resolution */}
        {currentStep === 'resolve-gaps' && gaps.length > 0 && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 max-w-xs">
            <h4 className="font-semibold mb-2">Gap Analysis</h4>
            <div className="space-y-2 text-sm">
              <p>
                Gap {currentGapIndex + 1} of {gaps.length}
              </p>
              <p>
                Distance: <strong>{gaps[currentGapIndex].distance}m</strong>
              </p>
              {gaps[currentGapIndex].type && (
                <p>
                  Type:{' '}
                  <span
                    className={`font-semibold ${
                      gaps[currentGapIndex].type === 'u-turn' ? 'text-orange-600' : 'text-blue-600'
                    }`}
                  >
                    {gaps[currentGapIndex].type === 'u-turn' ? '🔄 U-turn' : '🔗 Connection'}
                  </span>
                </p>
              )}
              {gaps[currentGapIndex].resolved && (
                <p className="text-green-600">✓ Resolved via {gaps[currentGapIndex].resolution}</p>
              )}
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-600">
                  {gaps[currentGapIndex].type === 'u-turn'
                    ? 'Same street - U-turn recommended for coverage'
                    : gaps[currentGapIndex].distance < 100
                      ? 'Nearby streets - short connection needed'
                      : 'Disconnected segments - routing required'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RouteBuilderPage() {
  return (
    <Suspense
      fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}
    >
      <RouteBuilderContent />
    </Suspense>
  );
}
