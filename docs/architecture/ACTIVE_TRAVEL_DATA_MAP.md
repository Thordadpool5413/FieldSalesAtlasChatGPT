# Active travel data: provider to screen

Updated 2026-11-12 against the active API server and application. The research
catalog in [AVIATION_DATA_CONNECTIONS.md](AVIATION_DATA_CONNECTIONS.md) describes
additional work; its entries do not activate providers.

The current tool navigation and source-to-result connections are documented in
[Flight intelligence workspace](FLIGHT_INTELLIGENCE_WORKSPACE.md). The six core
tools now open distinct, visible results rather than one hidden research section.

## Implemented paths

| Data | Active backend / API | Where it is used | Practical limit |
| --- | --- | --- | --- |
| OurAirports airport identifiers, coordinates and country | `providers/airports.ts`; `/api/airports/curated`; itinerary airport lookup | Atlas airport list/map, gateway comparisons, Flight DNA, booking zone resolution, journey planning | Reference listing is not scheduled service or inventory. A dated 121-airport bundled US/Canada snapshot has narrower coverage; its published airport type, service flags, coordinates, source SHA-256 and retrieval time are preserved. Size labels are no longer generated from list position. |
| FAA NAS airport events/configuration | `publicTravel.ts`, NAS projection; `/api/travel/disruptions`; `/api/travel/airports/:iata/brief` | Flight DNA, advanced comparison, journey evidence, opted-in reviews | U.S. airport-wide notices; an omitted airport is unknown. No flight-specific causation. |
| NOAA METAR / TAF | Shared `publicTravel.ts` adapters; airport brief; compatible `/api/travel/aviation/:icao` | Flight DNA, advanced destination weather, journey evidence and reviews | Exact station match, source issue/observation age and TAF validity. Not airline status. |
| NWS point forecast and alerts | Shared adapters; airport brief; compatible point-forecast/weather-alerts routes | Flight DNA, advanced destination weather, journey evidence and reviews | U.S. coordinate query. Periods and alert validity constrain applicability. |
| ECCC nearby surface observations | GeoMet adapter; airport brief | Canadian airport cards in Flight DNA and advanced destination weather; journey evidence/reviews | Regional stations, not necessarily the airport. Recognized measurements retain units, observation time and source quality codes; null/invalid values remain absent. |
| ECCC city-page forecast | Nearest-city adapter; airport brief | Same Canadian weather cards and journey evidence/reviews | Named regional forecast periods lack exact timestamps; they cannot prove full trip-window coverage. |
| ECCC active regional warnings | Warning adapter; airport brief | Canadian weather cards, combined flight brief, journey evidence and reviews | Regional bounding-box/polygon coverage; a returned warning does not establish that the airport itself is affected. |
| Installed official BTS monthly flights | `providers/bts.ts`; `/api/travel/history` | Flight DNA summary and per-leg official history; joint journey/assistant/recovery historical context; manual history checker | U.S. covered domestic reporting carriers, publication lag; each rate needs 30 eligible observations. Import time and reporting months are separate. |
| Independent Flyerintel airport/route/flight/month aggregates | `flightHistory.ts`; `/api/travel/flight-history` | Flight DNA, historical network comparisons and monthly charts | Separate cohorts and licence/attribution. Never pooled with the official import, never live availability. Its failure does not hide installed official records. |
| Historical airport-posted checkpoint samples | `securityHistory.ts`; `/api/travel/security-history` | Security history within Flight DNA | Validated, timestamped historical rows are cached durably. A bounded, license-checked, revision-pinned Parquet archive is the primary source, with checksum and retrieval receipt; the query service is an independent fallback. Missing percentiles stay absent; outages retain a labeled stale snapshot. Ambiguous DST hours are rejected. Not a current TSA wait API or measured passenger wait. |
| OpenRouteService / configured OSRM matrices | `providers/routing.ts`; `/api/travel/road-planning`; scenario/readiness/assistant/recovery calculations | Guided and advanced airport comparisons, quote calculations, joint planner, readiness, assistant/recovery and reviewed calendar updates | The same directed road matrices serve all active planners. Missing/currently unreachable road data cannot create a feasible schedule or complete quote ranking. User-entered checked ground estimates remain explicitly identified. Live traffic, closures, border queues and airline inventory remain unknown. |
| adsb.lol aircraft observations | `providers/liveAircraft.ts`; `/api/travel/live-aircraft` | On-demand aircraft panel within Flight DNA | Position observations, not confirmed flight/booking/aircraft assignment. Production provider-review gate remains separate. |
| Census county/place/ZCTA geography | Geography adapters and geography APIs | Atlas territories, county/ZIP explorer and base reference tools | Reference geography, not an independently verified street address or USPS delivery ZIP. |
| Saved visits, trainer profiles, availability, flight fields and reviewed requirements | Workspace-scoped record store; journeys/readiness/scenarios/assistant/recovery APIs | Both-trainer constraints, deadlines, connection/resource margins and reviewed calendar changes | User-supplied constraints. Calendar state and itinerary versions are checked again before changes. Imported booking fields require explicit attachment to shared journeys. |
| Saved provider health and maintenance receipts | `/api/travel/connections`; `/api/intelligence/sources` | Data connections: daily scan details, individual source checks, history/routing/storage summaries | A recorded sample is not a live guarantee, production certification or full disaster-recovery drill. |

