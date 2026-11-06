# Data connections, disruption recovery and evidence-backed answers

The new controls are in **Travel → Plan Travel**: **Travel assistant**, **Flight change**, and **Data connections**. The existing guided and joint planners remain available.

## Current readiness

The calculation and reviewed-calendar workflows are implemented and covered by API/browser checks. Live data readiness is a separate gate:

| Capability | Current environment evidence |
| --- | --- |
| Airport reference | Actual OurAirports refresh succeeds; a versioned scheduled-service airport reference is installed in the persistent SQLite data directory. |
| Official FAA, NOAA, NWS, ECCC feeds | Actual requests are rejected by the current restricted outbound policy. Adapters and live validation controls are present; these sources remain **unavailable**, not verified. ECCC’s specific product schema still requires a successful real response. |
| Road routing | Pinned OSRM image was pulled and the regional extract/merge tooling was built and executed successfully. Geofabrik map downloads are rejected by the current policy, so **no production graph is active and no real road route has been validated**. |
| BTS history | The real official-host synchronization attempt fails at the proxy. The importer and aggregation are verified against controlled fixtures; **no official monthly dataset has been loaded**. |
| Flight-specific airline status | No suitable flight-status provider is connected. Changes are explicitly traveler-reported. Airport notices and weather never confirm an individual flight. |

The latest direct check is recorded in [TRAVEL_SOURCE_CHECK.json](TRAVEL_SOURCE_CHECK.json). Runtime attempts are also recorded in ignored `data/bts-sync-status.json` and `data/routing/setup-status.json`. Fixture tests do not certify live provider connectivity, product coverage or production road data.

The environment draft now includes these seven explicit hosts: `nasstatus.faa.gov`, `aviationweather.gov`, `api.weather.gov`, `api.weather.gc.ca`, `transtats.bts.gov`, `www.transtats.bts.gov`, and `download.geofabrik.de`. Existing package-manager/GitHub presets are preserved. The configuration tool confirmed the draft was saved and returned `requires_publish: true`. A subsequent runtime status check still showed no explicit allowed hosts. Environment publication remains on hold; the user has separately authorized synchronizing the source changes to GitHub `main`.

The saved setup script now installs the locked OR-Tools dependencies before tests. Saved startup instructions explain restoring the routing service, explicit data synchronization, actual readiness checks and the publication hold. No API secrets or LLM key are required for the implemented calculations.

## Finish activation after network review

After the user reviews and activates the environment configuration, recheck the enforced runtime policy and run:

```sh
npm run data:airports
npm run setup:routing -- --region southeast
npm run data:sync-bts
npm run data:check-sources
```

Do not treat this list as already executed successfully. Road extract and BTS download failures remain open prerequisites until those commands complete against real sources and their checks pass. Fresh-network failures need diagnosis; do not bypass the managed proxy or disable TLS/checksums.

The bounded initial routing profile covers Florida, Georgia, North Carolina and South Carolina. `--region florida` is available for a smaller deployment. Broader U.S./Canada coverage requires appropriate extracts, processing/storage/memory, and an explicit regional configuration or a maintained external `ATLAS_ROUTING_URL`; it is not implied by this profile. The default OpenStreetMap probe is in Orlando and does not validate every road in the region.

The routing installer verifies Geofabrik extract MD5 values received over HTTPS, hashes the merged input with SHA-256, downloads actual regional boundary polygons, and processes the graph with a pinned OSRM image digest. It activates a service manifest only after a successful real table query. The manifest records sources, dataset dates, graph version, installed regions and local service configuration. Points outside the installed extract remain unreachable rather than receiving a geographic substitute. Road estimates exclude live traffic, closures and border queues. OpenStreetMap/ODbL attribution is included with routing evidence.

Map processing is an explicit deployment operation, not an app-startup download. Docker’s existing proxy, registry configuration and trust are preserved; the helper build mounts the platform CA as a build secret. Services are bound to loopback. A graph refresh keeps the existing service while validating the new graph on another free port; remove superseded containers/graph directories only after confirming the new manifest and route checks. On a restored machine with installed graph files:

```sh
python3 scripts/start-routing.py
```

`npm run data:sync-bts` attempts three reporting months at a three-month publication lag. `-- --months N --lag N` controls the scope. It accepts only official BTS HTTPS downloads and schema/month-validated files, retains source URLs/checksums/row counts, and replaces each month atomically. Previously installed history survives a failed new import. Local-file imports remain supported; provenance supplied for a local file is an operator assertion rather than independent authentication of the bytes. Historical scope/denominators and sparse coverage remain visible. No historical route implies that a flight operates today.

## Travel assistant

