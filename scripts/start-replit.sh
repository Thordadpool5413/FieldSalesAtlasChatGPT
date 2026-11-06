#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 10) { console.error("Field Sales Atlas requires Node 24.10 or newer within Node 24."); process.exit(1); }'
pnpm install --frozen-lockfile
pnpm run setup:optimizer
exec pnpm run dev
