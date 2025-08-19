#!/bin/bash

# Setup Check Script for ScanNeo-Router
# Verifies that all services are configured correctly

echo "========================================="
echo "ScanNeo-Router Setup Check"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Vercel CLI is installed
echo -e "\n${YELLOW}Checking Vercel CLI...${NC}"
if command -v vercel &> /dev/null; then
    VERCEL_VERSION=$(vercel --version)
    echo -e "${GREEN}✓${NC} Vercel CLI installed: $VERCEL_VERSION"
else
    echo -e "${RED}✗${NC} Vercel CLI not found. Install with: npm i -g vercel"
    exit 1
fi

# Check if .env.local exists
echo -e "\n${YELLOW}Checking environment configuration...${NC}"
if [ -f "apps/admin/.env.local" ]; then
    echo -e "${GREEN}✓${NC} .env.local exists"
    
    # Check for required variables (without exposing values)
    check_env_var() {
        if grep -q "^$1=" "apps/admin/.env.local" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} $1 is configured"
        else
            echo -e "${RED}✗${NC} $1 is missing"
        fi
    }
    
    echo -e "\n  Required variables:"
    check_env_var "DATABASE_URL"
    check_env_var "FIREBASE_PROJECT_ID"
    check_env_var "FIREBASE_CLIENT_EMAIL"
    check_env_var "FIREBASE_PRIVATE_KEY"
    check_env_var "ORS_API_KEY"
    check_env_var "UPSTASH_REDIS_REST_URL"
    check_env_var "UPSTASH_REDIS_REST_TOKEN"
    check_env_var "NEXT_PUBLIC_MAPBOX_TOKEN"
else
    echo -e "${YELLOW}!${NC} .env.local not found"
    echo -e "    Run: ${BLUE}cd apps/admin && vercel env pull .env.local${NC}"
fi

# Check dependencies
echo -e "\n${YELLOW}Checking dependencies...${NC}"
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC} Root dependencies installed"
else
    echo -e "${YELLOW}!${NC} Run: pnpm install"
fi

if [ -d "apps/admin/node_modules" ]; then
    echo -e "${GREEN}✓${NC} Admin dependencies installed"
else
    echo -e "${YELLOW}!${NC} Run: cd apps/admin && npm install"
fi

# Test API endpoint (if server is running)
echo -e "\n${YELLOW}Testing API endpoints...${NC}"
if curl -s http://localhost:3000/api/reroute > /dev/null 2>&1; then
    RESPONSE=$(curl -s http://localhost:3000/api/reroute)
    if echo "$RESPONSE" | grep -q "healthy"; then
        echo -e "${GREEN}✓${NC} API is running and healthy"
    else
        echo -e "${YELLOW}!${NC} API is running but may have issues"
    fi
else
    echo -e "${YELLOW}!${NC} Server not running. Start with: pnpm dev:admin"
fi

# Summary
echo -e "\n========================================="
echo -e "${GREEN}Setup Check Complete!${NC}"
echo -e "========================================="

echo -e "\n${BLUE}Quick Commands:${NC}"
echo -e "  ${YELLOW}vercel link${NC}              - Link to Vercel project"
echo -e "  ${YELLOW}vercel env pull .env.local${NC} - Pull environment variables"
echo -e "  ${YELLOW}pnpm dev:admin${NC}           - Start development server"
echo -e "  ${YELLOW}vercel --prod${NC}            - Deploy to production"

echo -e "\n${BLUE}Service URLs:${NC}"
echo -e "  Neon:             https://neon.tech"
echo -e "  Upstash:          https://upstash.com"
echo -e "  Firebase:         https://console.firebase.google.com"
echo -e "  OpenRouteService: https://openrouteservice.org"
echo -e "  Mapbox:           https://mapbox.com"
echo -e "  Vercel:           https://vercel.com"