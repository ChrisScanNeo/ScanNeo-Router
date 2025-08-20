'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';

export default function MapPage() {
  const [selectedLayer, setSelectedLayer] = useState<'areas' | 'routes' | 'coverage'>('areas');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Interactive Map"
        subtitle="Visualize Areas & Routes"
        showBackButton={true}
        backHref="/"
        status="online"
      />

      {/* Map Container */}
      <div className="flex h-[calc(100vh-88px)]">
        {/* Sidebar */}
        <div className="w-80 bg-white shadow-lg border-r flex flex-col">
          {/* Layer Controls */}
          <div className="p-4 border-b">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Map Layers</h3>
            <div className="space-y-3">
              <LayerToggle
                label="Coverage Areas"
                description="Imported polygon boundaries"
                color="blue"
                active={selectedLayer === 'areas'}
                onClick={() => setSelectedLayer('areas')}
              />
              <LayerToggle
                label="Generated Routes"
                description="Optimal coverage paths"
                color="green"
                active={selectedLayer === 'routes'}
                onClick={() => setSelectedLayer('routes')}
              />
              <LayerToggle
                label="Coverage Progress"
                description="Completed road segments"
                color="purple"
                active={selectedLayer === 'coverage'}
                onClick={() => setSelectedLayer('coverage')}
              />
            </div>
          </div>

          {/* Filter Controls */}
          <div className="p-4 border-b">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Filters</h3>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="area-filter"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Filter by Area
                </label>
                <select
                  id="area-filter"
                  value={selectedArea}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All areas</option>
                  <option value="tower-hamlets">Tower Hamlets</option>
                  <option value="camden">Camden</option>
                  <option value="westminster">Westminster</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="route-filter"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Filter by Route
                </label>
                <select
                  id="route-filter"
                  value={selectedRoute}
                  onChange={(e) => setSelectedRoute(e.target.value)}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="">All routes</option>
                  <option value="route-1">Tower Hamlets Route 1</option>
                  <option value="route-2">Camden Route 1</option>
                </select>
              </div>
            </div>
          </div>

          {/* Map Statistics */}
          <div className="p-4 flex-1">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Statistics</h3>
            <MapStats selectedLayer={selectedLayer} />
          </div>

          {/* Legend */}
          <div className="p-4 border-t">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Legend</h3>
            <MapLegend selectedLayer={selectedLayer} />
          </div>
        </div>

        {/* Map Area */}
        <div className="flex-1 relative">
          <MapContainer
            selectedLayer={selectedLayer}
            selectedArea={selectedArea}
            selectedRoute={selectedRoute}
          />
        </div>
      </div>
    </div>
  );
}

function LayerToggle({
  label,
  description,
  color,
  active,
  onClick,
}: {
  label: string;
  description: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full p-3 text-left border-2 rounded-lg transition-all ${
        active
          ? colorClasses[color as keyof typeof colorClasses] + ' ring-2 ring-offset-2 ring-blue-500'
          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">{label}</div>
          <div className="text-xs text-gray-500 mt-1">{description}</div>
        </div>
        <div
          className={`w-3 h-3 rounded-full ${
            color === 'blue' ? 'bg-blue-500' : color === 'green' ? 'bg-green-500' : 'bg-purple-500'
          }`}
        ></div>
      </div>
    </button>
  );
}

function MapStats({ selectedLayer }: { selectedLayer: string }) {
  const statsData = {
    areas: [
      { label: 'Total Areas', value: '3', unit: '' },
      { label: 'Total Area', value: '127.5', unit: 'km²' },
      { label: 'Avg Buffer', value: '25', unit: 'm' },
    ],
    routes: [
      { label: 'Total Routes', value: '5', unit: '' },
      { label: 'Total Distance', value: '248.7', unit: 'km' },
      { label: 'Avg Chunks', value: '12', unit: '' },
    ],
    coverage: [
      { label: 'Roads Covered', value: '2,847', unit: '' },
      { label: 'Coverage %', value: '67.3', unit: '%' },
      { label: 'Remaining', value: '1,384', unit: 'roads' },
    ],
  };

  const stats = statsData[selectedLayer as keyof typeof statsData] || [];

  return (
    <div className="space-y-3">
      {stats.map((stat, index) => (
        <div key={index} className="flex justify-between items-center">
          <span className="text-sm text-gray-600">{stat.label}</span>
          <span className="text-sm font-medium text-gray-900">
            {stat.value}
            {stat.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function MapLegend({ selectedLayer }: { selectedLayer: string }) {
  const legends = {
    areas: [
      { color: 'bg-blue-500', label: 'Area Boundaries' },
      { color: 'bg-blue-200', label: 'Buffer Zones' },
    ],
    routes: [
      { color: 'bg-green-500', label: 'Optimal Route' },
      { color: 'bg-yellow-500', label: 'Route Chunks' },
      { color: 'bg-red-500', label: 'Turn Points' },
    ],
    coverage: [
      { color: 'bg-green-500', label: 'Covered Roads' },
      { color: 'bg-gray-400', label: 'Uncovered Roads' },
      { color: 'bg-purple-500', label: 'In Progress' },
    ],
  };

  const items = legends[selectedLayer as keyof typeof legends] || [];

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded ${item.color}`}></div>
          <span className="text-xs text-gray-600">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function MapContainer({
  selectedLayer,
  selectedArea,
  selectedRoute,
}: {
  selectedLayer: string;
  selectedArea: string;
  selectedRoute: string;
}) {
  return (
    <div className="h-full bg-gray-100 relative">
      {/* Placeholder for actual map */}
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">Interactive Map View</h3>
          <p className="text-gray-500 mb-4">
            Displaying: <span className="capitalize font-medium">{selectedLayer}</span>
            {selectedArea && <span> • Area: {selectedArea}</span>}
            {selectedRoute && <span> • Route: {selectedRoute}</span>}
          </p>
          <div className="text-sm text-gray-400">
            <p>🗺️ Mapbox integration would render here</p>
            <p>📍 Interactive markers and overlays</p>
            <p>🛣️ Route visualization and area boundaries</p>
          </div>
        </div>
      </div>

      {/* Map Controls */}
      <div className="absolute top-4 right-4 space-y-2">
        <button className="bg-white p-2 rounded-lg shadow-md hover:bg-gray-50">
          <svg
            className="h-5 w-5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button className="bg-white p-2 rounded-lg shadow-md hover:bg-gray-50">
          <svg
            className="h-5 w-5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button className="bg-white p-2 rounded-lg shadow-md hover:bg-gray-50">
          <svg
            className="h-5 w-5 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </button>
      </div>

      {/* Status Indicator */}
      <div className="absolute bottom-4 left-4">
        <div className="bg-white px-3 py-2 rounded-lg shadow-md">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600">Map Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
