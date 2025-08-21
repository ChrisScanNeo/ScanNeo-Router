'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

interface RouteMapPreviewProps {
  routeGeojson?: Record<string, unknown>;
  routeName: string;
}

export function RouteMapPreview({ routeGeojson, routeName }: RouteMapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || !routeGeojson || map.current) return;

    if (!MAPBOX_TOKEN) {
      console.warn('Mapbox token not found');
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [0, 0],
        zoom: 12,
        interactive: true, // Allow interaction
      });

      map.current.on('load', () => {
        if (!map.current || !routeGeojson) return;

        // Add the route as a source
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: routeGeojson,
          } as unknown as GeoJSON.Feature,
        });

        // Add the route layer
        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': '#A6CE39',
            'line-width': 4,
            'line-opacity': 0.8,
          },
        });

        // Add start and end markers
        if (routeGeojson.type === 'LineString') {
          const coordinates = routeGeojson.coordinates as number[][];
          if (coordinates.length > 0) {
            // Start marker
            new mapboxgl.Marker({ color: '#00B140' })
              .setLngLat(coordinates[0] as [number, number])
              .setPopup(new mapboxgl.Popup().setText('Start'))
              .addTo(map.current);

            // End marker
            new mapboxgl.Marker({ color: '#FF0000' })
              .setLngLat(coordinates[coordinates.length - 1] as [number, number])
              .setPopup(new mapboxgl.Popup().setText('End'))
              .addTo(map.current);

            // Fit to route bounds
            const bounds = new mapboxgl.LngLatBounds();
            coordinates.forEach((coord) => {
              bounds.extend(coord as [number, number]);
            });
            map.current.fitBounds(bounds, { padding: 50 });
          }
        } else if (routeGeojson.type === 'MultiLineString') {
          const lines = routeGeojson.coordinates as number[][][];
          const bounds = new mapboxgl.LngLatBounds();

          lines.forEach((line) => {
            line.forEach((coord) => {
              bounds.extend(coord as [number, number]);
            });
          });

          if (!bounds.isEmpty()) {
            map.current.fitBounds(bounds, { padding: 50 });
          }
        }

        // Add navigation controls
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
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
  }, [routeGeojson, routeName]);

  if (!routeGeojson) {
    return (
      <div className="h-full bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">No route data available</p>
      </div>
    );
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="h-full bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-2">Map preview unavailable</p>
          <p className="text-xs text-gray-400">Mapbox token not configured</p>
        </div>
      </div>
    );
  }

  return <div ref={mapContainer} className="h-full w-full rounded-lg" />;
}
