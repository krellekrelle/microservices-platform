#!/bin/bash

# Hearts Game Service - Vue.js Development Helper
# This script helps developers work with the Vue.js frontend

set -e

case "${1:-help}" in
    "dev")
        echo "🚀 Starting Vue.js development server..."
        echo "📡 Backend should be running at http://localhost:3004"
        echo "🎮 Vue dev server will start at http://localhost:5173"
        echo "🔗 Socket.IO and API calls will be proxied to backend"
        echo ""
        npm run vue:dev
        ;;
    
    "build")
        echo "🔨 Building Vue.js application for production..."
        npm run build
        echo "✅ Build complete! Files are in public/dist/"
        ;;
    
    "build:watch")
        echo "👀 Building Vue.js application in watch mode..."
        npm run build:watch
        ;;
    
    "install")
        echo "📦 Installing Vue.js dependencies..."
        npm install
        echo "✅ Dependencies installed!"
        ;;
    
    "docker:build")
        echo "🐳 Building Docker image with Vue.js app..."
        cd ..
        docker compose build hearts-game-service
        echo "✅ Docker image built!"
        ;;
    
    "docker:dev")
        echo "🐳 Starting full development environment..."
        cd ..
        docker compose up -d database auth-service landing-page
        echo "⏳ Waiting for services to start..."
        sleep 5
        docker compose up hearts-game-service
        ;;
    
    "test")
        echo "🧪 Running tests..."
        npm run test
        ;;
    
    "help"|*)
        echo "Hearts Game Service - Vue.js Development Helper"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  dev              Start Vue.js development server (with proxy)"
        echo "  build            Build Vue.js app for production"
        echo "  build:watch      Build Vue.js app in watch mode"
        echo "  install          Install Node.js dependencies"
        echo "  docker:build     Build Docker image"
        echo "  docker:dev       Start full Docker development environment"
        echo "  test             Run tests"
        echo "  help             Show this help message"
        echo ""
        echo "Vue.js Development Workflow:"
        echo "1. Start backend: cd .. && docker compose up -d database auth-service"  
        echo "2. Start Vue dev: ./dev.sh dev"
        echo "3. Open browser: http://localhost:5173"
        echo ""
        echo "Production Build:"
        echo "1. Build Vue app: ./dev.sh build"
        echo "2. Build Docker: ./dev.sh docker:build"
        echo "3. Deploy: cd .. && docker compose up -d"
        ;;
esac