# Field Sales Atlas

A map-first workspace for territory managers, field coaching, shared calendars, and two-trainer travel planning across the United States and Canada.

This repository imports the supplied Field Atlas AppDeploy source export and makes it runnable as a standalone Node application. The existing React interface, map tools, travel modules, artwork, and PWA are preserved. Local adapters replace the export's unavailable `@appdeploy/client` and `@appdeploy/sdk` runtime services.

## Run locally

Use **Node 24.10 or newer within Node 24** (the development version is in `.node-version`). Node's built-in SQLite is required.

```sh
npm ci
npm run dev
```

The development server listens on port 5173, serves the Vite frontend and API together, and reloads backend changes. No account or API key is required. Opening the app creates an empty persistent workspace and saves its access link in the browser.

Optional settings can be copied from `.env.example` into `.env`. Both development and production read this file. Process environment variables take precedence.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Bind address; set to `0.0.0.0` on a deployment host. |
| `PORT` | `5173` | HTTP port. |
| `ATLAS_DATA_DIR` | `./data` | Persistent directory for `atlas.sqlite` and its WAL files. |

Run commands from the repository root. The configured HTTP proxy and TLS trust remain enabled for public-source requests.

## Build and validate

```sh
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

- `npm test` exercises SQLite persistence, transaction rollback, pagination, workspace isolation, stale-edit protection, trainer-link revocation, itinerary scheduling, availability, and backup restoration.
- `npm run build` checks frontend and backend TypeScript before building the frontend.
- `npm run test:e2e` starts the production server on port 5174 with a temporary database. It tests desktop and mobile manager creation, reload persistence, navigation, and live updates across tabs. Third-party browser requests are deliberately blocked to exercise the bundled-map fallback; these tests do not certify public-provider availability.
- `.github/workflows/ci.yml` runs these checks for pushes to `main` and pull requests.
- The exported `tests/tests.json` remains a **manual acceptance checklist**, not an executable test suite.

Browser tests use bundled Playwright Chromium, or `/usr/bin/chromium` if present. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to select another compatible Chromium. Test output and screenshots go under the operating system's temporary directory.

## Production deployment

```sh
npm ci
npm run build
HOST=0.0.0.0 PORT=5173 ATLAS_DATA_DIR=/path/to/persistent/atlas-data npm start
```

Use a Node hosting service with a persistent writable volume and HTTPS. The same server serves `dist/`, `/api/*`, and the server-sent event stream at `/api/events`. The readiness endpoint is `GET /api/_healthcheck`. Keep reverse-proxy buffering off for `/api/events`; allow long-lived HTTP connections. HTTPS is required for installable-PWA capabilities outside localhost.

Keep one application instance per SQLite database. Live connections are held in that process; horizontal replicas need a shared database and event broker before use. Retain the entire data directory across deployments. Use in-app JSON exports for portable workspace backups, and use SQLite-aware backup tooling for whole-database backups rather than copying an actively written database file alone.

GitHub hosts the source and CI; **GitHub Pages alone cannot run this backend or persist shared records**. Publishing this repository does not create a hosted app or transfer records from an existing AppDeploy deployment. To migrate existing records, export a backup there and use Sharing & recovery here to restore it into a separate workspace.

## Collaboration and data

- Shareable workspace links are bearer capabilities: anyone who has the owner link can view and edit its records and manage trainer invitations. Keep links private. Access keys stay in URL fragments/browser storage and are sent only to same-origin API requests; they are not written to Git.
- Owners can issue seat-bound trainer links and revoke them. A trainer seat is attribution, not a personally authenticated account. Revocation is checked before live deliveries.
- SQLite transactions preserve atomic trip/calendar writes and backup restoration. Conditional updates reject stale edits. The database and local environment files are ignored by Git.
- Live updates use server-sent events through a small compatibility adapter. The frontend keeps the original subscription and reconnect workflow.
- Offline mode preserves the generic app shell and local map reference; it does not cache private API records or queue edits.
- The exported daily public-source health scan runs at 06:00 America/New_York while the Node server is running. It is not a durable job queue and does not backfill scans while the server is stopped.

## Public data and limitations

The application uses public reference data and labels stale/unavailable sources. Core workspace editing works without these providers. Live maps, weather, geography, airport directories, and historical research require outbound HTTPS to their providers. Hostnames used for runtime requests include:

```text
api.weather.gov
aviationweather.gov
cdn.jsdelivr.net
datasets-server.huggingface.co
davidmegginson.github.io
fonts.googleapis.com
fonts.gstatic.com
geocoding.geo.census.gov
nasstatus.faa.gov
raw.githubusercontent.com
tiles.openfreemap.org
www2.census.gov
```

Restrictive environments must allow the providers they need. External provider outages fall back to available local/cached references or explicit unavailable states. The app does not provide commercial airfare inventory, live flight-specific tracking, verified road traffic/ETA, ticketing, or two-way Google/Outlook authorization. Saved estimates and public airport-wide advisories are not verified flight or route promises.

## Repository layout

```text
src/                 Existing React application, styles, and planning logic
src/runtime/         Same-origin HTTP and live-event client adapters
backend/             Exported API and public-source integrations
backend/runtime/     SQLite, routing, and live-event adapters
server/              Development/production Node server and daily scheduler
public/              PWA manifest, service worker, offline shell, artwork
tests/               Automated API/database/browser tests; manual checklist
docs/export/         Original build manifest and historical AppDeploy SBOM
```

The files in `docs/export/` describe the **original export's build**, not this adapted runtime. `package-lock.json` is the reproducible dependency record for this repository. The export contained source and artwork, but no original database, deployment credentials, SDK implementation, or dependency lockfile.
