# Free air-travel data audit — November 6, 2026

Field Sales Atlas can gain substantial useful intelligence from additional open data. The strongest additions are historical route frequency, current-generation fare benchmarks, international-arrival wait history, passenger-rights knowledge, and airport ground-access planning. Completing and validating the existing connections should precede adding more providers.

This is research and a code audit, not an activation or deployment. No new provider accounts, subscriptions, production imports, calendar changes or publications were performed.

## What was actually checked

The audit reviewed the repository's provider adapters, legacy Flight DNA/security-history routes, evidence model, BTS importer, routing configuration and travel assistant. Public documentation and sample endpoints were fetched over HTTPS. Local adapter checks ran against an isolated temporary database, leaving the existing workspace database untouched.

The Replit site now responds: its public `/api/_healthcheck` returned `{"status":"ready"}`, and `/api/travel/aviation/KMCO` returned a METAR and TAF. This supersedes the earlier observation that the site returned a Replit 404. Its `/build-info.json` returned HTML rather than build metadata, so the exact deployed Git revision was not established. Private Replit workspace settings, provider credentials and saved journeys were not inspected.

Fresh adapter tests from this execution environment returned current METARs and TAFs for Orlando and Toronto, and a current NWS point forecast for Orlando. FAA omitted the sampled MCO airport record; the adapter correctly retained unknown/partial status. The sampled NWS alert collection was empty and retained its timestamp limitation. Successful samples do not certify every airport or future provider uptime.

The older release document's restricted-network statements describe an earlier environment snapshot. The current runtime reported enforced, unrestricted HTTP access. The Canadian adapter still failed its schema check even though the official GeoMet endpoint itself worked.

## Existing source inventory and gaps

| Source already in the app | Actual use | Audit finding |
| --- | --- | --- |
| OurAirports | Airport IDs, location, country/state and scheduled-service reference | Public-domain reference; useful existing foundation. The importer omits useful directory fields such as the official airport website. A scheduled-service flag is not a future timetable. |
| FAA NAS | Airport-wide operational notices | Retain omission-as-unknown. Airport notices do not confirm an individual flight. |
| NOAA Aviation Weather Center | METAR and TAF | Sampled local adapters and the public Replit aviation endpoint worked. Additional hazard products are available through the same official API. |
| NWS | Active alerts and point forecasts | Samples responded. Add hourly forecasts for travel-window decisions; the existing helper primarily uses longer forecast periods. |
| ECCC GeoMet | Nearby Canadian surface observations | Repair needed: source fields and recency query differ from the current adapter's assumptions; details below. Canadian warnings and forecasts require separate products. |
| FlyerIntel | Aggregated BTS-derived route, flight-number and airport research | The sampled route file worked and declared CC BY 4.0. It contained 314 directional routes for July 2023–August 2026, generated October 26, 2026. Publisher selection includes a 12,000-flight floor; absence cannot establish lack of service. Route aggregates combine airlines. |
| Direct BTS on-time imports | Monthly reporting-carrier outcomes in `bts.sqlite` | Importer exists; no direct BTS SQLite file was present in the inspected local default data directory. Deployed Replit installation was not established. The importer stores scheduled departure and flight dates, enabling additional time/day analysis after data is loaded. |
| Airport security archive on Hugging Face | Historical hourly posted estimates, standard/PreCheck, 30 airports | Already integrated; do not present it as a newly discovered integration. Its separate `cbp` immigration subset is not used by the current standard/PreCheck adapter. |
| OSRM / OpenStreetMap | Road matrices, with explicit geographic fallback | Existing adapter and regional tooling. The isolated probe had no graph/endpoint and used the labeled fallback. Deployed routing configuration remains unverified. Software/open map data are free; hosting and graph processing have costs. |
| Individual flight status / inventory | Traveler-supplied itinerary and change reports | No flight-status provider adapter is connected in the audited source. No free source was verified that covers unrestricted production fares, bookable seats, gates and disruption status across all airlines. |

### Concrete Canadian weather repair

`backend/providers/publicTravel.ts` reads `datetime`, `date_tm` or `obs_date`, and `stn_nam` or `station_name`. The official `swob-realtime` sample instead contained `obs_date_tm`, `date_tm-value` and `stn_nam-value`. Its queryable schema explicitly marks `date_tm-value` as the primary time field.

