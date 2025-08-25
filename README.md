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

### ✅ Phase 2: Admin Interface (Complete)

- Comprehensive dashboard with status monitoring
- Area import interface with GeoJSON upload
- Route management with job monitoring
- Interactive map visualization with Mapbox
- Professional responsive UI with Tailwind CSS
- Real-time route generation status

### ✅ Phase 3: Python Worker Service (Complete)

- FastAPI service for route processing
- Chinese Postman algorithm implementation
- Street network fetching from OpenStreetMap
- Route optimization with NetworkX
- Deployed to Google Cloud Run
- Real-time job processing from database queue

### ✅ Phase 4: Turn-by-Turn Navigator (Complete)

- **Tablet-optimized navigation interface**
- **Real-time GPS tracking**
- **Coverage progress visualization**
- **Automatic off-route detection and rerouting**
- **Large touch-friendly controls**
- **Color-coded route segments (covered/upcoming)**
- **No app installation required - runs in browser**

### 🚧 Phase 5: Mobile App (Future)

- React Native with Expo
- Offline map support
- Voice guidance
- Background tracking

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

## 🚗 Navigator Features

### Turn-by-Turn Navigation
- **Real-time GPS tracking** with 1Hz update rate
- **Coverage visualization** - streets turn green as you drive them
- **Progress tracking** - see percentage of route completed
- **Off-route detection** - alerts when >50m from route
- **Automatic rerouting** - calculates path back to route
- **Tablet-optimized UI** - large buttons, high contrast
- **No installation needed** - runs in any modern browser

### How to Navigate
1. Generate a coverage route for your area
2. Click "Navigate" on any completed route
3. Mount tablet securely in vehicle
4. Press "Start Navigation" to begin
5. Follow the blue route - it turns green as you cover streets
6. System auto-reroutes if you go off course

### Testing Navigation
- Use browser DevTools to simulate GPS (see [Test Guide](docs/NAVIGATOR_TEST_GUIDE.md))
- Test with real device for actual GPS tracking
- Coverage progress saved to database

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Python FastAPI, NetworkX for routing algorithms
- **Database**: Neon PostgreSQL with PostGIS
- **Queue**: Upstash Redis
- **Auth**: Firebase Authentication
- **Maps**: Mapbox GL JS, OpenRouteService API
- **Deployment**: Vercel (frontend), Google Cloud Run (worker)

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
✅ **Phase 2 Complete**: Comprehensive admin interface with demo functionality
⏳ **Phase 3 In Progress**: Backend integration and coverage algorithms
📅 **Phase 4 Planned**: Mobile navigation app
📅 **Phase 5 Planned**: Python worker service

### 🖥️ Live Admin Features

- **Dashboard**: System monitoring and quick navigation
- **Areas**: GeoJSON import with configuration options
- **Routes**: Route generation and job progress tracking
- **Map**: Interactive visualization with layer controls
- **APIs**: Area import, rerouting, and coverage endpoints

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
