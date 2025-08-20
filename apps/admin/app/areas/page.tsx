'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import showToast from '@/components/Toast';

export default function AreasPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Coverage Areas"
        subtitle="Import & Manage Areas"
        showBackButton={true}
        backHref="/"
        status="online"
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Import Section */}
          <div className="bg-white shadow-sm rounded-lg border border-[#1C2F38]/10 mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-semibold text-[#4C4FA3] mb-4">
                Import New Area
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Upload a GeoJSON file containing polygon boundaries to define a new coverage area.
              </p>

              <AreaImporter />
            </div>
          </div>

          {/* Areas List */}
          <div className="bg-white shadow-sm rounded-lg border border-[#1C2F38]/10">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg leading-6 font-semibold text-[#4C4FA3]">Existing Areas</h3>
                <button
                  onClick={() => window.dispatchEvent(new Event('areas-updated'))}
                  className="inline-flex items-center px-3 py-2 border border-[#1C2F38]/20 shadow-sm text-sm leading-4 font-medium rounded-md text-[#4C4FA3] bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00B140] transition-colors"
                >
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

              <AreasList />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function AreaImporter() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [areaName, setAreaName] = useState('');
  const [bufferDistance, setBufferDistance] = useState(0);
  const [profile, setProfile] = useState('driving-car');
  const [includeService, setIncludeService] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    processFile(file);
  };

  const processFile = (file: File | null | undefined) => {
    setError(null);

    if (!file) {
      setError('No file selected');
      return;
    }

    // Check file type
    if (!file.name.endsWith('.json') && !file.name.endsWith('.geojson')) {
      setError('Please select a GeoJSON file (.json or .geojson)');
      return;
    }

    setSelectedFile(file);
    if (!areaName) {
      setAreaName(file.name.replace('.geojson', '').replace('.json', ''));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    processFile(file);
  };

  const handleImport = async () => {
    if (!selectedFile || !areaName) return;

    setIsUploading(true);
    try {
      const geojsonText = await selectedFile.text();
      const geojson = JSON.parse(geojsonText);

      // Call the real API endpoint
      const response = await fetch('/api/import-area', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: areaName,
          geojson: geojson,
          buffer_m: bufferDistance,
          profile,
          includeService,
          chunkDuration: 3600, // Default to 1 hour chunks
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import area');
      }

      showToast.success(`Area "${areaName}" imported successfully!`);
      setError(null);

      // Trigger a refresh of the areas list
      window.dispatchEvent(new Event('areas-updated'));

      // Reset form
      setSelectedFile(null);
      setAreaName('');
      setBufferDistance(0);
      setProfile('driving-car');
      setIncludeService(false);
    } catch (error) {
      console.error('Import error:', error);
      setError(
        'Error processing GeoJSON: ' + (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-[#4C4FA3] mb-2">GeoJSON File</label>
        <div
          className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 ${isDragging ? 'border-[#00B140] bg-[#00B140]/5' : 'border-[#1C2F38]/20'} border-dashed rounded-md transition-colors`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="space-y-1 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex text-sm text-gray-600">
              <label
                htmlFor="file-upload"
                className="relative cursor-pointer bg-white rounded-md font-medium text-[#00B140] hover:text-[#00A038] focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[#00B140] transition-colors"
              >
                <span>Upload a file</span>
                <input
                  id="file-upload"
                  name="file-upload"
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  accept=".geojson,.json"
                  onChange={handleFileSelect}
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">GeoJSON files only</p>
          </div>
        </div>
        {selectedFile && (
          <p className="mt-2 text-sm text-green-600">Selected: {selectedFile.name}</p>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Area Configuration */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="area-name" className="block text-sm font-medium text-[#4C4FA3]">
            Area Name
          </label>
          <input
            type="text"
            name="area-name"
            id="area-name"
            value={areaName}
            onChange={(e) => setAreaName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-[#1C2F38]/20 rounded-md shadow-sm focus:ring-[#00B140] focus:border-[#00B140] sm:text-sm transition-colors"
            placeholder="e.g., Tower Hamlets"
          />
        </div>

        <div>
          <label htmlFor="buffer-distance" className="block text-sm font-medium text-[#4C4FA3]">
            Buffer Distance (meters)
          </label>
          <input
            type="number"
            name="buffer-distance"
            id="buffer-distance"
            value={bufferDistance}
            onChange={(e) => setBufferDistance(parseInt(e.target.value) || 0)}
            className="mt-1 block w-full px-3 py-2 border border-[#1C2F38]/20 rounded-md shadow-sm focus:ring-[#00B140] focus:border-[#00B140] sm:text-sm transition-colors"
            placeholder="0"
            min="0"
          />
        </div>

        <div>
          <label htmlFor="profile" className="block text-sm font-medium text-[#4C4FA3]">
            Routing Profile
          </label>
          <select
            id="profile"
            name="profile"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-[#1C2F38]/20 rounded-md shadow-sm focus:ring-[#00B140] focus:border-[#00B140] sm:text-sm transition-colors"
          >
            <option value="driving-car">Driving (Car)</option>
            <option value="driving-hgv">Driving (HGV)</option>
            <option value="cycling-regular">Cycling</option>
            <option value="foot-walking">Walking</option>
          </select>
        </div>

        <div className="flex items-center">
          <input
            id="include-service"
            name="include-service"
            type="checkbox"
            checked={includeService}
            onChange={(e) => setIncludeService(e.target.checked)}
            className="h-4 w-4 text-[#00B140] focus:ring-[#00B140] border-[#1C2F38]/20 rounded"
          />
          <label htmlFor="include-service" className="ml-2 block text-sm text-gray-900">
            Include Service Roads
          </label>
        </div>
      </div>

      {/* Import Button */}
      <div>
        <button
          onClick={handleImport}
          disabled={!selectedFile || !areaName || isUploading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#00B140] hover:bg-[#00A038] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#00B140] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isUploading ? (
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
              Importing...
            </>
          ) : (
            'Import Area'
          )}
        </button>
      </div>
    </div>
  );
}

function AreasList() {
  const [areas, setAreas] = useState<
    {
      id: string;
      name: string;
      profile: string;
      buffer_m: number;
      created_at: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAreas = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/areas');
      const data = await response.json();

      if (response.ok && data.success) {
        setAreas(data.areas);
      } else {
        setError(data.error || 'Failed to fetch areas');
      }
    } catch (err) {
      console.error('Error fetching areas:', err);
      setError('Failed to fetch areas');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    try {
      const response = await fetch(`/api/areas/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showToast.success(`Area "${name}" deleted successfully`);
        fetchAreas(); // Refresh the list
      } else {
        const data = await response.json();
        showToast.error(`Failed to delete area: ${data.error}`);
      }
    } catch (err) {
      console.error('Error deleting area:', err);
      showToast.error('Failed to delete area');
    }
  };

  useEffect(() => {
    fetchAreas();

    // Listen for area updates
    const handleUpdate = () => fetchAreas();
    window.addEventListener('areas-updated', handleUpdate);

    return () => {
      window.removeEventListener('areas-updated', handleUpdate);
    };
  }, []);

  if (loading) {
    return (
      <div className="text-center py-8">
        <svg
          className="animate-spin h-8 w-8 text-[#00B140] mx-auto"
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
        <p className="mt-2 text-sm text-gray-500">Loading areas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <svg
          className="mx-auto h-12 w-12 text-red-400"
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
        <h3 className="mt-2 text-sm font-medium text-gray-900">Error loading areas</h3>
        <p className="mt-1 text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchAreas}
          className="mt-4 inline-flex items-center px-3 py-2 border border-[#1C2F38]/20 shadow-sm text-sm leading-4 font-medium rounded-md text-[#4C4FA3] bg-white hover:bg-gray-50 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (areas.length === 0) {
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
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No areas</h3>
        <p className="mt-1 text-sm text-gray-500">
          Get started by importing your first coverage area.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-[#4C4FA3] uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-[#4C4FA3] uppercase tracking-wider">
              Profile
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-[#4C4FA3] uppercase tracking-wider">
              Buffer
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-[#4C4FA3] uppercase tracking-wider">
              Created
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-[#4C4FA3] uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {areas.map((area) => (
            <tr key={area.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#1C2F38]">
                {area.name}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{area.profile}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {area.buffer_m}m
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(area.created_at).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-3">
                  <Link
                    href={`/areas/${area.id}`}
                    className="text-[#00B140] hover:text-[#00A038] transition-colors"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(area.id, area.name)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
