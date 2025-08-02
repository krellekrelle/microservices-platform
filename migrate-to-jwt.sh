#!/bin/bash

# JWT Migration Script for Microservices Platform
# This script helps migrate from Express sessions to JWT tokens

echo "🔄 JWT Migration Script for Microservices Platform"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}📋 Migration Steps:${NC}"
echo "1. Stop current containers"
echo "2. Build new containers with JWT support"
echo "3. Start services with JWT authentication"
echo ""

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ docker-compose not found. Please install Docker Compose.${NC}"
    exit 1
fi

echo -e "${YELLOW}🛑 Stopping current services...${NC}"
docker-compose down

echo ""
echo -e "${YELLOW}🔨 Building services with JWT support...${NC}"
docker-compose build --no-cache

echo ""
echo -e "${YELLOW}🚀 Starting services with JWT authentication...${NC}"
docker-compose up -d

echo ""
echo -e "${GREEN}✅ Migration completed!${NC}"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
docker-compose ps

echo ""
echo -e "${BLUE}🔍 To check logs:${NC}"
echo "docker-compose logs -f auth-service"
echo "docker-compose logs -f hello-world-app"
echo "docker-compose logs -f landing-page"

echo ""
echo -e "${BLUE}🌐 Access your application:${NC}"
echo "Landing Page: http://localhost"
echo "Auth Service Health: http://localhost/auth/health"
echo "Hello World Health: http://localhost/hello/health"

echo ""
echo -e "${GREEN}🎉 JWT authentication is now enabled!${NC}"
echo ""
echo -e "${YELLOW}📝 Key Changes:${NC}"
echo "- JWT tokens stored in httpOnly cookies"
echo "- 24-hour token expiration with 7-day refresh"
echo "- Independent token validation across services"
echo "- Google OAuth flow generates JWT tokens"
echo "- Admin endpoints protected with JWT middleware"
