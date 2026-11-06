#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major === 24 && minor >= 10 ? 0 : 1)'; then
  echo 'Field Sales Atlas requires Node 24.10 or newer within Node 24. Enable the nodejs-24 module in Replit.' >&2
  exit 1
fi

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-5173}"

# Pulling Git source does not update dist/ or install new dependencies.
# Rebuild on Run so an older compiled UI cannot survive a successful pull.
# Git and workspace data are never changed by this script.
npm ci --include=dev
npm run setup:optimizer
npm run build
exec npm start
