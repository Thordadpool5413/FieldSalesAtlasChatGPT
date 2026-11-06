# Travel intelligence implementation

The working entry point is **Travel → Plan Travel → Plan together**. The guided single-trainer planner and advanced comparison remain available. This is a responsive web/PWA release; native iOS/Android binaries have not been built.

## Implemented behavior

- A real Google OR-Tools 9.14 worker assigns and orders up to 12 manager visits across one or two trainers over a maximum 31-day date difference. It respects manager ownership unless handoffs are explicitly allowed, local working windows, visit duration, between-visit breaks, existing visits/trips and trainer availability. Existing commitments reserve the whole trainer-day conservatively. Every returned solution is independently checked by TypeScript before display.
- Three solver objectives trade driving minutes against the number of active field days. They are bounded search results, not a proof of a globally optimal itinerary. Options may coincide. “Fewer field days” does not claim to minimize nights away or airfare. Costs are separately itemized allowances; missing fares and fees remain unknown.
- Each day starts and ends at the selected airport area. Hotels, custom meeting addresses, multi-airport field circuits, maximum nights away, live traffic, border delays and airline minimum connection times are not modeled. Trips with these needs require review.
- Explicitly included booking fields are converted using IANA time zones. Overnight duration and daylight-saving transitions use Temporal. Ambiguous/nonexistent local times are rejected. Flight legs constrain arrival/departure availability for a single field-airport circuit. No flight inventory is invented.
- Reports last 15 minutes. A workspace revision is captured before reading calendar data; approval checks it inside SQLite’s write transaction. Both trainers’ trips, all appointments, approval receipt and optional watch are committed together. Retries replay the same receipt; another option cannot reuse it. Expired current-source evidence requires a fresh preview.
- Saved appointments retain trainer IDs, local zone and UTC start/end. ICS exports use UTC for resolved appointments, retain all-day events for unresolved legacy visits, mark proposed meetings tentative and fold UTF-8 lines correctly. Rescheduling linked visits goes through their itinerary.
- Durable, schema-checked evidence distinguishes current/stale/partial/unavailable/reference. Observation time is distinct from retrieval time. Forecast validity is preserved; old observations do not become current by being fetched again. Requests have deadlines, response limits, in-flight deduplication and bounded retry intervals. Last validated payloads survive provider failures without becoming current.
- Opt-in public-source watches persist in SQLite, claim expiring leases, back off on failure, deduplicate unchanged review findings and resume due work after restart. They stop after the field period or cancellation/completion of all linked trips. A running server is required. Findings appear in the planner; there are no external messages, push delivery, flight-specific monitoring or automatic calendar changes.
- Direct BTS monthly CSV/ZIP ingestion and route/carrier/flight queries work independently of the legacy third-party historical module. The importer validates schema, identifiers, reporting month and source hostname, preserves null outcomes, stores SHA-256 provenance and replaces a reporting month atomically. Rates require at least 30 eligible observations and expose denominators. No dataset is bundled or silently downloaded on app startup.

## Set up and run

```sh
npm ci
npm run setup:optimizer
npm run data:airports
npm run dev
```

Node 24 and Python 3.12 are tested. The optimizer uses `.venv/bin/python`; override with `ATLAS_PYTHON` for another prepared runtime. Python dependency versions are recorded in `services/optimizer/requirements.lock.txt`. CI installs these before the API and browser checks.

`npm run data:airports` is an explicit public-reference refresh, never a calendar write. It validated **4,133** scheduled-service airports in this environment on November 5, 2026. The current snapshot/version lives in ignored `data/atlas.sqlite`; a fresh data directory has only the limited bundled U.S./Canada airport fallback until refreshed. OurAirports is public-domain reference data, not airline schedules. Refresh it periodically through your deployment scheduler.

Configure a maintained OSRM service using `ATLAS_ROUTING_URL=https://your-routing-host/` or a local HTTP service such as `http://127.0.0.1:5000/`. The adapter calls the table API for duration and distance matrices. Null routes stay unreachable. No public OSRM demo server is a production dependency. Self-hosted OSRM requires an appropriate OSM extract, graph processing, hosting, updates and OpenStreetMap attribution/ODbL compliance. If routing is absent or fails, geographic estimates are prominently provisional and cannot validate drivable routes.

