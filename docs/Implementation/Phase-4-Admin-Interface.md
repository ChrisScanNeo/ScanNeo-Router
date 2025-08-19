# Phase 4: Admin Interface & Dashboard

## Overview

Build the Next.js admin dashboard for managing coverage areas, monitoring route generation, tracking coverage progress, and providing operational insights.

## Prerequisites (from Previous Phases)

- [ ] Database with areas, routes, and chunks
- [ ] Worker service processing jobs
- [ ] Authentication system configured
- [ ] API endpoints for area import

## Tasks

### 4.1 Admin Dashboard Setup

#### UI Components Library

```bash
cd apps/admin

# Install UI dependencies
npm install \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-select \
  @radix-ui/react-tabs \
  @radix-ui/react-toast \
  @tanstack/react-table \
  @tanstack/react-query \
  mapbox-gl \
  react-map-gl \
  recharts \
  date-fns \
  react-dropzone \
  react-hook-form \
  zod \
  @hookform/resolvers \
  lucide-react \
  clsx \
  tailwind-merge
```

#### Layout Structure

```typescript
// app/layout.tsx
import { Inter } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Navigation } from '@/components/navigation';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="flex h-screen">
            <Navigation />
            <main className="flex-1 overflow-auto bg-gray-50">
              {children}
            </main>
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
```

### 4.2 Area Management Interface

```typescript
// app/areas/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer } from '@/components/map-container';
import { AreaUploader } from '@/components/area-uploader';
import { AreaList } from '@/components/area-list';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AreasPage() {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const { data: areas, isLoading } = useQuery({
    queryKey: ['areas'],
    queryFn: fetchAreas,
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Coverage Areas</h1>
        <p className="text-gray-600">Manage and monitor coverage areas</p>
      </div>

      <Tabs defaultValue="map" className="space-y-4">
        <TabsList>
          <TabsTrigger value="map">Map View</TabsTrigger>
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="import">Import New</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-4">
          <MapContainer
            areas={areas}
            selectedArea={selectedArea}
            onAreaSelect={setSelectedArea}
          />
        </TabsContent>

        <TabsContent value="list">
          <AreaList
            areas={areas}
            onSelect={setSelectedArea}
            onBuildRoute={buildCoverageRoute}
          />
        </TabsContent>

        <TabsContent value="import">
          <AreaUploader onUploadComplete={refetchAreas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

#### Area Upload Component

```typescript
// components/area-uploader.tsx
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileJson, CheckCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const areaSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  buffer_m: z.number().min(0).max(100),
  profile: z.enum(['driving-car', 'driving-hgv']),
  includeService: z.boolean(),
  chunkDuration: z.number().min(600).max(7200),
});