The current query supplies a bounding box and limit but no time interval or newest-first ordering. An unbounded sample returned October 8 observations during the November 6 audit: the collection contains the last 30 days, not just the newest reading. A separate probe with a three-hour `datetime` interval and `sortby=-obs_date_tm` returned November 6 observations. Parse the actual fields, constrain recency, select an appropriate station, and preserve units, quality flags, distance and freshness. Nearby stations are not interchangeable with the airport's own weather station. No app code was changed during this audit.

## Recommended additions, in order of usefulness

### 1. BTS T-100 Segment: historical service and practical alternate airports

Source: [BTS Air Carrier Statistics / T-100](https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE&Yv0x=D).

T-100 segment records include origin, destination, carrier, aircraft/service class, scheduled departures and departures performed. Use **segment**, rather than market, records to identify historical nonstop service. Filter for the appropriate passenger service classes and reporting periods.

Build a dated route graph and show which nearby airports historically offered more frequent service, which carriers operated those segments, and where a disruption leaves few historically served alternatives. This fills coverage gaps left by high-volume-only aggregated route files.

Limits: monthly publication lag, seasonal changes, and different domestic/international release schedules. The combined all-carrier tables omit some of the newest domestic months to align coverage. International records require a U.S. endpoint; they do not describe Canada-to-Canada routes. Departures performed are not currently bookable departures. Seats reported as capacity are not seats available to buy.

### 2. BTS OD40 and average-fare releases: useful cost context

