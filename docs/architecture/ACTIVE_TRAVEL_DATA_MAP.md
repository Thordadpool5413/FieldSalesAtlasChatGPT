# Active travel data: provider to screen

Audited 2026-11-10 against the active API server and application. The research
catalog in [AVIATION_DATA_CONNECTIONS.md](AVIATION_DATA_CONNECTIONS.md) describes
additional work; its entries do not activate providers.

The current tool navigation and source-to-result connections are documented in
[Flight intelligence workspace](FLIGHT_INTELLIGENCE_WORKSPACE.md). The six core
tools now open distinct, visible results rather than one hidden research section.

## Implemented paths

| Data | Active backend / API | Where it is used | Practical limit |
| --- | --- | --- | --- |
| OurAirports airport identifiers, coordinates and country | `providers/airports.ts`; `/api/airports/curated`; itinerary airport lookup | Atlas airport list/map, gateway comparisons, Flight DNA, booking zone resolution, journey planning | Reference listing is not scheduled service or inventory. A bundled fallback has narrower coverage. |
| FAA NAS airport events/configuration | `publicTravel.ts`, NAS projection; `/api/travel/disruptions`; `/api/travel/airports/:iata/brief` | Flight DNA, advanced comparison, journey evidence, opted-in reviews | U.S. airport-wide notices; an omitted airport is unknown. No flight-specific causation. |
| NOAA METAR / TAF | Shared `publicTravel.ts` adapters; airport brief; compatible `/api/travel/aviation/:icao` | Flight DNA, advanced destination weather, journey evidence and reviews | Exact station match, source issue/observation age and TAF validity. Not airline status. |
| NWS point forecast and alerts | Shared adapters; airport brief; compatible point-forecast/weather-alerts routes | Flight DNA, advanced destination weather, journey evidence and reviews | U.S. coordinate query. Periods and alert validity constrain applicability. |
| ECCC nearby surface observations | GeoMet adapter; airport brief | Canadian airport cards in Flight DNA and advanced destination weather; journey evidence/reviews | Regional stations, not necessarily the airport. Recognized measurements retain units, observation time and source quality codes; null/invalid values remain absent. |
| ECCC city-page forecast | Nearest-city adapter; airport brief | Same Canadian weather cards and journey evidence/reviews | Named regional forecast periods lack exact timestamps; they cannot prove full trip-window coverage. |
| ECCC active regional warnings | Warning adapter; airport brief | Canadian weather cards, combined flight brief, journey evidence and reviews | Regional bounding-box/polygon coverage; a returned warning does not establish that the airport itself is affected. |
| Installed official BTS monthly flights | `providers/bts.ts`; `/api/travel/history` | Flight DNA summary and per-leg official history; joint journey/assistant/recovery historical context; manual history checker | U.S. covered domestic reporting carriers, publication lag; each rate needs 30 eligible observations. Import time and reporting months are separate. |
| Independent Flyerintel airport/route/flight/month aggregates | `flightHistory.ts`; `/api/travel/flight-history` | Flight DNA, historical network comparisons and monthly charts | Separate cohorts and licence/attribution. Never pooled with the official import, never live availability. Its failure does not hide installed official records. |
| Historical airport-posted checkpoint samples | `securityHistory.ts`; `/api/travel/security-history` | Security history within Flight DNA | Bounded historical archive and participating airports; not a current TSA wait API or measured passenger wait. |
| OpenRouteService / configured OSRM matrices | `providers/routing.ts`; scenario/readiness/assistant/recovery calculations | Joint journey planner, readiness, assistant/recovery transfer estimates and reviewed calendar updates | Road-network estimates exclude live traffic/closures/border queues. Legacy guided/advanced gateway and quote comparisons still use labeled geographic estimates; use Plan together for road-network calculations. Geographic fallback cannot establish a drivable route. Sample success does not certify every route. |
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