export function AreaUploader({ onUploadComplete }) {
  const [geojson, setGeojson] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);

  const form = useForm({
    resolver: zodResolver(areaSchema),
    defaultValues: {
      name: '',
      buffer_m: 0,
      profile: 'driving-car',
      includeService: false,
      chunkDuration: 3600,
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        setGeojson(json);
        setPreview(json);

        // Auto-fill name from properties if available
        if (json.properties?.name) {
          form.setValue('name', json.properties.name);
        }
      } catch (error) {
        console.error('Invalid GeoJSON file');
      }
    };

    reader.readAsText(file);
  }, [form]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json', '.geojson'],
    },
    maxFiles: 1,
  });

  const onSubmit = async (data: z.infer<typeof areaSchema>) => {
    if (!geojson) return;

    const response = await fetch('/api/import-area', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify({
        ...data,
        geojson,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      onUploadComplete(result);
      form.reset();
      setGeojson(null);
      setPreview(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${geojson ? 'bg-green-50 border-green-500' : ''}
        `}
      >
        <input {...getInputProps()} />

        {geojson ? (
          <div className="space-y-2">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-green-700 font-medium">GeoJSON loaded successfully</p>
            <p className="text-sm text-gray-600">Drop another file to replace</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="w-12 h-12 text-gray-400 mx-auto" />
            <p className="text-gray-700">
              {isDragActive ? 'Drop the file here' : 'Drag & drop a GeoJSON file here'}
            </p>
            <p className="text-sm text-gray-500">or click to select</p>
          </div>
        )}
      </div>

      {/* Preview Map */}
      {preview && (
        <div className="h-64 rounded-lg overflow-hidden border">
          <MapPreview geojson={preview} />
        </div>
      )}

      {/* Configuration Form */}
      {geojson && (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Area Name</label>
            <input
              {...form.register('name')}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="e.g., Tower Hamlets"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Buffer (meters)</label>
              <input
                type="number"
                {...form.register('buffer_m', { valueAsNumber: true })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Vehicle Profile</label>
              <select
                {...form.register('profile')}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="driving-car">Car</option>
                <option value="driving-hgv">HGV/Truck</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Chunk Duration (seconds)
              </label>
              <input
                type="number"
                {...form.register('chunkDuration', { valueAsNumber: true })}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                {...form.register('includeService')}
                className="mr-2"
              />
              <label className="text-sm font-medium">
                Include service roads
              </label>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            Import Area & Start Processing
          </button>
        </form>
      )}
    </div>
  );
}
```

### 4.3 Route Monitoring Dashboard

```typescript
// app/routes/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RouteTable } from '@/components/route-table';
import { RouteStats } from '@/components/route-stats';
import { ChunkViewer } from '@/components/chunk-viewer';
import { CoverageMap } from '@/components/coverage-map';

export default function RoutesPage() {
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const { data: routes } = useQuery({
    queryKey: ['routes'],
    queryFn: fetchRoutes,
  });

  const { data: routeDetails } = useQuery({
    queryKey: ['route', selectedRoute],
    queryFn: () => fetchRouteDetails(selectedRoute),
    enabled: !!selectedRoute,
  });

  return (
    <div className="p-6">
      <RouteStats routes={routes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Active Routes</h2>
          <RouteTable
            routes={routes}
            onSelect={setSelectedRoute}
            selectedId={selectedRoute}
          />
        </div>

        <div className="space-y-4">
          {selectedRoute && routeDetails ? (
            <>
              <h2 className="text-lg font-semibold">Route Details</h2>
              <ChunkViewer route={routeDetails} />
              <CoverageMap route={routeDetails} />
            </>
          ) : (
            <div className="text-center text-gray-500 mt-12">
              Select a route to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

#### Route Statistics Component

```typescript
// components/route-stats.tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Clock, MapPin, TrendingUp } from 'lucide-react';

export function RouteStats({ routes }) {
  const stats = calculateStats(routes);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <StatCard
        title="Total Routes"
        value={stats.totalRoutes}
        icon={<MapPin className="w-5 h-5" />}
        change="+12%"
      />

      <StatCard
        title="Active Now"
        value={stats.activeRoutes}
        icon={<Activity className="w-5 h-5" />}
        change="+3"
      />

      <StatCard
        title="Avg Duration"
        value={`${stats.avgDuration}h`}
        icon={<Clock className="w-5 h-5" />}
        change="-15min"
      />

      <StatCard
        title="Coverage Rate"
        value={`${stats.coverageRate}%`}
        icon={<TrendingUp className="w-5 h-5" />}
        change="+5%"
      />
    </div>
  );
}

function StatCard({ title, value, icon, change }) {
  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-600 text-sm">{title}</span>
        {icon}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-sm text-green-600">{change}</span>
      </div>
    </div>
  );
}
```

### 4.4 Job Processing Monitor

```typescript
// components/job-monitor.tsx
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Job {
  id: string;
  areaId: string;
  areaName: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export function JobMonitor() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch('/api/jobs', {
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      });
      const data = await response.json();
      setJobs(data);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Processing Queue</h3>
        <Badge variant="outline">
          {jobs.filter(j => j.status === 'processing').length} Active
        </Badge>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}

        {jobs.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No jobs in queue
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  const getIcon = () => {
    switch (job.status) {
      case 'processing':
        return <RefreshCw className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (job.status) {
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {getIcon()}
          <span className="font-medium">{job.areaName}</span>
        </div>
        <Badge className={getStatusColor()}>
          {job.status}
        </Badge>
      </div>

      {job.status === 'processing' && (
        <>
          <div className="text-sm text-gray-600 mb-2">
            {job.stage}
          </div>
          <Progress value={job.progress} className="h-2" />
        </>
      )}

      {job.error && (
        <div className="text-sm text-red-600 mt-2">
          Error: {job.error}
        </div>
      )}

      <div className="text-xs text-gray-500 mt-2">
        Started: {job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : '-'}
        {job.completedAt && (
          <> • Completed: {new Date(job.completedAt).toLocaleTimeString()}</>
        )}
      </div>
    </div>
  );
}
```

### 4.5 Coverage Analytics

```typescript
// app/analytics/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateRangePicker } from '@/components/date-range-picker';
import { CoverageChart } from '@/components/coverage-chart';
import { EdgeHeatmap } from '@/components/edge-heatmap';
import { MissedStreetsTable } from '@/components/missed-streets-table';

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics', dateRange],
    queryFn: () => fetchAnalytics(dateRange),
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Coverage Analytics</h1>
        <p className="text-gray-600">Track coverage performance and identify gaps</p>
      </div>

      <div className="mb-6">
        <DateRangePicker
          value={dateRange}
          onChange={setDateRange}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Coverage Over Time</h2>
          <CoverageChart data={analytics?.coverageTimeline} />
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Street Coverage Heatmap</h2>
          <EdgeHeatmap data={analytics?.edgeHeatmap} />
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Missed Streets</h2>
          <MissedStreetsTable
            streets={analytics?.missedStreets}
            onGenerateMopUp={generateMopUpRoute}
          />
        </div>
      </div>
    </div>
  );
}
```

### 4.6 Export & Download Features

```typescript
// components/export-menu.tsx
import { Download, FileText, Map, Table } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ExportMenu({ routeId, chunkId }) {
  const handleExport = async (format: string) => {
    const response = await fetch(
      `/api/export/${format}?routeId=${routeId}&chunkId=${chunkId}`,
      {
        headers: { Authorization: `Bearer ${await getAuthToken()}` },
      }
    );

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `route-${routeId}-chunk-${chunkId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center space-x-2 px-3 py-2 border rounded-md hover:bg-gray-50">
          <Download className="w-4 h-4" />
          <span>Export</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => handleExport('gpx')}>
          <Map className="w-4 h-4 mr-2" />
          GPX File
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('geojson')}>
          <FileText className="w-4 h-4 mr-2" />
          GeoJSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')}>
          <Table className="w-4 h-4 mr-2" />
          CSV Instructions
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 4.7 Real-time Updates

```typescript
// hooks/useRealtimeUpdates.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource('/api/sse/updates', {
      withCredentials: true,
    });

    eventSource.addEventListener('job-update', (event) => {
      const data = JSON.parse(event.data);

      // Update job status in cache
      queryClient.setQueryData(['jobs'], (old: any) => {
        return old?.map((job: any) => (job.id === data.jobId ? { ...job, ...data } : job));
      });
    });

    eventSource.addEventListener('coverage-update', (event) => {
      const data = JSON.parse(event.data);

      // Invalidate coverage queries
      queryClient.invalidateQueries({ queryKey: ['coverage', data.routeId] });
    });

    return () => {
      eventSource.close();
    };
  }, [queryClient]);
}
```

## API Endpoints for Admin

```typescript
// app/api/admin/stats/route.ts
export async function GET(req: NextRequest) {
  const user = await verifyBearer(req.headers.get('authorization'));
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const stats = await sql`
    SELECT 
      COUNT(DISTINCT r.id) as total_routes,
      COUNT(DISTINCT CASE WHEN r.created_at > NOW() - INTERVAL '24 hours' THEN r.id END) as active_routes,
      AVG(r.drive_time_s)::INTEGER as avg_duration_s,
      COUNT(DISTINCT ce.edge_id)::FLOAT / COUNT(DISTINCT e.id) * 100 as coverage_rate
    FROM coverage_routes r
    LEFT JOIN covered_edges ce ON ce.route_id = r.id
    LEFT JOIN edges e ON e.area_id = r.area_id
  `;

  return NextResponse.json(stats[0]);
}