Sources: [OD40 program](https://www.bts.gov/OD-40), [BTS Air Fares](https://www.bts.gov/air-fares).

The official fare page states that ticket sampling changed from 10% to 40% beginning July 1, 2025. OD40 introduced monthly reporting and additional fields; the public fare reports still have their own publication cadence and lag. A new importer must distinguish legacy DB1B from OD40 rather than assume the older quarterly schema is the current program.

Use comparable historical ticket/market fares to contextualize a supplied current quote and compare airport choices over time. Preserve one-way/round-trip and itinerary/market distinctions. Optional services and ticket conditions must be compared separately.

Limits: historical averages do not quote today's fare or establish availability. Do not combine pre/post-transition populations without recording the survey/schema change. Ingest only published, verified tables and label the reporting period and coverage.

### 3. Additional NOAA aviation hazards and NWS hourly forecasts

Sources: [AWC API and product coverage](https://aviationweather.gov/data/api/), [AWC OpenAPI schema](https://aviationweather.gov/data/schema/openapi.yaml), [NWS API documentation](https://www.weather.gov/documentation/services-web-api).

Add relevant SIGMETs, G-AIRMETs, Center Weather Advisories and pilot reports to airport and itinerary context. Products have different geographic coverage; AWC documents worldwide SIGMETs, CONUS G-AIRMETs and separate Alaska AIRMETs. CONUS text AIRMETs were discontinued in January 2025. Use the current product rather than an obsolete endpoint.

NWS discovery exposes hourly forecasts for approximately the next seven days. Match destination and airport arrival/departure windows to the periods actually published. This can help compare morning versus afternoon travel windows and determine whether changing a visit time reduces exposure to forecast conditions.

Limits: a supplied origin/destination pair does not establish an aircraft's actual route. An illustrative corridor is explicitly an approximation. Forecasts and hazards support context, not a calibrated cancellation probability or operational flight-safety conclusion. Keep weather validity separate from itinerary dates. Cache/batch requests; AWC recommends compressed bulk cache files for broad queries. NWS is free for any purpose, requires a User-Agent and applies unpublished reasonable rate limits.

### 4. International-arrival wait history, using an existing open archive

Sources: [existing CC BY 4.0 airport-wait archive](https://huggingface.co/datasets/digitalhen/us-airport-wait-times), [official CBP Airport Wait Times](https://awt.cbp.gov/).

The archive's unused `cbp` configuration contains airport, terminal/site, arrival hour, average/maximum waits, citizen/non-citizen aggregates, passenger counts, Global Entry counts and booth throughput. It offers a practical extension for U.S. international-entry planning alongside the already integrated standard/PreCheck history.

A bounded read-only request to the public dataset viewer's `cbp` first-rows endpoint succeeded and returned 100 rows with those documented fields. This verifies access and schema for the sample, not freshness or coverage at every airport.

Compare suitable airport/terminal/time buckets and add a separate immigration allowance to the home-arrival or onward-visit calculation. Use only categories actually reported; a Global Entry passenger count does not supply a Global Entry wait-time distribution.

Limits: the archive is a third-party collection of published estimates. Its license permits commercial reuse with attribution; the underlying airport methods differ. Hourly posted estimates and averages are not individual passenger transit times. Coverage starts on different dates and some time periods are sparse. This is not a live universal TSA/CBP queue API. Do not label an hourly-estimate percentile as the wait experienced by a stated percentage of passengers.

### 5. DOT passenger-rights and airline-commitment knowledge

Sources: [Airline Customer Service Dashboard](https://www.transportation.gov/airconsumer/airline-customer-service-dashboard), [refund guidance](https://www.transportation.gov/individuals/aviation-consumer-protection/refunds), [Air Travel Consumer Reports](https://www.transportation.gov/airconsumer/air-travel-consumer-reports).

Turn official guidance and carrier commitments into a small, versioned rules library. For a supplied disruption, show relevant rebooking commitments, possible meals/hotel assistance, refund conditions and the facts still needed to determine applicability. The dashboard distinguishes controllable disruptions; benefits cannot be assumed for weather-related disruptions. Refund eligibility is a separate question and can depend on whether the traveler accepts and takes an alternative.

Add historical baggage, denied-boarding and complaint statistics as sourced airline context where coverage and denominators are suitable. Explain that an airline-wide aggregate is not a prediction about a particular flight or bag.

These sources are public guidance/tables, not one ready-made passenger-rights API. Store short factual rules with official links, jurisdiction, effective/reviewed dates and applicability conditions. Canadian and European rules need their own validated sources; the Canadian CTA page returned 503 during this audit and its current content was not verified.

### 6. Airport ground access using GTFS, agency feeds and road routing

Sources: [GTFS specification](https://gtfs.org/getting-started/what-is-gtfs/), [Mobility Database](https://mobilitydatabase.org/), [catalog terms](https://mobilitydatabase.org/terms-and-conditions), [catalog API](https://mobilitydata.github.io/mobility-feed-api/SwaggerUI/index.html).

Discover airport rail/bus services, then ingest relevant agency schedules and GTFS-Realtime when available. Combine with real road routing to compare a rental car, rail/bus transfer and a different arrival airport against both trainers' actual visit locations, luggage constraints and work windows.

MobilityData's catalog metadata is CC0. Feed contents have each agency's own license; free catalog access does not grant blanket rights to every feed. Check service dates, holiday exceptions, timezone, walking/interchange time, late-evening last service, accessibility and real-time feed age. A schedule is not proof that today's trip is running.

The existing app expects an OSRM-compatible matrix. A hosted openrouteservice provider needs its own adapter, API key and quota handling; it is not a URL substitution. The current official landing page confirms a free Standard key via HeiGIT, but this audit did not verify a stable numeric quota or business-use entitlement. Self-hosted OSRM/Valhalla/OpenTripPlanner avoids a paid data license but still requires processing, storage and hosting.

### 7. A sourced airport/airline travel brief

Sources: [OurAirports public-domain files](https://ourairports.com/data/), [FAA NASR](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/), and curated official airport/airline pages.

Enrich the current airport directory with official website links and useful facility reference fields. Pair these with verified terminal maps, rental-car pickup/shuttles, public transport access, accessibility, check-in/bag-drop guidance and carrier-specific baggage/service conditions.

NASR is an official U.S. facility reference updated in cycles; it is not a global terminal-amenities or real-time gate feed. Ground-side details often require curated official pages rather than a structured open API. Paraphrase factual guidance, retain citations and review dates, and verify changing hours and operating details. Keep airport facts separate from airline-specific conditions and traveler preferences.

## Optional aircraft-tracking layer

[OpenSky's current REST documentation](https://openskynetwork.github.io/opensky-api/rest.html) describes OAuth2 client credentials, credit-based quotas and different endpoint limits. Its quota is not a guarantee of business-use rights; the separate terms page returned 403 and those permissions were not verified here. Do not configure it as an unrestricted free commercial provider.

[adsb.lol historical data](https://www.adsb.lol/docs/open-data/historical) is explicitly offered under ODbL 1.0, and its [API documentation](https://api.adsb.lol/docs) is reachable. Database attribution/share-alike duties and the live service's terms and rate policy need separate consideration. Aircraft observations are useful supplemental context. They do not establish a reservation, current terminal/gate assignment, an available replacement seat or a flight-number match. Promote an inbound-aircraft claim only after a trustworthy operating-flight/aircraft match is available.

## Free-tier and data traps found during research

| Source | Verified constraint | Decision for this app |
| --- | --- | --- |
| [Aviationstack pricing](https://aviationstack.com/pricing) | Free plan currently says personal/non-commercial use and 100 requests/month. | Do not assume it is an eligible production provider for a work app. A frequently polled two-trainer workflow also exceeds a very small quota quickly. |
| [Open-Meteo pricing](https://open-meteo.com/en/pricing) | Free hosted API is non-commercial, 10,000 calls/day, without an uptime guarantee. Underlying data and open-source software have different licenses. | Data openness does not make the hosted free service available for every business use. Prefer existing official NWS/ECCC/AWC coverage where suitable. |
| [OpenFlights route data](https://openflights.org/data.php) | Publisher explicitly says route updates ceased in June 2014. | Historical reference only; unsuitable for discovering current service. |
| [AirLabs](https://airlabs.co/) and [terms](https://airlabs.co/terms-of-service) | “Free API key” is advertised; reviewed terms also describe limited trials. A permanent, business-eligible live-status allowance was not verified. | Confirm plan, covered endpoints and rights before recommending it as a free production source. |
| Amadeus | Attempted pricing documentation redirected to a JavaScript-only homepage. Current production free allowances were not verified. | No recommendation based on older, unverified free-tier claims. |
| TSA nationwide queue/throughput claims | The official throughput page returned 403. The existing archive explicitly says there is no official nationwide TSA wait feed and integrates airports individually. | Do not turn daily passenger totals, crowdsourced waits or archived estimates into a claim of live checkpoint delay. |

Public ADS-B positions, historical capacity, a website fare search and sandbox API responses are not production airfare/seat inventory. Retain airline verification for alternatives until a suitable authorized provider is connected.

## How this becomes useful intelligence for both trainers

The assistant should answer a saved trip question with a door-to-door calculation:

1. Both trainers' accepted visit windows, personal/time-off blocks, ownership/handoff constraints and home deadlines.
2. Supplied flight legs and their verification status; operating carrier and travel date matter as well as flight number.
3. Road/transit transfers and parking/rental/terminal allowances, with the actual provider coverage and last-service limitations.
4. Appropriate weather windows, historical delays, security/immigration baselines and their uncertainties.
5. Consequences for each trainer, historical alternatives to investigate, budget context and applicable carrier commitments.
6. Specific missing facts: a verified seat, revised booking, pickup hours, accepted meeting change or live flight status.

Useful questions include “Which airport gives us more historically served backup routes?”, “Does an international arrival still leave enough time for the first visit?”, “Can the other trainer cover a visit after this reported flight change?”, and “Does this supplied quote look high against comparable historical fares?” No actual available flight, fare or numerical success probability should be invented to complete an answer.

User-confirmed trip actuals can gradually improve personal buffer estimates: airport access, bag collection, rental pickup and meeting overrun. Keep each trainer's circumstances separate and show sample counts. This private learning does not require purchasing another external API. It also must not imply that an airline-approved minimum connection time has been obtained.

## Implementation priorities

**First: dependable existing facts.** Repair GeoMet schema/recency; unify legacy and evidence-backed provider paths; expose HTTP/schema/timestamp failure reasons separately; verify the deployed routing and direct BTS installations. Preserve the distinction between unknown, stale, historical and current. Existing successful samples do not activate or certify a production connection.

**Second: high-value free additions.** Add T-100 segment imports and OD40-aware fare benchmarks. Extend the current archive adapter to CBP history. Add a small sourced DOT rights/commitments library. Build agency-specific airport transit access for the airports actually used by the trainers.

**Third: personalized decisions.** Feed the new facts into the existing joint planner, deadline assistant and reviewed recovery workflow. Keep calendar changes behind review. Add optional aircraft context only when licensing, coverage and matching are adequate. Introduce a flight-status/inventory provider only after its business-use rights, cost limits and actual endpoints are verified.

## Data and operating contract

Use provider adapters on the server with deduplicated requests, bounded retries and shared cache. Import monthly/quarterly bulk data in background jobs and serve compact aggregates; do not load a national flight ZIP or whole-country routing graph on a phone request. Preserve airport/carrier identifiers over time, source checksums, schema versions and reporting periods. Retain the distinction between marketing and operating carriers.

Each recommendation should expose publisher, URL, license/attribution, covered geography, observation/issue time, validity window, retrieval/import time, reporting period, sample size/denominator, matching method and limitations. Unknown timestamps stay unknown. Travel calculations should name every provisional assumption. An API response with no relevant record is not proof of normal conditions.

The data itself can be free while storage, compute, hosting, maintenance and some service tiers incur costs. The most reliable first release uses the existing evidence model and a small number of validated official sources, with a clear statement of what still requires airline confirmation.
