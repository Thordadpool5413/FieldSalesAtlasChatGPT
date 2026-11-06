# Field Sales Atlas

A map-first workspace for territory managers to coordinate field teams, coaching, calendars, territories, and shared travel planning across the U.S. and Canada.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/field-sales-atlas run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Local workspace data is stored in `artifacts/field-sales-atlas/data/` as SQLite.
- Public-source travel information is best-effort and clearly labeled when unavailable.

## Stack

- pnpm workspaces, Node.js 24, TypeScript
- Web: React + Vite, served as a root-path artifact
- API: Express 5; Field Sales Atlas routes are adapted from the source repository and mounted under `/api`
- Data: Node's built-in SQLite, stored in the Field Sales Atlas artifact directory
- Build: Vite for the web app; esbuild for the API server

## Where things live

- `artifacts/field-sales-atlas/src/` — map-first workspace, territory tools, calendar, coaching, and travel UI
- `artifacts/field-sales-atlas/shared/` — shared travel types and date/time helpers
- `artifacts/api-server/src/field-atlas/` — API, SQLite persistence, public-source adapters, and travel-planning logic
- `artifacts/field-sales-atlas/docs/` — source-status, travel, and product reference documents

## Architecture decisions

- Keep the upstream shareable-workspace model: access is through bearer links, not local passwords or accounts.
- The app's own SQLite store remains the data source; do not migrate it to PostgreSQL without an explicit product decision.
- Travel estimates and public data have known gaps; present them as provisional and do not imply airline inventory or verified road ETAs.

## Product

Users can explore territories, manage field teams and coaching visits, coordinate calendars, share a workspace, and plan travel for two trainers. Map, weather, airport, and historical data depend on public providers and may be unavailable.

## User preferences

The user asked to turn the FieldSalesAtlasChatGPT repository into a web app.

## Gotchas

- The API workflow must be running for the web app's `/api` requests.
- The two artifact workflows own their ports and preview routing; do not start duplicate workflows.
- `artifacts/field-sales-atlas/server/index.ts` is preserved from the standalone source export; the Replit runtime uses the managed API Server artifact instead.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