## Repairs from this audit

- Added one country-aware airport brief backed by the same normalized adapters as
  journey analysis. Flight DNA and advanced destination weather now consume it,
  replacing separate screen-specific weather requests.
- Connected installed BTS history to Flight DNA's visible summary and per-leg
  details. Independent source outages remain separate. Changing filters clears
  the previous result; late responses cannot populate the new route.
- Kept Canadian measurement fields instead of discarding everything except
  station names/timestamps. Missing numbers and unrecognized units do not become
  zero; regional location, source quality codes and each observation time remain
  explicit.
- Extended joint analysis, assistant/recovery calculations and opted-in reviews
  to departure, connection and destination airports in supplied itineraries.
  Missing reference/forecast coverage remains an evidence gap. Updating an
  attached itinerary atomically queues fresh checks and invalidates the old
  monitoring summary. Existing watches resolve their linked saved itinerary too.
- Excluded expired FAA/alert snapshots from the visible recommendations and
  regional warnings outside their published times. Source cards retain evidence
  age and limitations.
- Constrained expanded Flight DNA panels to the available workspace width.
  Phone overflow clipping had hidden part of the evidence despite a passing
  document-width check. Browser checks now measure the evidence panels themselves
  at phone, landscape and laptop widths.
- Exposed per-dataset daily checks and the distinction between implemented
  adapters and research-only integrations. Diagnostics no longer list road
  configuration as missing when routing is configured; live traffic remains a gap.

## Real-data and decision boundaries

Normal Run and published runtimes do not offer demo creation or access to old
fixture workspaces. New workspaces contain no managers, visits, trips or flight
results until users add records or request attributed public data. Existing
private records are preserved. Historical datasets are real observations with
reporting periods and coverage; they are not fabricated examples or live status.
Illustrative toolkit photography is labeled as imagery, not operational evidence.

Test fixtures require an explicit test runtime flag **and** a separate temporary
data directory. `/api/testing/workspace` is omitted from normal route registration.
`/api/demo/create` is retired with HTTP 410. Browser and API fixtures are only
used to exercise errors, provider contracts and scheduling safely.

- Guided scheduling now builds a backend scenario preview and uses the same
  reviewed, revision-checked atomic approval as joint planning. Availability,
  ownership, local working hours, flight limits and road reachability are checked
  before calendar writes. Advanced comparison routes its scheduling action to
  that engine instead of maintaining a separate client-side save path.
- A booking must be explicitly selected from reviewed itineraries for the intended
  trainer and dates. All legs, local dates, IANA zones, connection requirements and
  review timestamps travel together. Unreviewed drafts and duplicate bookings are
  not silently combined. Booking documents and confirmation codes are excluded.
