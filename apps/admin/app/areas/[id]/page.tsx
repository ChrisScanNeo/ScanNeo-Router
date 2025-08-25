'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { MapboxMap } from '@/components/MapboxMap';
import showToast from '@/components/Toast';

interface Area {
  id: string;
  name: string;
  profile: string;
  buffer_m: number;
  include_service: boolean;
  chunk_duration: number;
  geojson: string | Record<string, unknown>;
  created_at: string;
}

export default function AreaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [area, setArea] = useState<Area | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    params.then((p) => setAreaId(p.id));
  }, [params]);

  useEffect(() => {
    if (!areaId) return;

    const fetchArea = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/areas/${areaId}`);
        const data = await response.json();

        if (response.ok && data.success) {
          setArea(data.area);
        } else {
          setError(data.error || 'Failed to fetch area');
        }
      } catch (err) {
        console.error('Error fetching area:', err);
        setError('Failed to fetch area details');
      } finally {
        setLoading(false);
      }
    };

    fetchArea();
  }, [areaId]);

  const handleDelete = async () => {
    if (!area || !confirm(`Are you sure you want to delete "${area.name}"?`)) return;

    try {
      const response = await fetch(`/api/areas/${area.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showToast.success(`Area "${area.name}" deleted successfully`);
        router.push('/areas');
      } else {
        const data = await response.json();
        showToast.error(`Failed to delete area: ${data.error}`);
      }
    } catch (err) {
      console.error('Error deleting area:', err);
      showToast.error('Failed to delete area');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header
          title="Area Details"
          subtitle="Loading..."
          showBackButton={true}
          backHref="/areas"
          status="online"
        />
        <div className="flex items-center justify-center h-96">
          <svg
            className="animate-spin h-8 w-8 text-[#00B140]"
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
        </div>
      </div>
    );
  }

  if (error || !area) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header
          title="Area Details"
          subtitle="Error"
          showBackButton={true}
          backHref="/areas"
          status="offline"
        />
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="bg-white shadow-sm rounded-lg border border-red-200 p-6">
            <div className="flex items-center">
              <svg
                className="h-6 w-6 text-red-400 mr-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h3 className="text-lg font-medium text-gray-900">Error Loading Area</h3>
                <p className="text-gray-500">{error || 'Area not found'}</p>
              </div>
            </div>
            <Link
              href="/areas"
              className="mt-4 inline-flex items-center px-3 py-2 border border-[#1C2F38]/20 shadow-sm text-sm leading-4 font-medium rounded-md text-[#4C4FA3] bg-white hover:bg-gray-50 transition-colors"
            >
              Back to Areas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title={area.name}
        subtitle="Area Details"
        showBackButton={true}
        backHref="/areas"
        status="online"
      />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Area Information */}
          <div className="bg-white shadow-sm rounded-lg border border-[#1C2F38]/10 mb-6">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-lg leading-6 font-semibold text-[#4C4FA3]">Area Information</h3>
                <div className="flex space-x-3">
                  <Link
                    href={`/routes?area=${area.id}`}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-[#00B140] hover:bg-[#00A038] transition-colors"
                  >
                    Generate Routes
                  </Link>
                  <button
                    onClick={handleDelete}
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    Delete Area
                  </button>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Name</dt>
                  <dd className="mt-1 text-sm text-[#1C2F38]">{area.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Routing Profile</dt>
                  <dd className="mt-1 text-sm text-[#1C2F38]">{area.profile}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Buffer Distance</dt>
                  <dd className="mt-1 text-sm text-[#1C2F38]">{area.buffer_m} meters</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Include Service Roads</dt>
                  <dd className="mt-1 text-sm text-[#1C2F38]">
                    {area.include_service ? 'Yes' : 'No'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Chunk Duration</dt>
                  <dd className="mt-1 text-sm text-[#1C2F38]">
                    {Math.round(area.chunk_duration / 60)} minutes
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-[#1C2F38]">
                    {new Date(area.created_at).toLocaleString()}
                  </dd>
                </div>
              </dl>

              {/* GeoJSON Stats */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">GeoJSON Statistics</h4>
                <div className="bg-gray-50 rounded-md p-4">
                  <GeometryStats geojson={area.geojson} />
                </div>
              </div>

              {/* Zone Management Button */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <Link
                  href={`/areas/${area.id}/zones`}
                  className="block w-full px-4 py-3 bg-[#4C4FA3] text-white text-center rounded-lg hover:bg-[#3A3D80] transition-colors font-semibold"
                >
                  📍 Manage Zones
                </Link>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Divide area into manageable hour-long route segments
                </p>
              </div>
            </div>
          </div>

          {/* Map Visualization */}
          <div className="bg-white shadow-sm rounded-lg border border-[#1C2F38]/10">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-semibold text-[#4C4FA3] mb-4">
                Area Visualization
              </h3>
              <div className="h-96 rounded-lg overflow-hidden border border-gray-200">
                <MapboxMap selectedLayer="areas" selectedArea={area.id} selectedRoute="" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function GeometryStats({ geojson }: { geojson: string | Record<string, unknown> }) {
  const geometry = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;

  const stats = {
    type: geometry.type || 'Unknown',
    coordinates: 0,
    polygons: 0,
  };

  if (geometry.type === 'Polygon') {
    stats.polygons = 1;
    stats.coordinates = geometry.coordinates[0].length;
  } else if (geometry.type === 'MultiPolygon') {
    stats.polygons = geometry.coordinates.length;
    stats.coordinates = geometry.coordinates.reduce(
      (acc: number, polygon: number[][][]) => acc + polygon[0].length,
      0
    );
  } else if (geometry.type === 'Feature') {
    if (geometry.geometry?.type === 'Polygon') {
      stats.type = 'Polygon (Feature)';
      stats.polygons = 1;
      stats.coordinates = geometry.geometry.coordinates[0].length;
    } else if (geometry.geometry?.type === 'MultiPolygon') {
      stats.type = 'MultiPolygon (Feature)';
      stats.polygons = geometry.geometry.coordinates.length;
      stats.coordinates = geometry.geometry.coordinates.reduce(
        (acc: number, polygon: number[][][]) => acc + polygon[0].length,
        0
      );
    }
  } else if (geometry.type === 'FeatureCollection' && geometry.features?.length > 0) {
    stats.type = 'FeatureCollection';
    geometry.features.forEach(
      (feature: { geometry?: { type: string; coordinates: number[][][] | number[][][][] } }) => {
        if (feature.geometry?.type === 'Polygon') {
          stats.polygons += 1;
          stats.coordinates += (feature.geometry.coordinates as number[][][])[0].length;
        } else if (feature.geometry?.type === 'MultiPolygon') {
          const multiCoords = feature.geometry.coordinates as number[][][][];
          stats.polygons += multiCoords.length;
          stats.coordinates += multiCoords.reduce(
            (acc: number, polygon: number[][][]) => acc + polygon[0].length,
            0
          );
        }
      }
    );
  }

  return (
    <dl className="grid grid-cols-3 gap-4 text-sm">
      <div>
        <dt className="text-gray-500">Type</dt>
        <dd className="mt-1 font-medium text-[#1C2F38]">{stats.type}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Polygons</dt>
        <dd className="mt-1 font-medium text-[#1C2F38]">{stats.polygons}</dd>
      </div>
      <div>
        <dt className="text-gray-500">Coordinates</dt>
        <dd className="mt-1 font-medium text-[#1C2F38]">{stats.coordinates}</dd>
      </div>
    </dl>
  );
}
