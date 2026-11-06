# Free airline, air-travel, and airport data opportunities

**Research date:** November 6, 2026  
**Purpose:** Extend the Field Sales Atlas data review with airline-market, airport-activity, passenger-experience, and live aircraft-position sources.  
**Evidence:** 15 aviation-focused sources added to the existing source registry.

## Executive summary

The strongest additional free aviation intelligence is **historical public data**, not live flight status. The best fits are:

1. **BTS T-100:** monthly airline traffic and capacity by market/segment, useful for measuring route service, passenger volume, and capacity.
2. **BTS DB1C:** monthly sampled tickets and itineraries, including fares and paths of travel; useful for historical fare and market comparisons, not live booking prices.
3. **U.S. DOT Air Travel Consumer Reports:** monthly airline delay, baggage, oversales, complaint, and related service-quality measures.
4. **FAA ATADS, TAF, and NASR:** airport operations counts, long-range airport activity forecasts, and frequently refreshed airport/aeronautical reference data.

These sources can add route-market and airport context to the app’s existing historical BTS-based travel intelligence. They do not confirm a traveler’s specific flight, available seats, gate, current fare, or current disruption.

There is one possible live-position feed: **ADSB.lol** is currently free and publishes data under ODbL, but its documentation asks production users to contact the maintainer and warns that an API key may be required in the future. Treat it as an experimental aircraft-position source, not a dependable flight-status service. [35](https://api.adsb.lol/)

The free tiers of some commercial flight APIs are explicitly personal/non-commercial. Aviationstack’s free plan lists 100 requests and non-commercial use; FlightAware’s free monthly credit is in its personal/academic tier. A commercial product should not rely on those free tiers. [38](https://aviationstack.com/pricing) [39](https://www.flightaware.com/commercial/aeroapi) [41](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Personal_License_Jul2026_v2.pdf)

## What the app already has

The current backend already has OurAirports airport reference data, FAA airport-wide status notices, NOAA METAR/TAF weather, NWS alerts/forecasts, a direct BTS history import path, FlyerIntel historical BTS-derived aggregates, a third-party airport-wait archive, and optional OSRM routing. These are visible in `artifacts/api-server/src/field-atlas/backend/providers/publicTravel.ts`, `flightHistory.ts`, `securityHistory.ts`, `providers/bts.ts`, and `providers/airports.ts`.

The app already distinguishes airport-wide information and historical estimates from flight-specific confirmation. Keep that distinction. The repository’s November 6 source check reports outbound 403 failures for FAA and BTS downloads along with other existing live sources, so test access from the actual app environment before building new integrations. See `artifacts/field-sales-atlas/docs/TRAVEL_SOURCE_CHECK.json`.

## Best new sources

### 1. BTS T-100: route service and airline capacity

T-100 is the best general addition for airline-market context. BTS describes it as monthly domestic and international market/segment data reported by U.S. and foreign carriers. Fields include passenger traffic, freight/mail, available capacity, departures, and load factors. The data is published through BTS tables and downloadable products, rather than a modern, guaranteed real-time REST API. The database page lists data through 2026 and notes that international data is released later than domestic data. [29](https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE)

For Field Sales Atlas, T-100 could answer questions such as:

- Which airports and city pairs have sustained airline service?
- Which carriers have the largest historical presence on a route?
- How does capacity or passenger volume vary by month?
- Is an airport a major commercial gateway or mostly a low-volume field airport?

Use it to add a **route-market strength** or **airport activity baseline**. Do not turn historical passenger counts into current flight availability or seat inventory. T-100 measures operations and capacity that have already been reported.

### 2. BTS DB1C: sampled fares and itineraries

BTS replaced the quarterly DB1B ticket sample with **DB1C**, effective July 2025. DB1B used a 10% sample and was collected quarterly; DB1C uses a 40% sample and is collected monthly. The published files include ticket, market, coupon, and segment records with origin/destination, ticket fare, carriers, and itinerary details. [30](https://www.bts.gov/topics/airlines-and-airports/origin-and-destination-survey-data)

This could provide historical route/fare context—such as typical sampled fare ranges or the prevalence of connecting itineraries. It is not an airfare search API, quote, or inventory feed. Fares are sampled ticket records; app users should see the observation period, sample basis, and route/geography limitations. Before implementation, confirm which recent monthly files are actually available for download and whether the file format remains stable.

### 3. DOT Air Travel Consumer Reports: passenger experience

The U.S. DOT report is a useful airline-quality source alongside the app’s existing BTS delay history. It is published monthly and includes flight delays, mishandled baggage, wheelchair/scooter handling, oversales, consumer complaints, animal incidents, and reports to TSA. Oversales are reported quarterly. The current archive showed data through August 2026 when reviewed. [31](https://www.transportation.gov/individuals/aviation-consumer-protection/air-travel-consumer-reports)

This can add an **airline service experience** signal, but raw complaint totals are misleading because large carriers carry more passengers. Normalize where possible by passengers, flights, or another published denominator, and show the report month. Avoid interpreting complaints as an individual traveler’s predicted outcome.

### 4. FAA airport activity and infrastructure

FAA offers three complementary data sets:

- **ATADS:** public airport take-off/landing operations and rankings. FAA says updates are typically posted on the 20th of each month using the previous month’s data. This is useful for recent airport activity and seasonality. [34](https://www.faa.gov/newsroom/airport-operations-and-ranking-reports-using-air-traffic-activity-data-system-atads)
- **Terminal Area Forecast (TAF):** an official long-range aviation activity forecast for active NPIAS airports. The reviewed 2025 forecast covers fiscal years 2025–2055 and includes passenger enplanements and commercial operations. It is a published forecast, not a current passenger count, and remains in place until the next publication except for corrections or significant changes. [33](https://www.faa.gov/data_research/aviation/taf)
- **28 Day NASR:** public downloadable airport and aeronautical files, refreshed on a 28-day cycle. The current October 29, 2026 subscription includes airport, runway/frequency, navigation-aid, airway, communications, instrument-procedure, and airspace data. This can complement OurAirports with official U.S. runway and facility details. [32](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription) [43](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-10-29/)

FAA also lists ASPM, OPSNET, TFMSC, and ASQP for performance and traffic analysis. Their published availability ranges from about a month to 60 days after the data month, and some detailed or preliminary reports require an account. ATADS and TAF are the simpler public starting points. [36](https://www.aspm.faa.gov/)

The FAA Developers Portal offers APIs that require an API key; SWIM services require an access request through the Agreement Portal. Access and terms depend on the specific service, so these should not be treated as anonymous public APIs just because the data portal is public. [40](https://data.faa.gov/)

### 5. Live aircraft position: ADSB.lol, with strict limits

ADSB.lol currently describes its API as free and its public data as ODbL. Its documentation says an API key may be required in the future and asks developers to contact the maintainer before production use. The ODbL can impose attribution and share-alike obligations for a derived database. [35](https://api.adsb.lol/) [12](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines)

This is a possible **prototype** for a map that shows aircraft positions around an airport or point. It is not a replacement for schedules, airline status, cancellations, or passenger itineraries. Community-receiver coverage and the service’s future terms/availability also make it unsuitable as a critical travel dependency without a written production arrangement.

Airplanes.live’s API documentation lists aircraft-position and reference endpoints, but the documentation page reviewed did not disclose commercial rights or service guarantees. Treat it as unapproved until its current usage terms are confirmed. [37](https://airplanes.live/api-docs)

## Free API plans that are not free for commercial use

| Provider | Free access found | Commercial fit |
|---|---|---|
| Aviationstack | 100 requests on the free plan | Free plan is marked personal/non-commercial; its listed commercial Basic plan starts at $49.99/month. [38](https://aviationstack.com/pricing) |
| FlightAware AeroAPI | Up to $5/month in query credit in the Personal tier; higher credit for ADS-B feeders | Personal license excludes business use. The page lists Standard for business/B2C at $100/month and Premium for B2B at $1,000/month. [39](https://www.flightaware.com/commercial/aeroapi) [41](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Personal_License_Jul2026_v2.pdf) [42](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Standard_License_Jul2026_v2.pdf) |
| OpenSky Network | Public API access exists | Its terms require written permission for for-profit use and for operational REST API use; do not embed it in the live product without approval. [22](https://opensky-network.org/about/terms-of-use) |
| ADSB.lol | Currently free; ODbL | Candidate for an explicitly experimental position view only; contact maintainer for production and plan for attribution/share-alike duties. [35](https://api.adsb.lol/) |

The free flight-status plans reviewed are therefore mostly evaluation access, not a reliable free commercial dependency. If live status is a core requirement, budget for a licensed provider or keep the product’s existing explicit “unknown/unavailable” behavior.

## Recommended implementation order

1. **Build a historical airline-market layer** from T-100 plus the existing BTS on-time history. Start with airport/route/carrier passenger and capacity summaries by month; display the reporting period and avoid implying current service.
2. **Add passenger-experience context** from DOT Air Travel Consumer Reports. Normalize complaints and baggage metrics against flight/passenger volume where data permits.
3. **Improve airport context** using ATADS for recent operations, TAF for long-range demand, and NASR for runway/facility reference fields.
4. **Evaluate DB1C after the first three layers** if users need fare and itinerary comparisons. Treat it as historical sampled fare intelligence, not a shopping result.
5. **Only prototype live position data if users need a map view.** Use ADSB.lol only after confirming production use, ODbL obligations, coverage, and outbound access. Do not use position pings to infer a specific scheduled flight’s status.

The highest-value product intelligence may come from combining these public sources with the app’s own reviewed travel outcomes: actual delay/cancellation, whether a connection worked, actual airport wait, and whether a proposed airport/route was useful. Store these as user-reported outcomes with clear provenance, and keep records scoped to the correct workspace.

## Limitations and verification gates

- BTS, FAA, and DOT sources are primarily historical or forecast data; they do not provide live airline inventory or a guaranteed current schedule.
- DB1C is a sampled ticket dataset. The newest monthly files and precise release lag should be verified before promising freshness.
- Commercial-use terms differ sharply between public data and vendor free tiers.
- FAA API and SWIM access requires a key or agreement for some services; verify each service’s terms.
- ADSB.lol is an experimental option, not an SLA-backed dependency; its ODbL and production-contact conditions require review.
- The app’s saved source check reports 403 outbound failures for several current aviation sources, including BTS/FAA. New feeds must be tested from the actual API workflow before implementation.

## Sources

29. [BTS T-100 database overview](https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE) — Bureau of Transportation Statistics.
30. [Origin and Destination Survey, DB1B/DB1C](https://www.bts.gov/topics/airlines-and-airports/origin-and-destination-survey-data) — Bureau of Transportation Statistics.
31. [Air Travel Consumer Reports](https://www.transportation.gov/individuals/aviation-consumer-protection/air-travel-consumer-reports) — U.S. Department of Transportation.
32. [FAA 28 Day NASR Subscription](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription) — Federal Aviation Administration.
33. [FAA Terminal Area Forecast](https://www.faa.gov/data_research/aviation/taf) — Federal Aviation Administration.
34. [FAA ATADS airport operations data](https://www.faa.gov/newsroom/airport-operations-and-ranking-reports-using-air-traffic-activity-data-system-atads) — Federal Aviation Administration.
35. [ADSB.lol API](https://api.adsb.lol/) — API documentation and license.
36. [FAA Operations and Performance Data](https://www.aspm.faa.gov/) — Federal Aviation Administration.
37. [Airplanes.live API documentation](https://airplanes.live/api-docs).
38. [Aviationstack pricing and plan terms](https://aviationstack.com/pricing).
39. [FlightAware AeroAPI product and pricing](https://www.flightaware.com/commercial/aeroapi).
40. [FAA Data Portal](https://data.faa.gov/).
41. [FlightAware AeroAPI Personal License Agreement](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Personal_License_Jul2026_v2.pdf), July 2026.
42. [FlightAware AeroAPI Standard License Agreement](https://www.flightaware.com/commercial/aeroapi/AeroAPI_Standard_License_Jul2026_v2.pdf), July 2026.
43. [FAA NASR subscription effective October 29, 2026](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-10-29/).
