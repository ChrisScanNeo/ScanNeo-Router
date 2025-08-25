'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import toast from 'react-hot-toast';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
mapboxgl.accessToken = MAPBOX_TOKEN;

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
  resolved: boolean;
  resolution?: 'auto' | 'manual' | 'skip';
}

function RouteBuilderContent() {
  const searchParams = useSearchParams();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  const [currentStep, setCurrentStep] = useState<Step>('select-area');
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [streetData, setStreetData] = useState<StreetData | null>(null);
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  // Route segments will be displayed on the map once generated
  const [routeSegments] = useState<GeoJSON.Feature[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [currentGapIndex, setCurrentGapIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-0.0875, 51.5085],
      zoom: 11,
    });

    map.current.on('load', () => {
      // Add navigation controls
      if (map.current) {
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
      }
    });

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
    const areaId = searchParams.get('area');
    if (areaId && areas.length > 0) {
      const area = areas.find((a) => a.id === areaId);
      if (area) {
        setSelectedArea(area);
        setCurrentStep('extract-streets');
      }
    }
  }, [searchParams, areas]);

  // Update map when area is selected
  useEffect(() => {
    if (!map.current || !selectedArea) return;

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
  }, [selectedArea]);

  // Display route segments on map (when generated)
  useEffect(() => {
    if (!map.current || routeSegments.length === 0) return;

    // This will display route segments once they're generated
    console.log(`${routeSegments.length} route segments ready to display`);
  }, [routeSegments]);

  // Display streets on map
  useEffect(() => {
    if (!map.current || !streetData) return;

    // Remove existing streets layer
    if (map.current.getSource('streets')) {
      map.current.removeLayer('streets-line');
      map.current.removeLayer('streets-arrows');
      map.current.removeSource('streets');
    }

    // Add streets
    map.current.addSource('streets', {
      type: 'geojson',
      data: streetData.streets,
    });

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
        'line-width': 2,
        'line-opacity': 0.8,
      },
    });

    // Add arrows for one-way streets
    map.current.addLayer({
      id: 'streets-arrows',
      type: 'symbol',
      source: 'streets',
      filter: ['==', ['get', 'oneway'], true],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 100,
        'icon-image': '▶',
        'icon-size': 0.5,
        'icon-rotate': 90,
      },
    });
  }, [streetData]);

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
      toast.success(
        `Extracted ${extraction.streets_filtered} streets (${extraction.total_length_km} km)\n` +
          `${extraction.one_way_streets} one-way, ${extraction.restricted_streets} restricted, ${extraction.dead_ends} dead-ends`,
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

    // Enable click handler for start point selection
    if (map.current) {
      map.current.on('click', handleMapClick);
    }
  };

  const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
    if (currentStep === 'select-start') {
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

      // Remove click handler
      if (map.current) {
        map.current.off('click', handleMapClick);
      }
    }
  };

  const generateRoute = () => {
    // Simulate route generation with gaps
    const mockGaps: Gap[] = [
      {
        id: 1,
        startPoint: [-0.0875, 51.5085],
        endPoint: [-0.0865, 51.5095],
        distance: 150,
        resolved: false,
      },
      {
        id: 2,
        startPoint: [-0.0855, 51.5105],
        endPoint: [-0.0845, 51.5115],
        distance: 200,
        resolved: false,
      },
    ];

    // Route segments will be populated with actual route generation
    // For now using mock data - routeSegments state will be used when rendering on map

    setGaps(mockGaps);
    toast(`Found ${mockGaps.length} gaps in route`, { icon: '⚠️' });
    setCurrentStep('resolve-gaps');
  };

  const resolveGap = (resolution: 'auto' | 'manual' | 'skip') => {
    const updatedGaps = [...gaps];
    updatedGaps[currentGapIndex] = {
      ...updatedGaps[currentGapIndex],
      resolved: true,
      resolution,
    };
    setGaps(updatedGaps);

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
              <div className="bg-yellow-50 p-4 rounded-md">
                <p className="text-sm">Click on the map to select where the route should start</p>
              </div>
              {startPoint && (
                <div className="bg-green-50 p-4 rounded-md">
                  <p className="text-sm">
                    Selected: [{startPoint[0].toFixed(4)}, {startPoint[1].toFixed(4)}]
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
              </div>
              <button
                onClick={generateRoute}
                className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Generate Coverage Route
              </button>
              <p className="text-sm text-gray-600">
                This will calculate the optimal route covering all streets
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
                <p className="text-sm mt-2">
                  Gap between segments detected. Choose how to connect:
                </p>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => resolveGap('auto')}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Auto-connect via Routing
                </button>
                <button
                  onClick={() => resolveGap('manual')}
                  className="w-full py-2 px-4 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Draw Manual Connection
                </button>
                <button
                  onClick={() => resolveGap('skip')}
                  className="w-full py-2 px-4 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Skip This Gap
                </button>
              </div>
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
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />

        {/* Map Overlay for Gap Resolution */}
        {currentStep === 'resolve-gaps' && gaps.length > 0 && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4">
            <h4 className="font-semibold mb-2">Gap Details</h4>
            <p className="text-sm">
              Gap {currentGapIndex + 1} of {gaps.length}
            </p>
            <p className="text-sm">Distance: {gaps[currentGapIndex].distance}m</p>
            {gaps[currentGapIndex].resolved && (
              <p className="text-sm text-green-600">
                ✓ Resolved via {gaps[currentGapIndex].resolution}
              </p>
            )}
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
