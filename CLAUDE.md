# ScanNeo-Router Development Standards

## Project Overview

ScanNeo-Router is a city coverage routing system that generates optimal driving routes for complete street coverage, with real-time navigation and rerouting capabilities.

## Core Principles

1. **No Dummy Data**: Always use real API responses and actual data fixtures
2. **Test-Driven Development**: Write tests before implementation
3. **Component Reusability**: Build once, use everywhere
4. **Type Safety**: Strict TypeScript with no `any` types
5. **Performance First**: Optimize for mobile and low-bandwidth scenarios

## Repository Structure

d

```
/ScanNeo-Router
├── /apps
│   ├── /admin          # Next.js admin dashboard (Vercel)
│   ├── /navigator      # React Native mobile app (Expo)
│   └── /worker         # Python worker service (Cloud Run)
├── /packages
│   ├── /shared         # Shared utilities and types
│   ├── /ui             # Shared UI components
│   └── /config         # Shared configurations
├── /scripts
│   ├── /auth           # Authentication tests
│   ├── /coverage       # Coverage algorithm tests
│   ├── /navigation     # Navigation logic tests
│   ├── /api            # API endpoint tests
│   ├── /e2e            # End-to-end tests
│   └── /integration    # Integration tests
├── /infra
│   ├── /sql            # Database schemas and migrations
│   ├── /docker         # Docker configurations
│   └── /terraform      # Infrastructure as code
└── /docs
    ├── /api            # API documentation
    ├── /architecture   # System design docs
    └── /deployment     # Deployment guides
```

## Testing Standards

### Test Organization

- **Location**: All test scripts must be in `/scripts/{feature}/`
- **Naming**: `{component}.test.ts` for unit tests, `{feature}.e2e.ts` for E2E
- **Coverage**: Minimum 80% code coverage for critical paths
- **Data**: Use fixtures from real API responses stored in `/scripts/fixtures/`

### Test Requirements

Every component MUST have:

1. Unit test file (`Component.test.tsx`)
2. Story file for visual testing (`Component.stories.tsx`)
3. Type definitions (`Component.types.ts`)
4. Documentation in JSDoc format

### Test Execution Commands

```bash
pnpm test              # Run all tests
pnpm test:unit         # Unit tests only
pnpm test:e2e          # E2E tests only
pnpm test:coverage     # Generate coverage report
pnpm test:visual       # Visual regression tests
```

## React/React Native Standards

### Component Structure

```typescript
// Component.tsx
export const Component: FC<ComponentProps> = ({ prop1, prop2 }) => {
  // Hooks at the top
  const [state, setState] = useState<StateType>();

  // Custom hooks
  const { data, loading } = useCustomHook();

  // Handlers
  const handleAction = useCallback(() => {
    // Implementation
  }, [dependencies]);

  // Effects
  useEffect(() => {
    // Side effects
  }, [dependencies]);

  // Early returns for loading/error states
  if (loading) return <LoadingState />;

  // Main render
  return <View>{/* Component JSX */}</View>;
};

// Component.test.tsx
describe('Component', () => {
  it('renders correctly with props', () => {});
  it('handles user interactions', () => {});
  it('manages state changes', () => {});
});
```

### Reusable Components Rules

1. Must be in `/packages/ui/src/components/`
2. Must export from package index
3. Must have Storybook stories
4. Must support theming
5. Must be accessibility compliant (WCAG 2.1 AA)

### Custom Hooks

- Location: `/packages/shared/src/hooks/`
- Prefix with `use`
- Return consistent shape: `{ data, loading, error, refetch }`
- Include cleanup in useEffect

## API Standards

### Endpoint Structure

```typescript
// /apps/admin/app/api/[resource]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth';
import { handleError } from '@/lib/errors';

const RequestSchema = z.object({
  // Define request schema
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const user = await verifyAuth(req);
    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    // 2. Validation
    const body = await req.json();
    const validated = RequestSchema.parse(body);

    // 3. Business logic
    const result = await processRequest(validated);

    // 4. Response
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
```

### API Testing

```typescript
// /scripts/api/resource.test.ts
describe('POST /api/resource', () => {
  it('requires authentication', async () => {});
  it('validates request body', async () => {});
  it('processes valid requests', async () => {});
  it('handles errors gracefully', async () => {});
});
```

## Database Standards

### Schema Conventions

- Use UUID for primary keys
- Include `created_at` and `updated_at` timestamps
- Use PostGIS for geographic data
- Index foreign keys and frequently queried columns
- Use JSONB for flexible data structures

### Migration Rules

