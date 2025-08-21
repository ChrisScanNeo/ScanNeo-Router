'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { MapboxMap } from '@/components/MapboxMap';

export default function MapPage() {
  const searchParams = useSearchParams();
  const [selectedLayer, setSelectedLayer] = useState<'areas' | 'routes' | 'coverage'>('areas');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [areas, setAreas] = useState<{ id: string; name: string }[]>([]);
  const [routes, setRoutes] = useState<{ id: string; area_name: string; status: string }[]>([]);

  useEffect(() => {
    // Check for route query parameter
    const routeId = searchParams.get('route');
    if (routeId) {
      setSelectedLayer('routes');
      setSelectedRoute(routeId);
    }
  }, [searchParams]);

  useEffect(() => {
    // Fetch areas for the filter dropdown
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

  useEffect(() => {
    // Fetch routes for the filter dropdown
    const fetchRoutes = async () => {
      try {
        const response = await fetch('/api/routes');
        if (response.ok) {
          const data = await response.json();
          // Filter for completed routes
          const completedRoutes = data.filter((r: { status: string }) => r.status === 'completed');
          setRoutes(completedRoutes);
        }
      } catch (error) {
        console.error('Error fetching routes:', error);
      }
    };

    if (selectedLayer === 'routes') {
      fetchRoutes();
    }
  }, [selectedLayer]);

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
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
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
                  disabled={selectedLayer !== 'routes'}
                >
                  <option value="">All routes</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.area_name}
                    </option>
                  ))}
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
    <MapboxMap
      selectedLayer={selectedLayer as 'areas' | 'routes' | 'coverage'}
      selectedArea={selectedArea}
      selectedRoute={selectedRoute}
    />
  );
}
