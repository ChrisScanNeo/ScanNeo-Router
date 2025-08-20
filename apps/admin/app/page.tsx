import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-[#1C2F38]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-[#4C4FA3]">ScanNeo Router</h1>
              <span className="ml-2 px-2 py-1 bg-[#00B140]/10 text-[#00B140] text-xs font-medium rounded-full">
                Admin Dashboard
              </span>
            </div>
            <div className="flex-shrink-0">
              <Image
                src="/scanneo-logo.svg"
                alt="ScanNeo"
                width={150}
                height={40}
                className="h-10 w-auto"
                priority
              />
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">System Online</span>
              <div className="w-2 h-2 bg-[#00B140] rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Status Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-[#1C2F38]/10">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-[#00B140] rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">✓</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">API Status</dt>
                      <dd className="text-lg font-medium text-gray-900">Active</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-[#1C2F38]/10">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-[#4C4FA3] rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">DB</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Database</dt>
                      <dd className="text-lg font-medium text-gray-900">Connected</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-[#1C2F38]/10">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-[#A6CE39] rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">🗺️</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Areas</dt>
                      <dd className="text-lg font-medium text-gray-900">0</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-[#1C2F38]/10">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-[#1C2F38] rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">🚗</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Routes</dt>
                      <dd className="text-lg font-medium text-gray-900">0</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white shadow-sm rounded-lg border border-[#1C2F38]/10 mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-semibold text-[#4C4FA3] mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Link
                  href="/areas"
                  className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#00B140] border border-[#1C2F38]/20 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <span className="rounded-lg inline-flex p-3 bg-[#4C4FA3]/10 text-[#4C4FA3] ring-4 ring-white">
                      <svg
                        className="h-6 w-6"
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
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-lg font-medium text-[#4C4FA3]">
                      <span className="absolute inset-0" aria-hidden="true" />
                      Import Area
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Upload GeoJSON boundaries to define coverage areas
                    </p>
                  </div>
                </Link>

                <Link
                  href="/routes"
                  className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#00B140] border border-[#1C2F38]/20 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <span className="rounded-lg inline-flex p-3 bg-[#00B140]/10 text-[#00B140] ring-4 ring-white">
                      <svg
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-lg font-medium text-[#4C4FA3]">
                      <span className="absolute inset-0" aria-hidden="true" />
                      Generate Routes
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Create optimized coverage routes using Chinese Postman algorithm
                    </p>
                  </div>
                </Link>

                <Link
                  href="/map"
                  className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#00B140] border border-[#1C2F38]/20 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <span className="rounded-lg inline-flex p-3 bg-[#A6CE39]/10 text-[#A6CE39] ring-4 ring-white">
                      <svg
                        className="h-6 w-6"
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
                    </span>
                  </div>
                  <div className="mt-4">
                    <h3 className="text-lg font-medium text-[#4C4FA3]">
                      <span className="absolute inset-0" aria-hidden="true" />
                      View Map
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      Interactive map view of areas and generated routes
                    </p>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* System Information */}
          <div className="bg-white shadow-sm rounded-lg border border-[#1C2F38]/10">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-semibold text-[#4C4FA3] mb-4">
                System Information
              </h3>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Version</dt>
                  <dd className="mt-1 text-sm text-gray-900">Phase 2.0 - Coverage Algorithm</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Deployment</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    <a
                      href="https://scanneo-router-admin.vercel.app"
                      className="text-blue-600 hover:text-blue-500"
                    >
                      scanneo-router-admin.vercel.app
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Database</dt>
                  <dd className="mt-1 text-sm text-gray-900">Neon PostgreSQL with PostGIS</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Queue</dt>
                  <dd className="mt-1 text-sm text-gray-900">Upstash Redis</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Maps</dt>
                  <dd className="mt-1 text-sm text-gray-900">Mapbox + OpenRouteService</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Authentication</dt>
                  <dd className="mt-1 text-sm text-gray-900">Firebase Admin</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
