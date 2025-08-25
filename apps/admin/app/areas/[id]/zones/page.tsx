'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import toast from 'react-hot-toast';

interface Zone {
  id: string;
  index: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed';
  estimated_time_hours: number;
  estimated_length_km: number;
  street_count: number;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  route?: {
    id: string;
    length_m: number;
    time_s: number;
  };
  progress?: {
    completed_at: string;
    coverage_percentage: number;
    actual_time_hours: number;
  };
}

interface ZoneSummary {
  total_zones: number;
  completed_zones: number;
  in_progress_zones: number;
  pending_zones: number;
  completion_percentage: number;
  total_estimated_hours: number;
  actual_hours_spent: number;
}

export default function ZonesPage() {
  const params = useParams();
  const router = useRouter();
  const areaId = params.id as string;

  const [zones, setZones] = useState<Zone[]>([]);
  const [summary, setSummary] = useState<ZoneSummary | null>(null);
  const [areaName, setAreaName] = useState('');
  const [loading, setLoading] = useState(true);
  const [dividing, setDividing] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

  // Fetch zones
  const fetchZones = async () => {
    try {
      const response = await fetch(`/api/areas/${areaId}/zones`);
      if (!response.ok) throw new Error('Failed to fetch zones');

      const data = await response.json();
      setZones(data.zones || []);
      setSummary(data.summary);
      setAreaName(data.area?.name || 'Unknown Area');

      // Update map if zones exist
      if (data.zones && data.zones.length > 0 && map.current) {
        updateMapZones(data.zones);
      }
    } catch (error) {
      console.error('Error fetching zones:', error);
      toast.error('Failed to load zones');
    } finally {
      setLoading(false);
    }
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-0.1276, 51.5074], // Default to London
      zoom: 11,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      // Add zone layers
      map.current!.addSource('zones', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // Fill layer for zones
      map.current!.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'status'], 'completed'],
            '#00B140', // Green for completed
            ['==', ['get', 'status'], 'in_progress'],
            '#FFA500', // Orange for in progress
            '#4C4FA3', // Purple for pending
          ],
          'fill-opacity': 0.3,
        },
      });

      // Border layer for zones
      map.current!.addLayer({
        id: 'zones-border',
        type: 'line',
        source: 'zones',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'selected'], true],
            '#FF0000', // Red for selected
            '#000000', // Black for others
          ],
          'line-width': ['case', ['==', ['get', 'selected'], true], 3, 1],
        },
      });

      // Zone labels
      map.current!.addLayer({
        id: 'zones-label',
        type: 'symbol',
        source: 'zones',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 14,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2,
        },
      });

      // Click handler for zones
      map.current!.on('click', 'zones-fill', (e) => {
        if (e.features && e.features[0]) {
          const zoneId = e.features[0].properties?.id;
          setSelectedZone(zoneId);
        }
      });

      // Cursor change on hover
      map.current!.on('mouseenter', 'zones-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current!.on('mouseleave', 'zones-fill', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update map with zones
  const updateMapZones = (zonesList: Zone[]) => {
    if (!map.current) return;

    const features = zonesList.map((zone) => ({
      type: 'Feature' as const,
      properties: {
        id: zone.id,
        name: zone.name,
        status: zone.status,
        selected: zone.id === selectedZone,
      },
      geometry: zone.geometry,
    }));

    const source = map.current.getSource('zones') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });

      // Fit map to zones
      if (features.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        features.forEach((f) => {
          if (f.geometry.type === 'Polygon') {
            f.geometry.coordinates[0].forEach((coord) => {
              bounds.extend(coord as [number, number]);
            });
          }
        });
        map.current.fitBounds(bounds, { padding: 50 });
      }
    }
  };

  // Update map when selected zone changes
  useEffect(() => {
    if (zones.length > 0) {
      updateMapZones(zones);
    }
  }, [selectedZone, zones]);

  // Fetch zones on mount
  useEffect(() => {
    fetchZones();
  }, [areaId]);

  // Divide into zones
  const handleDivideZones = async () => {
    setDividing(true);
    try {
      const response = await fetch(`/api/areas/${areaId}/divide-zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetHours: 1.0,
          method: 'grid',
          maxZones: 30,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error);
      }

      const result = await response.json();
      toast.success(`Created ${result.zones_created} zones successfully`);

      // Refresh zones
      await fetchZones();
    } catch (error) {
      console.error('Error dividing zones:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to divide into zones');
    } finally {
      setDividing(false);
    }
  };

  // Delete all zones
  const handleDeleteZones = async () => {
    if (!confirm('Are you sure you want to delete all zones?')) return;

    try {
      const response = await fetch(`/api/areas/${areaId}/divide-zones`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete zones');

      toast.success('All zones deleted');
      setZones([]);
      setSummary(null);
      updateMapZones([]);
    } catch (error) {
      console.error('Error deleting zones:', error);
      toast.error('Failed to delete zones');
    }
  };

  // Generate route for zone
  const handleGenerateRoute = async (zoneId: string) => {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) return;

    toast.loading(`Generating route for ${zone.name}...`);

    // Navigate to route generation with zone parameter
    router.push(`/routes/builder?area=${areaId}&zone=${zoneId}`);
  };

  // Mark zone as complete
  const handleMarkComplete = async (zoneId: string) => {
    try {
      const response = await fetch(`/api/areas/${areaId}/zones`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone_id: zoneId,
          status: 'completed',
          progress_data: {
            coverage_percentage: 100,
            actual_time_hours: 1.0,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to update zone');

      toast.success('Zone marked as complete');
      await fetchZones();
    } catch (error) {
      console.error('Error updating zone:', error);
      toast.error('Failed to update zone');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading zones...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#4C4FA3]">Zone Management</h1>
              <p className="text-sm text-gray-600 mt-1">{areaName}</p>
            </div>
            <Link href={`/areas/${areaId}`} className="text-[#00B140] hover:text-[#00A038]">
              ← Back to Area
            </Link>
          </div>
        </div>
      </div>

      {/* Progress Summary */}
      {summary && summary.total_zones > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Coverage Progress</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-500">Total Zones</p>
                <p className="text-2xl font-bold text-[#4C4FA3]">{summary.total_zones}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Completed</p>
                <p className="text-2xl font-bold text-[#00B140]">{summary.completed_zones}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-2xl font-bold text-orange-500">{summary.in_progress_zones}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Completion</p>
                <p className="text-2xl font-bold text-[#4C4FA3]">
                  {summary.completion_percentage.toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-[#00B140] h-4 rounded-full transition-all duration-300"
                  style={{ width: `${summary.completion_percentage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Map */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Zone Map</h2>
              {zones.length === 0 ? (
                <button
                  onClick={handleDivideZones}
                  disabled={dividing}
                  className="px-4 py-2 bg-[#00B140] text-white rounded hover:bg-[#00A038] disabled:opacity-50"
                >
                  {dividing ? 'Creating Zones...' : 'Divide into Zones'}
                </button>
              ) : (
                <button
                  onClick={handleDeleteZones}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete All Zones
                </button>
              )}
            </div>
            <div ref={mapContainer} className="h-[500px] rounded" />
          </div>

          {/* Zone List */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Zones</h2>

            {zones.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No zones created yet.</p>
                <p className="mt-2">
                  Click &quot;Divide into Zones&quot; to create manageable route segments.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedZone === zone.id
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    } ${
                      zone.status === 'completed'
                        ? 'bg-green-50'
                        : zone.status === 'in_progress'
                          ? 'bg-orange-50'
                          : ''
                    }`}
                    onClick={() => setSelectedZone(zone.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold">{zone.name}</h3>
                        <p className="text-sm text-gray-600">
                          {zone.street_count} streets • {zone.estimated_length_km.toFixed(1)} km
                        </p>
                        <p className="text-sm text-gray-600">
                          Est. time: {zone.estimated_time_hours.toFixed(1)} hours
                        </p>

                        {/* Status badge */}
                        <span
                          className={`inline-block mt-2 px-2 py-1 text-xs rounded-full ${
                            zone.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : zone.status === 'in_progress'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {zone.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {zone.status === 'pending' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateRoute(zone.id);
                            }}
                            className="px-3 py-1 bg-[#4C4FA3] text-white text-sm rounded hover:bg-[#3A3D80]"
                          >
                            Generate Route
                          </button>
                        )}

                        {zone.route && zone.status !== 'completed' && (
                          <>
                            <Link
                              href={`/navigate/${zone.route.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="px-3 py-1 bg-[#00B140] text-white text-sm rounded hover:bg-[#00A038] text-center"
                            >
                              Navigate
                            </Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkComplete(zone.id);
                              }}
                              className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                            >
                              Mark Complete
                            </button>
                          </>
                        )}

                        {zone.progress && (
                          <div className="text-xs text-gray-500">
                            Completed: {new Date(zone.progress.completed_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