1. Never modify existing migrations
2. Always provide rollback scripts
3. Test migrations on staging first
4. Use semantic versioning for migrations

## Code Quality Standards

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### ESLint Rules

- No console.log in production code
- Prefer const over let
- No unused variables
- Explicit return types for functions
- Sorted imports

### Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true
}
```

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code improvements
- `test/description` - Test additions
- `docs/description` - Documentation updates

### Commit Messages

```
type(scope): subject

body (optional)

footer (optional)
```

Types: feat, fix, docs, style, refactor, test, chore

### Pre-commit Checks

1. Linting passes
2. Types check
3. Tests pass
4. No secrets in code
5. Commit message format valid

## Security Standards

### Environment Variables

- Never commit `.env` files
- Use `.env.example` for documentation
- Validate all environment variables on startup
- Use separate keys for dev/staging/production

### API Security

- Rate limiting on all endpoints
- Input validation with Zod
- SQL injection prevention via parameterized queries
- XSS protection headers
- CORS configuration

### Authentication

- JWT tokens with short expiration
- Refresh token rotation
- Secure cookie settings
- Session invalidation on logout

## Performance Standards

### Mobile App

- Bundle size < 5MB
- Time to interactive < 3s
- Offline-first architecture
- Lazy loading for routes
- Image optimization

### Admin Dashboard

- Lighthouse score > 90
- Core Web Vitals passing
- Code splitting by route
- CDN for static assets
- Database query optimization

### Worker Service

- Process chunks in parallel
- Batch API requests
- Circuit breaker pattern
- Graceful degradation
- Memory efficient algorithms

## Monitoring & Logging

### Required Metrics

- API response times
- Error rates
- Database query performance
- Worker job completion times
- Mobile app crash rates

### Logging Standards

```typescript
logger.info('Operation completed', {
  userId: user.id,
  action: 'import_area',
  areaId: area.id,
  duration: endTime - startTime,
});
```

### Error Handling

```typescript
try {
  // Operation
} catch (error) {
  logger.error('Operation failed', {
    error: error.message,
    stack: error.stack,
    context: {
      /* relevant data */
    },
  });

  // User-friendly error
  throw new UserError('Something went wrong. Please try again.');
}
```

## Deployment Standards

### Environment Progression

1. Local development
2. Feature branch preview
3. Staging environment
4. Production deployment

### Release Checklist

- [ ] All tests passing
- [ ] Code reviewed by 2+ developers
- [ ] Documentation updated
- [ ] Database migrations tested
- [ ] Performance benchmarks met
- [ ] Security scan completed
- [ ] Rollback plan documented

## Automation Tools

### Recommended Testing Tools

- **Unit/Integration**: Jest + React Testing Library
- **E2E Web**: Playwright
- **E2E Mobile**: Detox
- **API Testing**: Supertest
- **Visual Regression**: Percy or Chromatic
- **Load Testing**: k6
- **Security**: OWASP ZAP

### CI/CD Pipeline

```yaml
# GitHub Actions workflow stages
1. Install dependencies
2. Run linters
3. Type check
4. Run unit tests
5. Run integration tests
6. Build applications
7. Run E2E tests
8. Deploy to staging
9. Run smoke tests
10. Deploy to production
```

## Development Commands

### Quick Start

```bash
# Install dependencies
pnpm install

# Start development
pnpm dev

# Run specific app
pnpm dev:admin
pnpm dev:navigator
pnpm dev:worker

# Testing
pnpm test
pnpm test:watch
pnpm test:coverage

# Linting & Formatting
pnpm lint
pnpm format

# Type checking
pnpm typecheck

