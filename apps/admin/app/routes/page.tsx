'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';

export default function RoutesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Coverage Routes"
        subtitle="Generate & Manage Routes"
        showBackButton={true}
        backHref="/"
        status="online"
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Route Generation */}
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Generate New Route
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Create optimized coverage routes using the Chinese Postman algorithm.
              </p>

              <RouteGenerator />
            </div>
          </div>

          {/* Active Jobs */}
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Active Jobs</h3>
                <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                  <svg
                    className="h-4 w-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </button>
              </div>

              <JobsList />
            </div>
          </div>

          {/* Routes List */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">Generated Routes</h3>
                <div className="flex space-x-2">
                  <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                    <svg
                      className="h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                      />
                    </svg>
                    Filter
                  </button>
                  <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50">
                    <svg
                      className="h-4 w-4 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Export
                  </button>
                </div>
              </div>

              <RoutesList />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function RouteGenerator() {
  const [selectedArea, setSelectedArea] = useState('');
  const [chunkDuration, setChunkDuration] = useState(3600); // 1 hour default
  const [isGenerating, setIsGenerating] = useState(false);

  // Mock areas data - this would come from API
  const areas = [
    { id: '1', name: 'Tower Hamlets' },
    { id: '2', name: 'Camden' },
    { id: '3', name: 'Westminster' },
  ];

  const handleGenerate = async () => {
    if (!selectedArea) return;

    setIsGenerating(true);
    try {
      // TODO: Call actual API
      console.log('Would generate route for area:', selectedArea, 'chunk duration:', chunkDuration);

      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      alert(
        `Route generation started for area!\n\nChunk Duration: ${chunkDuration / 60} minutes\n\nThis is a demo - actual generation requires backend worker.`
      );
    } catch (error) {
      alert('Error generating route: ' + error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="area-select" className="block text-sm font-medium text-gray-700">
            Select Area
          </label>
          <select
            id="area-select"
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          >
            <option value="">Choose an area...</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="chunk-duration" className="block text-sm font-medium text-gray-700">
            Chunk Duration (seconds)
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

      <div>
        <button
          onClick={handleGenerate}
          disabled={!selectedArea || isGenerating}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
              Generating Route...
            </>
          ) : (
            'Generate Coverage Route'
          )}
        </button>
      </div>
    </div>
  );
}

function JobsList() {
  // Mock jobs data
  const jobs = [
    {
      id: 'job_1',
      areaName: 'Tower Hamlets',
      status: 'processing',
      progress: 65,
      stage: 'Calculating optimal route',
      startedAt: new Date(Date.now() - 300000), // 5 minutes ago
    },
    {
      id: 'job_2',
      areaName: 'Camden',
      status: 'queued',
      progress: 0,
      stage: 'Waiting in queue',
      startedAt: null,
    },
  ];

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No active jobs</h3>
        <p className="mt-1 text-sm text-gray-500">Generate a route to see processing jobs here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <div key={job.id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-900">{job.areaName}</h4>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                job.status === 'processing'
                  ? 'bg-blue-100 text-blue-800'
                  : job.status === 'queued'
                    ? 'bg-yellow-100 text-yellow-800'
                    : job.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
              }`}
            >
              {job.status}
            </span>
          </div>

          <div className="mb-2">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{job.stage}</span>
              <span>{job.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              ></div>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>Job ID: {job.id}</span>
            <span>
              {job.startedAt
                ? `Started ${new Date(job.startedAt).toLocaleTimeString()}`
                : 'Not started'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RoutesList() {
  // Mock routes data
  const routes = [
    {
      id: 'route_1',
      areaName: 'Tower Hamlets',
      profile: 'driving-car',
      totalDistance: 47.2,
      estimatedTime: 8.5,
      chunks: 12,
      createdAt: new Date(Date.now() - 86400000), // 1 day ago
    },
    {
      id: 'route_2',
      areaName: 'Camden',
      profile: 'driving-car',
      totalDistance: 31.8,
      estimatedTime: 5.2,
      chunks: 8,
      createdAt: new Date(Date.now() - 172800000), // 2 days ago
    },
  ];

  if (routes.length === 0) {
    return (
      <div className="text-center py-8">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No routes generated</h3>
        <p className="mt-1 text-sm text-gray-500">
          Generate your first coverage route to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Area
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Profile
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Distance
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Est. Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Chunks
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {routes.map((route) => (
            <tr key={route.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {route.areaName}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{route.profile}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {route.totalDistance} km
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {route.estimatedTime} hrs
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{route.chunks}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {route.createdAt.toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <Link href={`/routes/${route.id}`} className="text-blue-600 hover:text-blue-900">
                  View
                </Link>
                <Link
                  href={`/map?route=${route.id}`}
                  className="text-green-600 hover:text-green-900"
                >
                  Map
                </Link>
                <button className="text-purple-600 hover:text-purple-900">Download</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
