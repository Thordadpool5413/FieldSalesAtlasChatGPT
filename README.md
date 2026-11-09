# Field Sales Atlas

For PostgreSQL migration, private backups, hosted routing and runtime verification
in Replit, follow [Replit setup and verified cutover](docs/operations/REPLIT_SETUP.md).
The official weather feeds need no API keys; infrastructure and flight-specific
provider access are separate configuration steps. No publication is automatic.

A shared field-sales workspace for territories, coaching visits, calendars, and evidence-backed travel planning for two trainers.

## Update the existing Replit workspace

GitHub `main` includes the original application history and the recovered Replit work. The Replit app keeps its pnpm workspace and separate web/API services. The recovery snapshots remain available as backups; the latest is `replit-recovery-mobile-menu` at `1c1385b`.

Stop the current Run process, then use the Replit Shell:

```bash
git pull --ff-only origin main && pnpm run replit
```

The Run button executes the same `pnpm run replit` command. It installs the locked dependencies and optimizer, then keeps both services running. The separate `api-smoke` workflow runs temporary tests and exits; it is not the app startup workflow.

The recoveries preserve the uploaded Replit commits as ancestors of repaired `main`. Pause Replit Agent edits during synchronization: additional local commits can create another divergence. A fast-forward-only pull stops when the histories diverge so the exact local work can be preserved and reconciled. If a previous pull already stopped with conflicts, follow [Replit merge recovery](docs/REPLIT_GIT_RECOVERY.md) before trying another pull. The `&&` above prevents startup if the pull fails.

Pulling or running does not publish the app. The published `.replit.app` address is a separate snapshot. Publication remains a separate owner action.

## Local development

Use Node 24.10+ within Node 24, Python 3.12, and pnpm 10.26.1 (pinned in `package.json` to match Replit). Enable Corepack if pnpm is not installed:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run setup:optimizer
pnpm dev
```

The optimizer installs into `.venv`, including on hosts where pip defaults to `--user`. The installer overrides the install destination for that command while retaining configured package indexes, proxies, and certificate trust.

The web app uses port 24397; the API uses port 8080. `PORT` and `ATLAS_API_PORT` override these ports for the combined local runner. The web development server forwards `/api` requests, including live updates, to the API service. Stopping the runner stops both services; a service failure also stops its companion.

## Code and data

- `artifacts/field-sales-atlas/src/` — React UI, including the official logo and Miami Vice theme.
- `artifacts/api-server/src/field-atlas/` — the API's active backend, public-source adapters, shared travel types, and optimizer.
- `artifacts/api-server/src/app.ts` — Express adapter and API routing.
- `artifacts/field-sales-atlas/data/` — existing local SQLite records and imported history; preserved across this source update and ignored by Git.
- `artifacts/field-sales-atlas/backend/` and `server/` — preserved standalone source export. Replit runs the API service above; make backend changes there. Automated backend tests target the active API implementation.
- `research/` and `docs/research/` — preserved Replit research and the latest free-travel-data audit.
- `artifacts/field-sales-atlas/docs/` — original app documentation and design references. Older standalone `npm` commands should be replaced with the root pnpm commands here.

The post-merge hook installs dependencies only. It does not run a database schema push, copy a database, or delete saved records. Published Replit filesystems are not durable record storage. Use the opt-in, verified PostgreSQL migration and private App Storage setup above; Git synchronization does not configure those services. Live events still require one application instance.

## Journey readiness

[Journey readiness is implemented](docs/architecture/JOURNEY_READINESS.md): explicit booking checks, connection and appointment margins, per-trainer delay tests, reviewed transport/equipment requirements and guarded itinerary updates. It is available in Booked flights, Travel assistant and recovery. The guide maps the routes, calculations and remaining limits.

## Aviation integration blueprint

The [aviation connection map](docs/architecture/AVIATION_DATA_CONNECTIONS.md) maps aircraft reference, airport operations, aviation hazards, historical airline data and optional tracking into the existing map, flight details, planner, assistant, recovery and mobile views. It identifies current code owners, proposed API contracts, evidence and identity rules, refresh policies, dependencies and acceptance checks.

The [machine-readable map](docs/architecture/aviation-connections.json) distinguishes existing integrations from proposed endpoints and records activation blockers for all 28 sources in the [source catalog](docs/research/aviation-source-catalog.csv). The [supporting aviation research](docs/research/AVIATION_DATA_AND_AI_RESEARCH_2026-11-06.md) includes sample checks and reuse restrictions. These are implementation plans; this documentation update does not activate the proposed feeds.

## Validation and build identity

```bash
pnpm test
pnpm run build
pnpm run test:api
pnpm run test:runtime
pnpm --filter @workspace/field-sales-atlas exec playwright install chromium
pnpm run test:e2e
```

The API smoke suite creates isolated temporary records and checks persistence after restart, guest isolation, trainer permissions, revocation, and live events. Browser tests exercise the built web app through the active API service. CI runs both alongside the backend tests and workspace build.

The built web app serves `/build-info.json` as JSON with `revision`, `builtAt`, and `sourceModified`. Use this to verify the served UI. If Git metadata is absent from a build snapshot, `revision` is `null`; the file does not claim an unverified revision. A response containing HTML is not build metadata. API health is available at `/api/_healthcheck` and `/api/healthz`.

## Travel data tools

The root scripts retain airport refresh, connection checks, BTS import/sync, and road-routing setup:

```bash
pnpm run data:airports
pnpm run data:check-sources
pnpm run data:import-bts --help
pnpm run data:sync-bts --help
pnpm run setup:routing --help
```

Routing setup requires Docker and suitable map data. These tools are explicit operations; pulling the repository does not load data, create provider subscriptions, or change calendars. Public-source coverage, age, and limitations remain part of the travel evidence; flight availability requires provider verification.

## Backend reliability and deployment verification

See [the operational guide](docs/operations/BACKEND_RELIABILITY.md) for shared
weather validation, the unified airport reference, complete source checks, daily
catch-up jobs, optional external scheduling, WAL-safe backups and restore drills.
`/api/build-info` identifies the running API build; `/build-info.json` identifies
the web build. `/api/openapi.json` inventories the active routes and access rules.
Road routing, durable hosting and airline-provider authorization still require
real deployment configuration; diagnostics keep those limitations explicit.