# Build
pnpm build
```

## Support & Resources

### Documentation

- API Docs: `/docs/api/`
- Architecture: `/docs/architecture/`
- Deployment: `/docs/deployment/`

### External Resources

- [Neon PostgreSQL Docs](https://neon.tech/docs)
- [OpenRouteService API](https://openrouteservice.org/dev)
- [Expo Documentation](https://docs.expo.dev)
- [Next.js Documentation](https://nextjs.org/docs)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)

## Current Project Status (Updated 2025-08-20 - Afternoon)

### 📊 Today's Progress Summary (20th August - Afternoon)

**Major Achievements:**

1. ✅ Fixed route generation UI to show real-time job status
2. ✅ Built complete Python worker service with FastAPI
3. ✅ Implemented Chinese Postman algorithm for optimal routing
4. ✅ Set up GCP deployment infrastructure (Artifact Registry, IAM)
5. ✅ Successfully tested worker with production database
6. ✅ Fixed CI/CD pipeline issues (Turbo, TypeScript configs)

**Current Blockers:**

- TypeScript strict null checks in shared package (being fixed)
- Awaiting final CI pass before Cloud Run deployment

**Next Session Focus:**

- Complete TypeScript fixes
- Deploy worker to Cloud Run
- Test full end-to-end route generation flow

### ✅ Deployment Status

- **Vercel Deployment**: Successfully deployed and operational!
- **Live URL**: https://scanneo-router-admin.vercel.app
- **Database**: Neon PostgreSQL with PostGIS enabled and connected
- **Project**: scanneo-router-admin
- **Worker Service**: Ready for Cloud Run deployment (europe-west2)
- **Configuration**:
  - Root Directory set to `apps/admin` in Vercel Dashboard
  - Monorepo properly configured without vercel.json
  - Build command: `pnpm build`
  - Install command: `pnpm install --frozen-lockfile`
  - All environment variables configured
  - Artifact Registry: `europe-west2-docker.pkg.dev/scanneo-webapp/scanneo-docker`

### ✅ Phase 1: Core Infrastructure (Complete)

- Monorepo structure with Turborepo
- Next.js admin dashboard with comprehensive UI
- PostgreSQL with PostGIS (Neon)
- Firebase Authentication (backend ready)
- Redis queue system (Upstash)
- OpenRouteService integration
- Mapbox integration (frontend ready)

### ✅ Phase 2: Admin Interface & Database Integration (Complete)

#### UI Features

- **Dashboard** (`/`) - Status cards with ScanNeo branding, quick actions
- **Areas Page** (`/areas`) - Fully functional GeoJSON import with database storage
- **Routes Page** (`/routes`) - Route generation with real-time job tracking
- **Map Page** (`/map`) - Full Mapbox integration with area visualization
- **ScanNeo Branding** - Complete brand identity with logo, colors, and typography
- **Toast Notifications** - Professional notifications replacing browser alerts

#### Backend Features

- **Database Integration** - Neon PostgreSQL with PostGIS for spatial data
- **Areas CRUD API** - Full create, read, delete operations for areas
- **GeoJSON Storage** - Convert and store GeoJSON as PostGIS geometry
- **Health Check Endpoints** - Monitor database and PostGIS status
- **Real Data Persistence** - All areas stored in production database

### ✅ Phase 3: Map Visualization & Route Generation Frontend (Complete)

#### Completed Features

- **Map Integration**:
  - ✅ Mapbox GL JS fully implemented
  - ✅ GeoJSON areas displayed on map
  - ✅ Area boundaries with metadata popups
  - ✅ Interactive pan/zoom/fullscreen controls

- **Route Generation Frontend**:
  - ✅ Dynamic area selection from database
  - ✅ Chunk duration configuration
  - ✅ Job creation with unique IDs
  - ✅ Real-time job status monitoring
  - ✅ Route listing with status badges
  - ✅ Auto-refresh every 5 seconds
  - ✅ Database persistence in coverage_routes table

### 🚧 Phase 4: Python Worker Service (90% Complete)

#### ✅ Completed Today (Afternoon Session)

- **Worker Service Structure**:
  - ✅ FastAPI application with async lifespan management
  - ✅ Database connection with psycopg2 pool
  - ✅ Job polling from coverage_routes table every 30 seconds
  - ✅ Local testing successful - connects to database and finds jobs
- **Coverage Algorithm Implementation**:
  - ✅ OSM street fetcher with Overpass API integration
  - ✅ NetworkX graph building from street segments
  - ✅ Chinese Postman algorithm solver
  - ✅ Route optimization with odd-degree node matching
  - ✅ Route chunking by duration (30min-2hr configurable)
- **Deployment Preparation**:
  - ✅ Docker configuration with multi-stage build
  - ✅ GitHub Actions workflow for Cloud Run deployment
  - ✅ GCloud CLI authentication setup locally
  - ✅ Artifact Registry repository created (scanneo-docker in europe-west2)
  - ✅ Service account configured with proper IAM roles

#### 🔧 Remaining Tasks

- **CI/CD Pipeline Fixes**:
  - ⚠️ TypeScript strict null checks in shared package need fixing
  - Turbo binary installation issue resolved
- **Final Deployment**:
  - Push worker to Cloud Run (waiting for CI fixes)
  - Test end-to-end route generation

### 📅 Phase 5: Mobile Navigator App (Planned)

- React Native with Expo
- Real-time navigation
- Offline mode support
- Voice guidance

## Admin Interface Features

### Dashboard (`/`)

- System status monitoring with live indicators
- Quick action cards with ScanNeo brand colors
- System information panel
- Central ScanNeo logo in header
- Professional navigation with brand colors

### Areas Management (`/areas`) - FULLY FUNCTIONAL

- **GeoJSON Import**:
  - Drag & drop or click to upload
  - Real-time file validation
  - Database persistence with PostGIS
- **Configuration Options**:
  - Area naming
  - Buffer distance (meters)
  - Routing profile (driving-car, driving-hgv, cycling, walking)
  - Service roads inclusion toggle
- **Areas List**:
  - Live data from database
  - Delete functionality
  - Auto-refresh on changes
- **Professional UI**:
  - Toast notifications for all actions
  - Loading states and error handling
  - ScanNeo brand colors throughout

### Route Management (`/routes`)

- **Route Generation**:
  - Area selection dropdown
  - Chunk duration configuration (30min - 2hrs)
  - Generate button with loading state
- **Job Monitoring**:
  - Active jobs list with progress bars
  - Status tracking (queued, processing, completed, error)
  - Job timing and stage information
- **Routes List**:
  - Generated routes table with statistics
  - Distance, time estimates, chunk counts
  - Action buttons (View, Map, Download)

### Map Visualization (`/map`) - ✅ COMPLETE

- **Mapbox GL JS Integration**: Fully interactive map with navigation controls
- **Layer Controls**: Toggle between Areas, Routes, Coverage views
- **Area Display**: Real-time visualization of imported GeoJSON areas
- **Filtering**: Filter by specific area or route
- **Statistics Panel**: Dynamic stats based on selected layer
- **Legend**: Color-coded legend for map elements
- **Interactive Features**:
  - Click areas for popup information
  - Zoom to fit imported areas
  - Pan, zoom, and fullscreen controls
  - Hover effects on areas

### API Integration - ✅ ENHANCED

- **Import Area** (`/api/import-area`):
  - Full PostGIS implementation
  - Supports Polygon, MultiPolygon, Feature, and FeatureCollection
  - Automatic geometry type conversion
  - Comprehensive error handling
- **Areas CRUD** (`/api/areas`, `/api/areas/[id]`):
  - List all areas with GeoJSON
  - Get individual area details
  - Delete areas by ID
- **Reroute Proxy** (`/api/reroute`): OpenRouteService integration
- **Coverage Endpoints**: Ready for backend worker integration
- **Authentication**: Firebase Admin SDK integration

## Development Status

### Current Working Features

- ✅ Admin dashboard with ScanNeo branding
- ✅ Area import with full GeoJSON support (Polygon, MultiPolygon, Features)
- ✅ Areas management with database persistence
- ✅ Individual area detail pages with map visualization
- ✅ Interactive Mapbox GL JS map visualization
- ✅ Route management interface (UI ready)
- ✅ Full API implementation for areas CRUD
- ✅ Database schema with PostGIS (supports all geometry types)
- ✅ Queue system with Upstash Redis
- ✅ Environment configuration
- ✅ Professional toast notifications
- ✅ Responsive design throughout

### GeoJSON Support

The system now fully supports various GeoJSON formats:

- **Simple Geometries**:
  - `Polygon` - Single connected area
  - `MultiPolygon` - Multiple disconnected areas (e.g., Portsmouth with islands)
- **Feature Objects**:
  - `Feature` with Polygon/MultiPolygon geometry
  - Includes properties metadata
- **Collections**:
  - `FeatureCollection` with multiple features
  - Automatically merged into single MultiPolygon for storage

### Database Migration

**Important**: If you have an existing database, run this migration to support MultiPolygon:

```sql
ALTER TABLE areas
  ALTER COLUMN geom TYPE GEOMETRY(GEOMETRY, 4326);
```

This changes the geometry column from `POLYGON` to generic `GEOMETRY` type.

### Next Implementation Priority

1. **Backend Worker Integration**: Connect route generation to actual processing
2. **Coverage Algorithm**: Implement Chinese Postman algorithm
3. **Authentication Flow**: Add Firebase Auth to frontend
4. **Route Chunking**: Split routes into navigable segments
5. **Progress Tracking**: Real-time route coverage tracking

## Review Checklist for Claude

When implementing features, ensure:

- [ ] Tests written before implementation
- [ ] No dummy/mock data in production code (except clearly marked demos)
- [ ] Components are reusable and tested
- [ ] TypeScript types are strict (no `any`)
- [ ] Code follows project structure
- [ ] Documentation is updated
- [ ] Performance impact considered
- [ ] Security implications reviewed
- [ ] Accessibility requirements met
- [ ] Error handling is comprehensive
- [ ] Responsive design implemented
- [ ] Demo functionality clearly marked with TODO comments
