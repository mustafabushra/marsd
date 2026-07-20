#!/bin/bash

# Marsad Autonomous Agents — Quick Start Script
# Usage: bash AGENTS_QUICKSTART.sh

echo "╔════════════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                                ║"
echo "║                    🚀 MARSAD AUTONOMOUS AGENTS — QUICKSTART                   ║"
echo "║                                                                                ║"
echo "╚════════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+."
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Navigate to agents directory
cd agents || { echo "❌ agents/ directory not found"; exit 1; }

# Install dependencies
echo "📦 Installing dependencies..."
npm install --quiet

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build --quiet

echo ""
echo "✅ Setup complete!"
echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "                           CHOOSE AN OPTION"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "1. Run Interactive CLI (manual task creation)"
echo "   npm start"
echo ""
echo "2. Run Full Bootstrap (automated 4-phase build)"
echo "   npm run bootstrap"
echo ""
echo "3. Development Mode (watch + rebuild)"
echo "   npm run dev"
echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Recommended: Start with option 2 (Full Bootstrap) for complete platform build."
echo ""
echo "For more info, see: ../AGENTS_DEPLOYMENT.md"
echo ""

# Offer to run bootstrap
read -p "Run Bootstrap now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Starting Bootstrap..."
    echo ""
    npm run bootstrap
    echo ""
    echo "✅ Bootstrap complete! Platform is ready for deployment."
    echo ""
    echo "Next steps:"
    echo "  1. Deploy frontend to Vercel"
    echo "  2. Deploy backend to Vercel/Railway"
    echo "  3. Setup Supabase PostgreSQL"
    echo "  4. Enable CloudFlare DDoS protection"
    echo "  5. Launch beta program"
else
    echo ""
    echo "Run this command when ready:"
    echo "  npm run bootstrap"
    echo ""
fi
