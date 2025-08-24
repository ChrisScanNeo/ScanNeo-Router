'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function RoutesPage() {
  const [activeTab, setActiveTab] = useState<'generate' | 'active' | 'routes'>('generate');

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      {/* Header with Cancel All button */}
      <div className="md:flex md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#1C2F38]">Coverage Routes</h1>
          <p className="mt-2 text-sm text-gray-600">
            Generate optimal driving routes to cover all streets in an area
          </p>
        </div>
        <CancelAllButton />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('generate')}
            className={`${
              activeTab === 'generate'
                ? 'border-[#00B140] text-[#00B140]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Generate Route
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`${
              activeTab === 'active'
                ? 'border-[#00B140] text-[#00B140]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            Active Jobs
          </button>
          <button
            onClick={() => setActiveTab('routes')}
            className={`${
              activeTab === 'routes'
                ? 'border-[#00B140] text-[#00B140]'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            All Routes
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'generate' && <GenerateRouteForm />}
      {activeTab === 'active' && <JobsList />}
      {activeTab === 'routes' && <RoutesList />}
    </div>
  );
}

function CancelAllButton() {
  const [isCancelling, setIsCancelling] = useState(false);

  const handleCancelAll = async () => {
    if (!confirm('Are you sure you want to cancel all running jobs?')) {
      return;
    }

    setIsCancelling(true);
    try {
      const response = await fetch('/api/routes/cancel-all', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel jobs');
      }

      const data = await response.json();
      if (data.cancelledCount > 0) {
        toast.success(`Cancelled ${data.cancelledCount} job(s)`);
        window.dispatchEvent(new Event('jobs-updated'));
      } else {
        toast('No running jobs to cancel', { icon: '📋' });
      }
    } catch (error) {
      console.error('Error cancelling jobs:', error);
      toast.error('Failed to cancel jobs');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <button
      onClick={handleCancelAll}
      disabled={isCancelling}
      className="mt-3 sm:mt-0 inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isCancelling ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Cancelling...
        </>
      ) : (
        <>
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Cancel All Jobs
        </>
      )}
    </button>
  );
}

function GenerateRouteForm() {
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [chunkDuration, setChunkDuration] = useState(3600);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const response = await fetch('/api/areas');
        if (!response.ok) throw new Error('Failed to fetch areas');
        const data = await response.json();
        setAreas(data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
        if (data.length > 0) setSelectedArea(data[0].id);
      } catch (error) {
        console.error('Failed to fetch areas:', error);
        toast.error('Failed to load areas');
      }
    };
    fetchAreas();
  }, []);

  const handleGenerate = async () => {
    if (!selectedArea) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/coverage/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          areaId: selectedArea,
          chunkDuration: chunkDuration,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate route');

      const data = await response.json();
      toast.success(`Route generation started! Job ID: ${data.jobId.slice(0, 8)}...`);
      window.dispatchEvent(new Event('jobs-updated'));
      setSelectedArea('');
    } catch (error) {
      console.error('Failed to generate route:', error);
      toast.error('Failed to start route generation');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="area" className="block text-sm font-medium text-gray-700">
            Select Area
          </label>
          <select
            id="area"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Select an area...</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="chunk-duration" className="block text-sm font-medium text-gray-700">
            Chunk Duration
          </label>
          <select
            id="chunk-duration"
            value={chunkDuration}
            onChange={(e) => setChunkDuration(parseInt(e.target.value))}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value={1800}>30 minutes</option>
            <option value={3600}>1 hour</option>
            <option value={5400}>1.5 hours</option>
            <option value={7200}>2 hours</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={!selectedArea || isGenerating}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {isGenerating ? 'Generating Route...' : 'Generate Coverage Route'}
      </button>
    </div>
  );
}

function JobsList() {
  const [jobs, setJobs] = useState<
    Array<{ id: string; areaName: string; status: string; progress: number; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/routes');
      if (!response.ok) throw new Error('Failed to fetch routes');
      const data = await response.json();

      const activeJobs = data
        .filter((r: { status: string }) => r.status === 'queued' || r.status === 'processing')
        .map(
          (r: {
            id: string;
            area_name: string;
            status: string;
            progress?: number;
            created_at: string;
          }) => ({
            id: r.id,
            areaName: r.area_name,
            status: r.status,
            progress: r.progress || (r.status === 'processing' ? 50 : 0),
            createdAt: r.created_at,
          })
        );

      setJobs(activeJobs);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      toast.error('Failed to load active jobs');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      const response = await fetch(`/api/routes/${jobId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to cancel job');

      toast.success('Job cancelled');
      fetchJobs();
      window.dispatchEvent(new Event('jobs-updated'));
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast.error('Failed to cancel job');
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    const handleUpdate = () => fetchJobs();
    window.addEventListener('jobs-updated', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('jobs-updated', handleUpdate);
    };
  }, []);

  if (loading) return <div className="text-center py-8">Loading...</div>;

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No active jobs</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <div key={job.id} className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900">{job.areaName}</h3>
              <p className="text-sm text-gray-500">
                Status: {job.status} • Started: {new Date(job.createdAt).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={() => handleCancel(job.id)}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-900 border border-red-300 rounded hover:bg-red-50"
            >
              Cancel
            </button>
          </div>
          <div className="mt-3">
            <div className="bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoutesList() {
  const [routes, setRoutes] = useState<
    Array<{ id: string; area_name: string; status: string; length_m?: number; created_at: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  const fetchRoutes = async () => {
    try {
      const response = await fetch('/api/routes');
      if (!response.ok) throw new Error('Failed to fetch routes');
      const data = await response.json();
      setRoutes(data);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
      toast.error('Failed to load routes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (routeId: string) => {
    if (!confirm('Are you sure you want to delete this route?')) return;

    try {
      const response = await fetch(`/api/routes/${routeId}/delete`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete route');

      toast.success('Route deleted');
      fetchRoutes();
    } catch (error) {
      console.error('Error deleting route:', error);
      toast.error('Failed to delete route');
    }
  };

  const handleCancel = async (routeId: string) => {
    try {
      const response = await fetch(`/api/routes/${routeId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to cancel route');

      toast.success('Route cancelled');
      fetchRoutes();
    } catch (error) {
      console.error('Error cancelling route:', error);
      toast.error('Failed to cancel route');
    }
  };

  useEffect(() => {
    fetchRoutes();
    const handleUpdate = () => fetchRoutes();
    window.addEventListener('jobs-updated', handleUpdate);
    return () => window.removeEventListener('jobs-updated', handleUpdate);
  }, []);

  if (loading) return <div className="text-center py-8">Loading...</div>;

  if (routes.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No routes generated yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Area
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Distance
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Created
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {routes.map((route) => (
            <tr key={route.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm">{route.area_name}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    route.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : route.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : route.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-800'
                          : route.status === 'processing'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {route.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {route.length_m ? `${(route.length_m / 1000).toFixed(1)} km` : '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(route.created_at).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <div className="flex space-x-2">
                  {route.status === 'completed' && (
                    <Link
                      href={`/routes/${route.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                  )}
                  {(route.status === 'failed' ||
                    route.status === 'cancelled' ||
                    route.status === 'completed' ||
                    route.status === 'completed_with_warnings') && (
                    <button
                      onClick={() => handleDelete(route.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                  )}
                  {(route.status === 'processing' || route.status === 'queued') && (
                    <button
                      onClick={() => handleCancel(route.id)}
                      className="text-orange-600 hover:text-orange-900"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
