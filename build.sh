#!/bin/bash
# Build script with permission restoration
# Ensures node_modules/.bin/* have correct execute permissions
# Used by Vercel to build project reliably

set -e

echo "🔧 [Build] Restoring execute permissions on node_modules/.bin/*"
if [ -d "node_modules/.bin" ]; then
  find node_modules/.bin -type f -exec chmod +x {} \; 2>/dev/null || true
  echo "✓ Permissions restored"
else
  echo "⚠ node_modules/.bin not found yet (will be created by npm)"
fi

echo "🏗️  [Build] Running Vite build"
exec vite build