## Live-source status and network requirements

`docs/TRAVEL_SOURCE_CHECK.json` records actual checks in this environment. At the recorded check, the restricted outbound policy did not allow the official weather/operational hosts. **OurAirports reference refresh worked; FAA, NOAA, NWS and ECCC operational checks were unavailable.** Fixture tests validate failure handling and parser contracts, not live coverage. The Canadian `swob-realtime` collection must still pass a real product/schema check before its observations are relied on. Canadian warnings and forecasts are separate, unimplemented products.

Required official hosts for a future reviewed configuration:

| Host | Purpose |
| --- | --- |
| `raw.githubusercontent.com` | OurAirports reference refresh (currently allowed by the package-manager preset) |
| `nasstatus.faa.gov` | U.S. airport-wide FAA operational notices |
| `aviationweather.gov` | METAR observations and time-bounded TAF forecasts |
| `api.weather.gov` | U.S. point forecast discovery/periods and active alerts |
| `api.weather.gc.ca` | Candidate Canadian surface-observation product |
| `transtats.bts.gov`, `www.transtats.bts.gov` | Official BTS reporting-month downloads/provenance |
| Your maintained OSRM host | Road-network matrix estimates |

These adapters use public endpoints without embedded credentials. Provider availability, terms, quotas and product coverage still need verification before production use. An omitted FAA airport and an empty NWS alert collection without an issue timestamp remain limited evidence, not an “all clear.” Airport notices and weather do not establish the status of a particular flight.

To repeat the access check without changing trips:

```sh
npm run data:check-sources
```

No network policy or published environment was changed as part of this implementation. The setup requirements are documented here for a later environment review.

## Install historical data

Download the reporting-carrier on-time performance month from the [official BTS site](https://www.transtats.bts.gov/ONTIME/), then supply its actual download URL as provenance:

```sh
npm run data:import-bts -- --file /path/to/official-month.zip --period YYYY-MM --source-url https://transtats.bts.gov/ACTUAL-DOWNLOAD-PATH
```

Omit `--file` to download that URL through the configured network proxy. No remote shell is executed. ZIP members are streamed, never extracted. Local-file provenance is supplied by the operator; an official-looking URL does not authenticate a local file’s contents. The importer rejects a mismatched reporting month and duplicate natural keys rather than silently double counting.

Data lives in `ATLAS_DATA_DIR/bts.sqlite`. Re-importing the same month replaces it without adding duplicates. Source SHA-256, reporting month, import time and row counts are retained. Back up the entire persistent data directory with SQLite-aware tooling. Workspace JSON backups include saved trips and appointments/evidence, but not the external BTS store, public-source cache, ephemeral scenario reports or ongoing watch queue. Restoring a workspace therefore requires explicitly re-enabling watches.

The on-time rate uses completed, non-diverted flights with a reported arrival delay under 15 minutes; cancellation rates use records with a known cancellation flag. Missing values are excluded from the corresponding denominator, never treated as zero. Queries do not blend airport-wide baselines into an unmatched flight. U.S. domestic reporting scope and publication lag apply; Canada/international and unreported services stay unknown.

## Validation and publication

`npm test` covers timezone/DST behavior, real OR-Tools constraints and independent rejection of tampered results, direct BTS aggregation/null handling/atomic replacement, source freshness and outages, road-routing failures/unreachable pairs, cross-workspace access, preview expiry, stale calendar revisions, concurrent/idempotent approval, and durable review behavior. `npm run build` includes strict frontend/backend typechecking. `npm run test:e2e` exercises the complete joint workflow on desktop and mobile alongside existing workspace, single-trainer, map and collaboration flows.

The user has authorized synchronizing the app changes to GitHub `main`. Environment publication remains on hold; the remaining live-data activation steps are described in [the current release guide](DEPENDABLE_TRAVEL_RELEASE.md).