- Private device bookings, offline flight cards, saved route inputs and personal
  checkpoint notes are scoped to the workspace. Earlier unscoped bookings and
  checkpoint notes remain available only for explicit review/import. Changing the
  workspace fragment reloads its records; requests reject a mismatched link.
- Assistant answers and recovery previews are bound to the question, deadline,
  selected plan, requirements, workspace revision and source lifetime. Editing
  inputs, receiving a saved-record change, or expiry removes the old conclusion.
  A fresh answer is required; display refresh never freshens source observations.
- Connection what-if scenarios use the same calculation as itinerary readiness:
  available layover minus inbound delay, entered transfer allowance and entered
  boarding cutoff. Missing allowances produce an unknown margin, not a default
  success. Checkpoint history does not supply an airline minimum connection time.
- Home-drive times and personal security waits start blank. Budget and processing
  allowances are labeled planning inputs; they are not confirmed prices or
  observed waits. Quotes missing required timing/road inputs show known subtotals
  and are excluded from complete cost/time rankings.
- Tool navigation preserves each illustrative image and puts required route
  inputs into view when a user opens a tool without a route. Travel assistant,
  recovery and source diagnostics remain visible from each planning mode.

## Still absent or conditional

An airline confirmation number is not a public API credential. No authorized
booking/PNR lookup, individual flight-status service, live fare/seat inventory,
automatic rebooking or airline calendar synchronization is connected. Supplied
flight changes remain traveler reports. Existing unsupported search/status
routes do not establish provider access.

FAA registry/type profiles, broader NOAA aviation hazard layers, Canadian traffic
statistics and additional BTS datasets in the research catalog still need real
adapters, import jobs and feature-specific validation. The assistant currently
uses deterministic itinerary/constraint calculations and sourced evidence; it is
not a general-purpose aviation language model.

Scheduled delivery, production-specific settings and full host restoration must
be verified on the host. These code changes do not publish a deployment, alter
private records or certify all sources at all airports. The supplied Replit
report verified an ORS sample; its private key is unavailable in this audit
workspace, so the local routing tests use provider contract fixtures.

## Verification boundaries

API tests exercise the real router, country selection, source parsers, imported
history, workspace access, itinerary replacement and monitoring. PostgreSQL tests
use disposable schemas. Browser tests exercise route analysis, Canadian warnings,
independent-source failure, official history display, stale evidence, both-trainer
assistant/recovery, calendar persistence and responsive layouts. Browser source
fixtures test presentation; they are not a claim about current provider uptime.
The GeoMet measurement field names and units were also inspected against a live
official response during this audit.

Live samples around 2026-11-10 21:58 UTC:

| Check | Observed result |
| --- | --- |
| Real authenticated airport-brief router, isolated test workspace | MCO and YYZ HTTP 200; nine weather products current. MCO FAA omission remained partial/unknown. Canadian station measurements survived the adapter. No real workspace records were accessed. |
| Independent historical adapter | All four datasets passed identity/licence/schema checks: 64 airport, 314 route, 2,791 flight-number and 2,432 monthly rows. MCO–ATL matched 27,428 historical flights, reporting July 2023–August 2026. This is selective coverage, not a national flight inventory. |
| Open checkpoint archive, MCO sample | Both queue requests timed out. Availability remained false with no fabricated queue estimate. This external dependency remains a limitation. |
| Hosted road routing | Local contract tests passed. The private Replit credential was not copied into this environment; the user's earlier host report supplied the successful ORS sample. |

Source availability can change after these checks. A successful fixture or sample
does not certify every airport, travel date, provider product or production host.


Live checks on 2026-11-12 around 08:03 UTC used an isolated normal runtime,
with no source fixtures or private host credentials. MCO/YYZ weather products
returned current observations/forecasts; FAA omission of MCO remained unknown.
Independent MCO–ATL history matched 27,428 records through 2026-08-31. The
checkpoint query service timed out, but the validated direct hourly archive
recovered 186 matching historical MCO rows (six terminal/queue summaries).
The source file was pinned to revision
`716a95800929db49f8c2ebac248fd4dcc6f90fcb` with SHA-256
`ad9e0961497934827c002f67193f365da807f107828ea6d75ba91f186e34c190`.
These are source checks and historical records, not live boarding or queue guarantees.


