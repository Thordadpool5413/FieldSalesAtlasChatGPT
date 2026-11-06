# Field Sales Atlas

A shared field-sales workspace for territories, coaching visits, calendars, and evidence-backed travel planning for two trainers.

## Update the existing Replit workspace

GitHub `main` now includes both the original application history and the recovered Replit history ending at `0ecbdd2`. The Replit app keeps its pnpm workspace and separate web/API services. The recovery branch `replit-recovery-0ecbdd2` remains available as a backup.

Stop the current Run process, then use the Replit Shell:

```bash
git pull --ff-only origin main
git status -sb
pnpm run replit
```

The Run button executes the same `pnpm run replit` command. It installs the locked dependencies and optimizer, then keeps both services running. The separate `api-smoke` workflow runs temporary tests and exits; it is not the app startup workflow.

For the previously reported clean Replit `main` at `0ecbdd2`, this pull is a fast-forward. If you have made additional commits or uncommitted edits since creating the recovery branch, preserve those changes and review the Git message before proceeding. No force push or reset is needed for the recovered commit.

Pulling or running does not publish the app. The published `.replit.app` address is a separate snapshot. Publication remains a separate owner action.

## Local development

Use Node 24.10+ within Node 24, Python 3.12, and pnpm 10.28.2 (pinned in `package.json`). Enable Corepack if pnpm is not installed:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run setup:optimizer
pnpm dev
```

The web app uses port 24397; the API uses port 8080. `PORT` and `ATLAS_API_PORT` override these ports for the combined local runner. The web development server forwards `/api` requests, including live updates, to the API service. Stopping the runner stops both services; a service failure also stops its companion.

## Code and data

- `artifacts/field-sales-atlas/src/` — React UI, including the official logo and Miami Vice theme.
- `artifacts/api-server/src/field-atlas/` — the API's active backend, public-source adapters, shared travel types, and optimizer.
- `artifacts/api-server/src/app.ts` — Express adapter and API routing.
- `artifacts/field-sales-atlas/data/` — existing local SQLite records and imported history; preserved across this source update and ignored by Git.
- `artifacts/field-sales-atlas/backend/` and `server/` — preserved standalone source export. Replit runs the API service above; make backend changes there. Automated backend tests target the active API implementation.
- `research/` and `docs/research/` — preserved Replit research and the latest free-travel-data audit.
- `artifacts/field-sales-atlas/docs/` — original app documentation and design references. Older standalone `npm` commands should be replaced with the root pnpm commands here.

The post-merge hook installs dependencies only. It does not run a database schema push, copy a database, or delete saved records. Publishing or autoscaling still needs durable storage for SQLite; Git synchronization does not provide persistent storage across deployment instances.

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
