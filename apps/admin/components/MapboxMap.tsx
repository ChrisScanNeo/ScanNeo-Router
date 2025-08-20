'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import showToast from '@/components/Toast';

// Get Mapbox token from environment variable
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

interface MapboxMapProps {
  selectedLayer: 'areas' | 'routes' | 'coverage';
  selectedArea: string;
  selectedRoute: string;
}

export function MapboxMap({ selectedLayer, selectedArea, selectedRoute }: MapboxMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  interface Area {
    id: string;
    name: string;
    buffer_m: number;
    geojson: string | Record<string, unknown>;
  }

  const [areas, setAreas] = useState<Area[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Fetch areas from API
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const response = await fetch('/api/areas');
        const data = await response.json();

        if (data.success && data.areas) {
          setAreas(data.areas);
        }
      } catch (error) {
        console.error('Error fetching areas:', error);
      }
    };

    fetchAreas();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Check for Mapbox token
    if (!MAPBOX_TOKEN) {
      console.warn('Mapbox access token not found. Map will not load.');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-0.0875, 51.5085], // Default to London
        zoom: 11,
      });

      map.current.on('load', () => {
        setMapLoaded(true);

        // Add navigation controls
        if (map.current) {
          map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
          map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        }
      });

      map.current.on('error', (e) => {
        console.error('Mapbox error:', e);
        if (e.error?.message?.includes('401')) {
          showToast.error('Invalid Mapbox token. Please check your configuration.');
        }
      });
    } catch (error) {
      console.error('Failed to initialize map:', error);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update map layers based on selected areas
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing layers and sources
    const layerIds = ['areas-fill', 'areas-outline', 'routes-line', 'coverage-line'];
    const sourceIds = ['areas', 'routes', 'coverage'];

    layerIds.forEach((id) => {
      if (map.current?.getLayer(id)) {
        map.current.removeLayer(id);
      }
    });

    sourceIds.forEach((id) => {
      if (map.current?.getSource(id)) {
        map.current.removeSource(id);
      }
    });

    // Add areas layer
    if (selectedLayer === 'areas' && areas.length > 0) {
      // Filter areas based on selection
      const filteredAreas = selectedArea ? areas.filter((a) => a.id === selectedArea) : areas;

      if (filteredAreas.length > 0) {
        // Create GeoJSON from areas
        const geojsonFeatures = filteredAreas
          .filter((area) => area.geojson)
          .map((area) => {
            try {
              const geometry =
                typeof area.geojson === 'string' ? JSON.parse(area.geojson) : area.geojson;

              return {
                type: 'Feature',
                properties: {
                  id: area.id,
                  name: area.name,
                  buffer: area.buffer_m,
                },
                geometry: geometry,
              };
            } catch (e) {
              console.error('Error parsing area geometry:', e);
              return null;
            }
          })
          .filter((f) => f !== null);

        if (geojsonFeatures.length > 0) {
          const geojsonCollection = {
            type: 'FeatureCollection',
            features: geojsonFeatures,
          };

          // Add source
          map.current.addSource('areas', {
            type: 'geojson',
            data: geojsonCollection as GeoJSON.FeatureCollection,
          });

          // Add fill layer
          map.current.addLayer({
            id: 'areas-fill',
            type: 'fill',
            source: 'areas',
            paint: {
              'fill-color': '#00B140',
              'fill-opacity': 0.2,
            },
          });

          // Add outline layer
          map.current.addLayer({
            id: 'areas-outline',
            type: 'line',
            source: 'areas',
            paint: {
              'line-color': '#00B140',
              'line-width': 2,
            },
          });

          // Fit map to bounds
          const bounds = new mapboxgl.LngLatBounds();
          geojsonFeatures.forEach((feature) => {
            if (feature.geometry.type === 'Polygon') {
              const coordinates = feature.geometry.coordinates as number[][][];
              coordinates[0].forEach((coord) => {
                bounds.extend(coord as [number, number]);
              });
            } else if (feature.geometry.type === 'MultiPolygon') {
              const coordinates = feature.geometry.coordinates as number[][][][];
              coordinates.forEach((polygon) => {
                polygon[0].forEach((coord) => {
                  bounds.extend(coord as [number, number]);
                });
              });
            }
          });

          map.current.fitBounds(bounds, { padding: 50 });

          // Add popup on click
          map.current.on('click', 'areas-fill', (e) => {
            if (e.features && e.features[0]) {
              const feature = e.features[0];
              new mapboxgl.Popup()
                .setLngLat(e.lngLat)
                .setHTML(
                  `
                  <div class="p-2">
                    <h3 class="font-semibold text-[#4C4FA3]">${feature.properties?.name}</h3>
                    <p class="text-sm text-gray-600">Buffer: ${feature.properties?.buffer}m</p>
                  </div>
                `
                )
                .addTo(map.current!);
            }
          });

          // Change cursor on hover
          map.current.on('mouseenter', 'areas-fill', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'areas-fill', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });
        }
      }
    }

    // Placeholder for routes layer
    if (selectedLayer === 'routes') {
      // Routes implementation will go here when backend is ready
      const demoRoute = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [-0.087, 51.508],
                [-0.088, 51.509],
                [-0.089, 51.51],
                [-0.09, 51.511],
              ],
            },
          },
        ],
      };

      map.current.addSource('routes', {
        type: 'geojson',
        data: demoRoute as GeoJSON.FeatureCollection,
      });

      map.current.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': '#A6CE39',
          'line-width': 3,
        },
      });
    }

    // Placeholder for coverage layer
    if (selectedLayer === 'coverage') {
      // Coverage implementation will go here when backend is ready
      const demoCoverage = {
        type: 'FeatureCollection',
        features: [],
      };

      map.current.addSource('coverage', {
        type: 'geojson',
        data: demoCoverage as GeoJSON.FeatureCollection,
      });
    }
  }, [selectedLayer, selectedArea, selectedRoute, areas, mapLoaded]);

  return (
    <div className="h-full relative">
      <div ref={mapContainer} className="h-full" />

      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="text-center p-6">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Map Configuration Required</h3>
            <p className="text-gray-500 mb-4">Mapbox access token not configured.</p>
            <p className="text-sm text-gray-400">
              Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to your .env.local file
            </p>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {MAPBOX_TOKEN && !mapLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <svg
              className="animate-spin h-8 w-8 text-[#00B140] mx-auto mb-2"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="text-sm text-gray-500">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  );
}
