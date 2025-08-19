# ScanNeo Router

A comprehensive city coverage routing system with real-time navigation and rerouting capabilities.

## 🚀 Live Deployment

- **Admin Dashboard**: https://scanneo-router-admin.vercel.app
- **API Status**: https://scanneo-router-admin.vercel.app/api/reroute

## 📋 Project Status

### ✅ Phase 1: Core Infrastructure (Complete)

- Monorepo structure with Turborepo
- Next.js admin dashboard deployed
- PostgreSQL with PostGIS (Neon)
- Firebase Authentication
- Redis queue system (Upstash)
- OpenRouteService integration
- Mapbox integration

### ✅ Phase 2: Coverage Algorithm (Complete)

- Grid-based coverage calculation
- Street network fetching from OpenStreetMap
- Chinese Postman algorithm for optimal routing
- Route validation and optimization
- Progress tracking system

### 🚧 Phase 3: Mobile Navigator App (In Progress)

- React Native with Expo
- Real-time navigation
- Offline mode support
- Voice guidance

### 📅 Phase 4: Python Worker Service (Planned)

- FastAPI service
- Background processing
- Route optimization

## 🚀 Quick Start (5 minutes)

This project uses live cloud services for both development and production through Vercel's environment UI.

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/scanneo-router.git
cd scanneo-router
pnpm install
```

### 2. Set up Cloud Services (Free Tiers)

1. **[Neon](https://neon.tech)** - PostgreSQL database
2. **[Upstash](https://upstash.com)** - Redis queue
3. **[Firebase](https://console.firebase.google.com)** - Authentication
4. **[OpenRouteService](https://openrouteservice.org)** - Routing API
5. **[Mapbox](https://mapbox.com)** - Maps

See [setup guide](docs/setup-live-services.md) for detailed instructions.

### 3. Connect to Vercel

```bash
npm i -g vercel
cd apps/admin
vercel link
```

### 4. Configure Environment Variables

Add your service credentials in Vercel Dashboard > Settings > Environment Variables, then:

```bash
vercel env pull .env.local
```

### 5. Start Development

```bash
pnpm dev:admin
```

Open http://localhost:3000 - You're now using live services!

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Admin Web     │────▶│   API Routes    │────▶│  Neon Database  │
│   (Next.js)     │     │   (Vercel)      │     │  (PostgreSQL)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │                          ▲
                              ▼                          │
                        ┌─────────────────┐              │
                        │  Upstash Redis  │              │
                        │    (Queue)      │              │
                        └─────────────────┘              │
                              │                          │
                              ▼                          │
┌─────────────────┐     ┌─────────────────┐              │
│  Navigator App  │────▶│  Worker Service │──────────────┘
│  (React Native) │     │    (Python)     │
└─────────────────┘     └─────────────────┘
```

## 📁 Project Structure

```
/ScanNeo-Router
├── /apps
│   ├── /admin          # Next.js admin dashboard (main app)
│   ├── /navigator      # React Native mobile app
│   └── /worker         # Python worker service
├── /packages
│   ├── /shared         # Shared utilities and types
│   ├── /ui             # Shared UI components
│   └── /config         # Shared configurations
├── /infra
│   └── /sql            # Database schema
└── /docs               # Documentation
```

## 🛠️ Technology Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Database**: Neon PostgreSQL with PostGIS
- **Queue**: Upstash Redis
- **Auth**: Firebase Authentication
- **Maps**: Mapbox, OpenRouteService
- **Deployment**: Vercel

## 🔑 Environment Management

All environment variables are managed through Vercel's dashboard:

1. Add variables in Vercel Dashboard > Settings > Environment Variables
2. Pull to local: `vercel env pull .env.local`
3. Never commit `.env.local` (it's gitignored)

## 📝 Development Workflow

```bash
# 1. Make changes
git checkout -b feature/your-feature

# 2. Test locally (uses live services)
pnpm dev:admin

# 3. Deploy preview
git push origin feature/your-feature
# Vercel creates preview deployment automatically

# 4. Merge to main for production
git checkout main
git merge feature/your-feature
git push origin main
# Vercel deploys to production automatically
```

## 🚢 Deployment

Deployment is automatic via Vercel:

- **Push to main** → Production deployment
- **Pull requests** → Preview deployments

Manual deployment:

```bash
cd apps/admin
vercel --prod
```

## 📚 Documentation

- [Live Services Setup](docs/setup-live-services.md) - Detailed setup with Vercel
- [Database Schema](infra/sql/schema.sql) - PostGIS database structure
- [Phase Guides](docs/Implementation/) - Implementation roadmap

## 🧪 API Testing

### Health Check

```bash
curl http://localhost:3000/api/reroute
```

### Route Calculation (requires auth)

```bash
curl -X POST http://localhost:3000/api/reroute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{
    "coordinates": [
      [-0.1276, 51.5074],
      [-0.1278, 51.5076]
    ]
  }'
```

## 💰 Free Tier Limits

All services have generous free tiers:

- **Neon**: 3GB storage
- **Upstash**: 10,000 commands/day
- **Firebase**: 50K auth/month
- **OpenRouteService**: 2,000 requests/day
- **Mapbox**: 50,000 loads/month
- **Vercel**: 100GB bandwidth

Perfect for solo development and early usage!

## 🐛 Troubleshooting

### Environment Variables Not Working?

```bash
# Re-pull from Vercel
vercel env pull .env.local
# Restart dev server
```

### Database Issues?

- Ensure PostGIS is enabled: `CREATE EXTENSION IF NOT EXISTS postgis;`
- Use pooled connection string from Neon
- Check `?sslmode=require` in connection string

### Quick Reset

```bash
# Clear and reinstall
rm -rf node_modules apps/*/node_modules
pnpm install
vercel env pull apps/admin/.env.local
```

## 🎯 Current Status

✅ **Phase 1 Complete**: Core infrastructure with live services
⏳ **Phase 2 Next**: Coverage algorithm implementation
📅 **Phase 3 Planned**: Navigation features
📅 **Phase 4 Planned**: Admin interface

## 🚀 Next Steps

1. Complete service setup (5 mins each):
   - [Neon](https://neon.tech) for database
   - [Upstash](https://upstash.com) for Redis
   - [Firebase](https://console.firebase.google.com) for auth
   - [OpenRouteService](https://openrouteservice.org) for routing
   - [Mapbox](https://mapbox.com) for maps

2. Add credentials to Vercel Dashboard

3. Start building!

---

Built with ❤️ for efficient city coverage routing
