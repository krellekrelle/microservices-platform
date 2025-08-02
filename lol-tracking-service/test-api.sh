#!/bin/bash

# Test script for LoL Tracking Service API endpoints
# Make sure you're logged in to the platform first to get a valid session cookie

BASE_URL="http://localhost"
# For production: BASE_URL="https://kl-pi.tail9f5728.ts.net"

echo "🎮 LoL Tracking Service API Test"
echo "================================"

# Health check (no auth required)
echo "1. Health check..."
curl -s "$BASE_URL/lol/health" | jq '.'
echo ""

# List riot accounts (requires auth)
echo "2. List Riot accounts (requires login)..."
curl -s -b cookies.txt "$BASE_URL/lol/riot-accounts" | jq '.'
echo ""

# Add riot account (requires auth)
echo "3. Add Riot account example..."
echo "curl -X POST -H 'Content-Type: application/json' \\"
echo "  -b cookies.txt \\"
echo "  -d '{\"summonerName\":\"YourSummoner\",\"summonerTag\":\"EUW\"}' \\"
echo "  $BASE_URL/lol/riot-accounts"
echo ""

echo "📝 To test with authentication:"
echo "1. Login to the platform first: $BASE_URL"
echo "2. Save cookies: curl -c cookies.txt -b cookies.txt $BASE_URL/auth/google"
echo "3. Run the API tests with the saved cookies"
echo ""

echo "🔑 Don't forget to set your RIOT_API_KEY environment variable!"
echo "Get your key from: https://developer.riotgames.com/"