// app/api/admin/jobs/route.ts
export async function GET(req: NextRequest) {
  const user = await verifyBearer(req.headers.get('authorization'));
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  // Get job status from Redis
  const jobs = await redis.hgetall('job-status');

  const formattedJobs = Object.entries(jobs).map(([id, data]) => ({
    id,
    ...JSON.parse(data as string),
  }));

  return NextResponse.json(formattedJobs);
}

// app/api/export/[format]/route.ts
export async function GET(req: NextRequest, { params }) {
  const user = await verifyBearer(req.headers.get('authorization'));
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const routeId = searchParams.get('routeId');
  const format = params.format;

  let content: string;
  let contentType: string;

  switch (format) {
    case 'gpx':
      content = await generateGPX(routeId);
      contentType = 'application/gpx+xml';
      break;
    case 'geojson':
      content = await generateGeoJSON(routeId);
      contentType = 'application/json';
      break;
    case 'csv':
      content = await generateCSV(routeId);
      contentType = 'text/csv';
      break;
    default:
      return new NextResponse('Invalid format', { status: 400 });
  }

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="route-${routeId}.${format}"`,
    },
  });
}
```

## Testing Checkpoints

### UI Tests

- [ ] Area upload accepts GeoJSON files
- [ ] Map preview shows uploaded polygon
- [ ] Form validation works correctly
- [ ] Job queue updates in real-time

### Data Flow Tests

- [ ] Routes display after processing
- [ ] Chunks load with instructions
- [ ] Coverage statistics calculate correctly
- [ ] Export functions produce valid files

### Performance Tests

- [ ] Dashboard loads < 2 seconds
- [ ] Real-time updates don't cause lag
- [ ] Large route lists paginate properly
- [ ] Map renders smoothly with multiple areas

### Integration Tests

- [ ] Authentication required for all pages
- [ ] API calls include auth token
- [ ] Error states handled gracefully
- [ ] Data refreshes after mutations

## Deployment

```bash
# Build and deploy to Vercel
vercel --prod

# Environment variables needed:
# - All from Phase 1
# - NEXT_PUBLIC_MAPBOX_TOKEN
# - NEXT_PUBLIC_API_URL (if different from default)
```

## Deliverables

1. **Area Management**: Upload, configure, and manage coverage areas
2. **Route Monitoring**: Track route generation and view details
3. **Job Queue**: Real-time processing status and progress
4. **Coverage Analytics**: Visualize coverage and identify gaps
5. **Export Tools**: Download routes in multiple formats

## Success Criteria

- [ ] Can upload and process new areas
- [ ] Job progress visible in real-time
- [ ] Routes display with all chunks
- [ ] Coverage analytics show accurate data
- [ ] Exports work for GPX, GeoJSON, CSV
- [ ] Dashboard responsive on mobile devices

## Future Enhancements

- Fleet management and driver assignment
- Historical coverage comparison
- Route optimization suggestions
- Cost tracking and billing
- API usage monitoring
- Custom reporting builder