## Intelligence tool presentation and connection repairs · 2026-11-12

- **Security & airport:** Prefer the verified hourly archive before the query
  viewer, sharing downloads and matching work across both lane requests. Retry
  failed older query strategies on upgrade while retaining successful snapshots.
  Supported, unsupported and unavailable results share one validated response
  contract; malformed or mismatched responses never become wait estimates.
  Empty arrival times are rejected. Available p95 record counts are preserved; an upper benchmark from a smaller sample is not rejected by comparing unrelated medians. Lane and allowance controls sit before the
  results, and source checkpoint labels, observation ranges and sample sizes
  remain visible. Personal records are still private to this device/workspace.
- **Airport pressure:** One normalized, cached FAA snapshot now supplies both
  the airport brief and the legacy disruptions endpoint. Removed the second
  feed parser/cache. Advisory cause, published average delay, effective period,
  runway configuration, official advisory deep links and their source times are retained. A newer advisory
  is not dated by an older configuration; the oldest notice issue time gates
  multiple notices conservatively. Aged notices remain visible as published
  evidence with unknown current applicability. They never become current
  planning evidence; ended notices do not create current alerts.
- **Weather risk:** Station temperature, visibility in statute miles, wind
  direction/speed/gusts and terminal forecast validity are visible before raw
  reports. Unknown measurements stay unknown. Published NWS periods overlapping
  the travel date include the previous overnight period, with airport-local
  times and precipitation probability. Observations, forecasts and warnings
  keep separate meanings. Complete receipts remain in accessible disclosures. Copied briefs carry source links, observation/retrieval times, states, coverage and limitations; forecast cues use the same travel-date overlap rule as the cards.
- **Flight DNA:** The imported official monthly cohort is labeled separately
  from the broader independently published aggregate. Reporting periods,
  denominators and the historical meaning of the 90th percentile remain
  explicit; these rates are never pooled or treated as predictions.
- **Alternatives:** Display per-leg historical delay/cancellation rates,
  sample counts and reporting periods for all eight bounded corridor results, rather than hiding the final two. Keep the internal ranking method
  inspectable, without presenting its numerical proxy as a journey risk score.
  Airline schedule, seats and protection still require verification.
- **Connection survival:** Preserve the shared reviewed transfer/cutoff margin
  engine; the new selection styling retains semantic native controls and does
  not introduce preset factual answers.
- **All tools:** Keep all six distinct photographs. Smaller context banners,
  larger primary measurements and collapsed receipts reduce scrolling. Native
  selection controls use progressive `base-select` styling for themed menus,
  keyboard operation and selected checks; older browsers retain platform
  pickers. No synthetic operational data or fixture endpoints are enabled in
  normal runtimes. The static shell cache advances to v16 without forcing a
  reload over an unsaved form.

A normal local runtime checked MCO, Thursday at 2 PM, against the real archive
at 2026-11-12 16:17 UTC: six checkpoint/lane summaries, source revision
`c46843ab60ec34a9977e709d7b3a0c63076c677f`, SHA-256
`d365a3113881e1ec10ab570fff2e0fee86d39af409a64f9879acafd516dfccd0`.
This check used no source fixtures or private host credentials. It establishes
that the connection returned verified historical records for that query, not
live queue lengths or universal coverage. Publishing was not performed.


Validation for this change: the production build and API/runtime smoke checks
passed. The full local data suite passed 84 checks (five database-specific
checks required PostgreSQL); the separate PostgreSQL/API run then passed all
58 checks with zero skips. Desktop, phone, keyboard, malformed-response retry,
source-expiry and navigation-fit verification passed 23 browser checks, including
six laptop viewport sizes and three short landscape-phone sizes. Earlier browser
verification also covered all six tool photos and shared connection assumptions.
Screenshots and live-check receipts are held outside the repository. A historical
MCO sample succeeded; no claim is made about every airport, live TSA queues,
airline inventory or the separately published Replit deployment.
