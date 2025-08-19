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

## Review Checklist for Claude

When implementing features, ensure:

- [ ] Tests written before implementation
- [ ] No dummy/mock data in production code
- [ ] Components are reusable and tested
- [ ] TypeScript types are strict (no `any`)
- [ ] Code follows project structure
- [ ] Documentation is updated
- [ ] Performance impact considered
- [ ] Security implications reviewed
- [ ] Accessibility requirements met
- [ ] Error handling is comprehensive