Select a saved journey and ask a completion/return-home deadline question, such as **“Can we finish these visits and get home Thursday?”** The assistant performs bounded calculations; no generative model or paid model API is used.

- It resolves the weekday within the selected field period and asks for an exact date when ambiguous. An optional exact date/time overrides the interpretation. With no clock time, it explicitly assumes 23:59 in each trainer’s home-airport zone.
- It solves the remaining visits against working windows, ownership/handoff choice, availability, other trips and supplied flight timings. Completed coaching history stays reserved.
- It converts local flight times through IANA zones and estimates home arrival using the supplied final home-airport flight, arrival allowance and saved home-access duration. An absent return flight or home-access duration remains unknown. It does not invent a flight or infer availability from BTS history.
- Its answer distinguishes **provisional**, **not with the supplied itinerary**, **unknown**, and **clarification needed**. A failed supplied itinerary is not a claim that no possible alternate booking could work.
- Claims cite their supporting workspace, itinerary, road, policy and public-source evidence. Evidence shows issue/observation age separately from retrieval/import age, validity, scope and limitations. Source ages remain unknown when timestamps are absent. Imported flight timestamps do not become airline status verification.
- Questions and calculations do not change the shared calendar. A pending reported disruption is included in the facts; its unapproved calendar changes stay separate.

Existing guided trips can be explicitly connected to analysis without changing visits. Parsed local booking fields can be explicitly shared with that journey. The transfer includes airports, dates/times, carrier and flight numbers; raw confirmation documents/codes are excluded. The original legacy draft-plan API is preserved separately from the new `/api/travel/journeys` context API.

## Disruption recovery

1. Select a saved journey and original flight, or supply an original direct field-airport leg when no booking was shared.
2. Report changed dates/times or a cancellation and the UTC time you checked. The server binds the report to the workspace and labels it traveler-reported. Clients cannot mark it airline-confirmed.
3. Review appointment impacts and compare retaining trainer ownership with sharing remaining visits. The preview explains consequences for **both** trainers and shows original/proposed trainer, date and local time for each visit.
4. Explicitly acknowledge the changes and unresolved evidence before applying a complete option. No seats are reserved and no airline booking changes occur.

An outbound cancellation or a broken inbound connection reserves that trainer as unavailable until access is resolved. This restriction survives approval and subsequent calculations. A canceled return flight retains known field access while leaving the home journey unresolved. No replacement itinerary is manufactured. Different airport pairs and multi-airport field circuits require a new itinerary with properly routed transfers; the current recovery keeps the shared field-airport circuit.

Approval rechecks the current workspace revision inside the SQLite write transaction. It updates existing pending visit IDs, trainer trip links, affected trip records, recovery receipt, effective itinerary and optional watch replacement together. Manager ownership and completed coaching records are preserved. A repeated approval replays the same receipt; another option cannot reuse it. Calendar edits, retracted/resolved change reports, expired previews or expired current evidence require a new review. Live workspace delivery refreshes the partner’s open calendar after success.

Only one pending reported change per journey is accepted at a time. A mistaken report can be explicitly retracted, leaving an audit record. Resolve/retract it before replacing itinerary fields. If manual calendar edits move visits outside the analyzed field period, analysis refuses to reuse that stale period and requires a new reviewed plan.

## Testing and operational limits

Final local validation on November 6, 2026: **36 API/logic tests passed; 22 desktop/mobile browser tests passed; strict TypeScript checking and the production build passed.** The airport refresh validated 4,133 scheduled-service airports. These results certify the exercised calculations and application workflows, not blocked live weather, road-map or BTS access.

Run `npm test`, `npm run build`, and `npm run test:e2e`. API checks exercise deadline interpretation, both trainers’ home arrivals, missing return evidence, immutable source ages, source schema/identity validation, cancellations versus return-access constraints, stable visit IDs, completed-history preservation, workspace isolation, stale revision rejection, idempotent approval, old guided-trip adoption, and legacy API compatibility. Browser checks exercise assistant citations without losing the workspace link, reviewed recovery with partner live delivery, and failed-source display on desktop and phone.

Browser outage fixtures verify UI behavior; they do not substitute for the real checks listed above. Native mobile binaries, flight inventory, authoritative airline minimum connection times, ticketing, external-calendar synchronization and flight-specific status integration remain outside this release. This is a responsive web/PWA implementation.

Workspace JSON backup preserves the saved operational trips and visits, but does not include analysis contexts, flight-change reports, recovery receipts, background watch queues, external BTS data or road graphs. Whole-environment recovery must retain the persistent data directory with SQLite-aware backups. After a portable workspace restore, explicitly reconnect the saved trips, share any needed itinerary fields again and re-enable watches. Historical snapshots and traveler-supplied fields are private workspace records; avoid unbounded retention and protect persistent storage.
