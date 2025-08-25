'use client';

// Route details page for viewing individual route information
import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RouteMapPreview } from '@/components/RouteMapPreview';

interface RouteChunk {
  id: string;
  chunk_index: number;
  geojson?: Record<string, unknown>;
  length_m: number;
  duration_s: number;
}

interface RouteParams {
  chunkDuration?: number;
  [key: string]: unknown;
}

interface RouteMetadata {
  stage?: string;
  stats?: {
    streets?: number;
    length_km?: number;
    time_hours?: number;
    chunks?: number;
  };
  [key: string]: unknown;
}

interface RouteDetails {
  id: string;
  area_id: string;
  area_name: string;
  status: string;
  progress: number;
  created_at: string;
  updated_at: string;
  profile: string;
  params: RouteParams;
  metadata: RouteMetadata;
  error: string | null;
  geojson?: Record<string, unknown>;
  length_m?: number;
  drive_time_s?: number;
  chunks?: RouteChunk[];
}

export default function RouteDetailsPage() {
  const params = useParams();
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRouteDetails = async () => {
      try {
        const response = await fetch(`/api/routes/${params.id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch route details');
        }
        const data = await response.json();
        setRoute(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchRouteDetails();
  }, [params.id]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatDistance = (meters: number) => {
    return `${(meters / 1000).toFixed(1)} km`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading route details...</div>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-lg mb-4">{error || 'Route not found'}</div>
          <Link href="/routes" className="text-[#00B140] hover:text-[#00A038]">
            ← Back to Routes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-[#4C4FA3]">Route Details</h1>
          <Link href="/routes" className="px-4 py-2 text-[#00B140] hover:text-[#00A038]">
            ← Back to Routes
          </Link>
        </div>

        {/* Status Badge */}
        <div className="inline-flex items-center">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              route.status === 'completed'
                ? 'bg-green-100 text-green-800'
                : route.status === 'processing'
                  ? 'bg-yellow-100 text-yellow-800'
                  : route.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
            }`}
          >
            {route.status.charAt(0).toUpperCase() + route.status.slice(1)}
          </span>
          {route.status === 'processing' && (
            <span className="ml-2 text-sm text-gray-600">{route.progress}% complete</span>
          )}
        </div>
      </div>

      {/* Debug Info - Remove this after testing */}
      <div className="mb-4 p-4 bg-gray-100 rounded text-sm">
        <div>Status: {route.status}</div>
        <div>Has metadata.route: {route.metadata?.route ? 'Yes' : 'No'}</div>
        <div>Screen width class test: <span className="inline lg:hidden">Mobile/Tablet</span><span className="hidden lg:inline">Desktop</span></div>
      </div>

      {/* Navigation Button - Always visible for testing */}
      <div className="mb-6">
        <Link
          href={`/navigate/${route.id}`}
          className="block w-full px-6 py-4 bg-[#00B140] text-white text-center rounded-lg hover:bg-[#00A038] transition-colors font-bold text-xl shadow-lg"
        >
          🚗 Start Navigation
        </Link>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Route Information */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-[#4C4FA3]">Route Information</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Route ID</dt>
                <dd className="text-sm text-gray-900">{route.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Area</dt>
                <dd className="text-sm text-gray-900">{route.area_name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Profile</dt>
                <dd className="text-sm text-gray-900">{route.profile}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Created</dt>
                <dd className="text-sm text-gray-900">
                  {new Date(route.created_at).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="text-sm text-gray-900">
                  {new Date(route.updated_at).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          {/* Route Statistics */}
          {route.status === 'completed' && route.length_m && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-[#4C4FA3]">Route Statistics</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Total Distance</dt>
                  <dd className="text-2xl font-bold text-[#00B140]">
                    {formatDistance(route.length_m)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Estimated Time</dt>
                  <dd className="text-2xl font-bold text-[#00B140]">
                    {formatDuration(route.drive_time_s || 0)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Chunks</dt>
                  <dd className="text-2xl font-bold text-[#00B140]">{route.chunks?.length || 0}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Chunk Duration</dt>
                  <dd className="text-2xl font-bold text-[#00B140]">
                    {route.params?.chunkDuration
                      ? formatDuration(route.params.chunkDuration)
                      : 'N/A'}
                  </dd>
                </div>
              </div>
            </div>
          )}

          {/* Error Information */}
          {route.status === 'failed' && route.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-red-800">Error Details</h2>
              <p className="text-sm text-red-700">{route.error}</p>
            </div>
          )}
        </div>

        {/* Right Column - Actions and Map */}
        <div className="space-y-6">
          {/* Actions - Moved to top for better visibility */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-[#4C4FA3]">Actions</h2>
            <div className="space-y-3">
              {/* Always show navigation button for testing */}
              <Link
                href={`/navigate/${route.id}`}
                className="block w-full px-4 py-3 bg-[#00B140] text-white text-center rounded-lg hover:bg-[#00A038] transition-colors font-semibold text-lg"
              >
                🚗 Start Navigation
              </Link>
              {(route.status === 'completed' || !!route.metadata?.route) && (
                <>
                  <Link
                    href={`/map?route=${route.id}`}
                    className="block w-full px-4 py-2 bg-[#4C4FA3] text-white text-center rounded-lg hover:bg-[#3A3D80] transition-colors"
                  >
                    View on Map
                  </Link>
                  <button
                    className="block w-full px-4 py-2 bg-[#00B140] text-white text-center rounded-lg hover:bg-[#00A038] transition-colors"
                    onClick={async () => {
                      try {
                        const response = await fetch(
                          `/api/routes/${route.id}/export?format=geojson`
                        );
                        if (!response.ok) throw new Error('Download failed');

                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${route.area_name.replace(/\s+/g, '_')}_route.geojson`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error) {
                        console.error('Download error:', error);
                        alert('Failed to download route');
                      }
                    }}
                  >
                    Download GeoJSON
                  </button>
                  <button
                    className="block w-full px-4 py-2 bg-gray-100 text-gray-700 text-center rounded-lg hover:bg-gray-200 transition-colors"
                    onClick={async () => {
                      try {
                        const response = await fetch(`/api/routes/${route.id}/export?format=gpx`);
                        if (!response.ok) throw new Error('Export failed');

                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${route.area_name.replace(/\s+/g, '_')}_route.gpx`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      } catch (error) {
                        console.error('Export error:', error);
                        alert('Failed to export route');
                      }
                    }}
                  >
                    Export to GPX
                  </button>
                </>
              )}
              {route.status === 'processing' && (
                <button
                  onClick={() => window.location.reload()}
                  className="block w-full px-4 py-2 bg-blue-500 text-white text-center rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Refresh Status
                </button>
              )}
              {route.status === 'failed' && (
                <button
                  className="block w-full px-4 py-2 bg-yellow-500 text-white text-center rounded-lg hover:bg-yellow-600 transition-colors"
                  onClick={() => {
                    // TODO: Implement retry functionality
                    alert('Retry functionality coming soon!');
                  }}
                >
                  Retry Route Generation
                </button>
              )}
            </div>
          </div>

          {/* Map Preview */}
          {route.status === 'completed' && route.geojson && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-[#4C4FA3]">Route Preview</h2>
              <div className="h-[400px] rounded-lg overflow-hidden">
                <RouteMapPreview routeGeojson={route.geojson} routeName={route.area_name} />
              </div>
            </div>
          )}

          {/* Processing Metadata */}
          {route.metadata && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-[#4C4FA3]">Processing Details</h2>
              <div className="space-y-3">
                {route.metadata.stage && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Current Stage</dt>
                    <dd className="text-sm text-gray-900">{route.metadata.stage}</dd>
                  </div>
                )}
                {route.metadata.stats && (
                  <>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Streets Processed</dt>
                      <dd className="text-sm text-gray-900">{route.metadata.stats.streets || 0}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Route Length</dt>
                      <dd className="text-sm text-gray-900">
                        {route.metadata.stats.length_km || 0} km
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Estimated Time</dt>
                      <dd className="text-sm text-gray-900">
                        {route.metadata.stats.time_hours || 0} hours
                      </dd>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Chunks List */}
          {route.status === 'completed' && route.chunks && route.chunks.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-[#4C4FA3]">Route Chunks</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {route.chunks.map((chunk: RouteChunk, index: number) => (
                  <div
                    key={chunk.id || index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <span className="font-medium">Chunk {index + 1}</span>
                      <span className="ml-2 text-sm text-gray-600">
                        {formatDistance(chunk.length_m || 0)}
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">
                      {formatDuration(chunk.duration_s || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
