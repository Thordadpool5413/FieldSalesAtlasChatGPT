# Free data opportunities for Field Sales Atlas

**Research date:** November 6, 2026  
**Scope:** Existing API/data connections and additional free or public sources that could improve territory planning, prospect context, travel risk, and aviation context.  
**Source base:** 28 distinct sources, including government documentation, licensing pages, and the public dataset publishers.

## Executive summary

Field Sales Atlas already has a useful base: airport-wide FAA notices, NOAA aviation weather, NWS alerts and forecasts, Census geography/geocoding, OurAirports reference data, historical aviation datasets, and optional OSRM routing. Its strongest gap is not a lack of another weather API. It is the lack of business-market context that can help a trainer decide which areas and accounts deserve attention.

**Recommended order:**

1. **Add U.S. and Canadian market-sizing layers.** Join U.S. Census ACS and County/ZIP Business Patterns with Canadian Business Counts. These provide demographic and business-density context by geography and industry, not named leads. The Census API is free; a key is needed when an application exceeds 500 calls per day. A key is free to request. The important caveat is that 2023 is currently the latest CBP reference year, with no 2024 release date scheduled. [1](https://www.census.gov/data/developers/data-sets/cbp-zbp/cbp-api.html) [2](https://www.census.gov/data/developers/data-sets/acs-5year.2022.html) [3](https://www.census.gov/programs-surveys/cbp/data.html) [4](https://www.census.gov/content/dam/Census/data/developers/api-user-guide/api-user-guide.pdf) [5](https://www2.census.gov/about/training-workshops/2026/2026-02-19-getting-started-with-census-api-transcript.pdf) [6](https://www150.statcan.gc.ca/n1/daily-quotidien/260213/dq260213c-eng.htm)
2. **Pilot a place-data layer in one target market and sales category.** Overture Places is the best broad candidate found for location context, but it is a multi-source dataset with source-specific licensing and attribution. Treat place records as unverified candidates, not a lead list. [10](https://docs.overturemaps.org/guides/places) [11](https://docs.overturemaps.org/attribution/)
3. **Add road-event context only for supported regions.** A 511 feed can add incidents and closures where a target area is covered, but the example reviewed is regional and its commercial reuse terms need confirmation. The app's current NWS feeds do not show road conditions, and OSRM routing does not provide live traffic. [16](https://511.org/open-data/traffic) [17](https://www.weather.gov/documentation/services-web-api) [19](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy)
4. **Keep aviation signals historical and clearly labeled.** BTS-derived route and airport history, the existing airport-wait archive, and official CBP historical processing data can add planning context. They do not confirm a specific flight or current queue. I did not verify a free, commercially safe live flight-status feed for this app; OpenSky requires written approval for for-profit use. [20](https://nasstatus.faa.gov/) [21](https://www.transtats.bts.gov/ontime/) [22](https://opensky-network.org/about/terms-of-use) [23](https://awt.cbp.gov/Specs) [24](https://huggingface.co/datasets/digitalhen/us-airport-wait-times) [25](https://flyerintel.com/data-sources)

**Immediate blocker:** the repository's source check, dated November 6, 2026, reports outbound 403 failures for FAA, NOAA, NWS, ECCC, BTS downloads, and routing setup. OurAirports refreshed successfully. The report should therefore be read as a source and product assessment, not as confirmation that new or existing public hosts are reachable from the deployed app. Fix or verify outbound access before building any new dependency. (Repository evidence: `artifacts/field-sales-atlas/docs/TRAVEL_SOURCE_CHECK.json` and `docs/DEPENDABLE_TRAVEL_RELEASE.md`.)

## Background: what the app already has

The local backend contains provider adapters for FAA airport-wide notices, NOAA METAR/TAF, NWS alerts and point forecasts, an ECCC surface-observation candidate, Census Gazetteer/geocoding, OurAirports reference data, a direct BTS monthly import, and optional OSRM road matrices. It also calls a third-party historical BTS-derived dataset from FlyerIntel and a Hugging Face archive of airport-published security and immigration wait estimates. Relevant code includes `artifacts/api-server/src/field-atlas/backend/providers/publicTravel.ts`, `providers/bts.ts`, `flightHistory.ts`, `securityHistory.ts`, `censusZcta.ts`, and `providers/routing.ts`.

The current labels and source caveats are important: FAA notices are airport-wide, the historical aviation metrics are not a current schedule or seat check, and the airport-wait archive contains posted estimates rather than measured or guaranteed wait times. The app does not currently establish live flight-specific status, airfare inventory, or verified live road traffic. The Hugging Face dataset card describes a third-party archive built from airport-published feeds and CBP data, covering 30 airports from April 2026 onward; update intervals vary by airport, there are gaps, and the dataset is licensed CC BY 4.0. The local adapter uses it as historical context, not a live TSA feed. [24](https://huggingface.co/datasets/digitalhen/us-airport-wait-times)

The source-status file says the direct BTS import is not installed and reports recent source access failures. Separately, FlyerIntel describes its history as monthly U.S. DOT/BTS-derived data, released roughly two to three months after the covered month; that is a useful baseline if the upstream files remain available, but it is still historical. [21](https://www.transtats.bts.gov/ontime/) [25](https://flyerintel.com/data-sources)

## Findings

### 1. Market potential: the highest-value general addition

U.S. Census sources can give the app a consistent geographic basis for territory sizing. ACS 5-year estimates provide demographic, housing, and economic context. County Business Patterns and ZIP Code Business Patterns provide counts of establishments, employment, and payroll by industry and geography. These measures can support a “market potential” or “business density” layer and allow a territory to be compared with similar areas. They are aggregate statistics, not a directory of businesses or evidence that any individual company is actively buying. [1](https://www.census.gov/data/developers/data-sets/cbp-zbp/cbp-api.html) [2](https://www.census.gov/data/developers/data-sets/acs-5year.2022.html)

The Census API is free, and the current user guide says a key is required above 500 queries per day from one IP address and for a web application expected to exceed 500 requests per day even when its users have different IP addresses. The key is free to request. This corrects an earlier source summary that incorrectly said a key was always required. [4](https://www.census.gov/content/dam/Census/data/developers/api-user-guide/api-user-guide.pdf) [5](https://www2.census.gov/about/training-workshops/2026/2026-02-19-getting-started-with-census-api-transcript.pdf)

There is a meaningful freshness limitation: as of November 6, 2026, the Census CBP page lists 2023 as the latest reference year and says there is no planned 2024 release date. This is still useful for broad market structure, but the product must show the reference year and avoid presenting the counts as current openings or live business activity. [3](https://www.census.gov/programs-surveys/cbp/data.html)

For Canada, Statistics Canada's December 2025 Business Counts were released February 13, 2026. Counts are produced twice a year and released in August and February, with industry and employment-size breakdowns across Canada, provinces/territories, CMAs, and CSDs. This is a strong Canadian companion for market sizing, but its geographic aggregates should not be presented as a street-level prospect directory. [6](https://www150.statcan.gc.ca/n1/daily-quotidien/260213/dq260213c-eng.htm) [7](https://www.statcan.gc.ca/en/statistical-programs/document/1105_D16_V4)

Statistics Canada's Web Data Service is an API for published data and metadata, and its open licence permits commercial reuse with attribution. However, I did not confirm a supported WDS endpoint for the specific Canadian Business Counts product. The low-risk first implementation is to use the official published table or bulk file, and only use an API route after validating the exact table identifier, query behavior, and update process. [8](https://www.statcan.gc.ca/en/terms-conditions/open-licence-faq) [9](https://www.statcan.gc.ca/en/microdata/api)

**Product fit:** build a territory score from a small, explainable set of measures—such as target-industry establishment counts, population or household context, and employment size—then show the geography, reference year, and source. Select NAICS categories with the product owner rather than treating all businesses as equally relevant.

### 2. Place data: useful for candidate discovery, not verified leads

Overture Maps Places is the best global POI starting point found for a map-based candidate layer. Its documentation describes a published dataset rather than a live place-verification API. Its licensing page lists multiple upstream contributors and different license/attribution obligations, including CDLA Permissive 2.0, Apache 2.0, and CC0 sources. The safe design is to retain source lineage and attribution with each imported record or source partition, rather than applying one blanket license statement to all places. [10](https://docs.overturemaps.org/guides/places) [11](https://docs.overturemaps.org/attribution/)

OpenStreetMap data can be used commercially under the ODbL, subject to attribution and possible share-alike requirements for a derivative database. That permission applies to the data, not to unlimited use of community-operated services. Public Overpass instances and tile servers should not be treated as a dependable production API. For a production map, use regional extracts, self-hosting, or a provider whose service limits and commercial terms match the app. [12](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) [13](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ) [14](https://wiki.openstreetmap.org/wiki/Overpass_API)

City business-licence datasets can be more specific than a global POI layer, but are local and inconsistent. Vancouver is one example of a published municipal business-licence dataset; each city needs its own check for fields, update frequency, missing or protected addresses, and commercial reuse terms. Do not assume that one city's open-data feed generalizes nationally. [15](https://opendata.vancouver.ca/explore/dataset/business-licences/map?disjunctive.businesssubtype&disjunctive.status&location=12%2C49.26904%2C-123.13494)

For any place layer, deduplicate, expose the source and last-seen date, and let users mark a location as wrong or closed. A mapped location is not proof that the business is active, reachable, a fit for the product, or a qualified lead.

### 3. Ground travel: regional incident feeds can add context, but not universal coverage

NWS is already a useful free U.S. source for point forecasts and alerts. Its documentation calls for an identifying `User-Agent` and operationally responsible use. Weather can indicate exposure to a hazard; it cannot confirm a road closure or calculate a traffic-aware arrival time. [17](https://www.weather.gov/documentation/services-web-api)

The 511 SF Bay open-data portal is an example of a regional traffic source. Its documented default is 60 requests per hour and it requires a token. It can be a useful pilot if the app's users work in that region, but the portal's geographic limits and data-agreement/commercial reuse terms must be checked before a product dependency is made. This review did not find a single nationwide, commercially verified 511 feed that covers all territories. [16](https://511.org/open-data/traffic)

The app's OSRM integration is optional, and the current source-status file says no maintained routing endpoint or graph is configured. OSRM route geometry and duration estimates do not include live traffic unless a separately maintained traffic-aware service is supplied. A public demo server is not a production guarantee; self-hosting or a maintained service is preferable. [19](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy)

Do not substitute Open-Meteo's free tier into a commercial product without a permitted plan: its published terms distinguish non-commercial free use from paid commercial use. This is a good example of why “free API” and “free for a commercial product” are different questions. [18](https://open-meteo.com/en/terms)

### 4. Aviation: improve historical planning, not live-flight claims

The app already has airport-wide FAA events and historical BTS-derived route information. FAA NAS status is not an individual-flight confirmation. BTS records are historical and delayed; the FlyerIntel source page describes monthly publication roughly two to three months after the covered period. The direct BTS import in this repository is currently unavailable in the latest source check. [20](https://nasstatus.faa.gov/) [21](https://www.transtats.bts.gov/ontime/) [25](https://flyerintel.com/data-sources)

The airport-wait archive already connected in backend code is a useful but carefully bounded dataset: it is a third-party scrape/archive of posted security and immigration estimates from airport feeds and CBP, and the publisher documents airport-specific update intervals, incomplete periods, and estimate—not measured-time—semantics. Keep its data clearly marked as historical and third-party. [24](https://huggingface.co/datasets/digitalhen/us-airport-wait-times)

CBP also publishes airport wait-time statistics for arriving passengers, including processing times and passenger counts. The official material reviewed describes historical outcomes for flights that have already arrived; I did not verify a supported public API or automated download contract. It is worth testing as an official data supplement, but do not scrape or promise live customs wait times until the access method and terms are confirmed. [23](https://awt.cbp.gov/Specs)

OpenSky's terms do not make its free API a safe default for a for-profit live flight product without written approval. In this review, no source was confirmed that simultaneously provides free, commercially permitted, dependable, flight-specific live status for the app. Continue to distinguish traveler-reported changes, airport-wide notices, weather, and historical airline performance. [22](https://opensky-network.org/about/terms-of-use) [20](https://nasstatus.faa.gov/)

### 5. Industry data: choose only after the sales vertical is known

USDA NASS Quick Stats can support agriculture-oriented territory analysis, with commodity and geography data. Its API requires a registered key, limits rows per request, and carries disclaimer and service-use conditions; verify the current terms and expected use before integrating. EPA ECHO offers facility/compliance data that may be relevant to environmental or regulated-industry sales, but it is not a comprehensive business directory and its commercial-use, refresh, and query constraints need separate validation. [26](https://quickstats.nass.usda.gov/api) [27](https://echo.epa.gov/tools/web-services)

The Statistics Canada Open Database of Healthcare Facilities reviewed here is based on 2019–2020 source material. It is not current enough to use as a present-day facility directory without a newer verified source. This illustrates why each vertical data pack needs its own freshness test. [28](https://www.statcan.gc.ca/en/lode/databases/odhf)

These are examples, not a recommendation to build all three. First identify the industries Field Sales Atlas supports; then select a source with the right geography, refresh cadence, license, and fields.

## Prioritized recommendations

| Priority | Recommendation | Why it ranks here | Gate before implementation |
|---|---|---|---|
| 1 | Market potential layer using Census ACS/CBP and Canadian Business Counts | Broad relevance to territory planning; official, geographic, and industry-aware data | Confirm target geographies/NAICS; label reference year; choose snapshot or API; verify outbound access |
| 2 | Overture Places pilot for one region and category | Adds candidate locations without relying on a city-by-city integration first | Confirm category fit; preserve contributor attribution; deduplicate and validate status |
| 3 | One regional 511 incident/closure pilot | Adds actionable road context beyond weather and route distance | Confirm user region, token and quota, commercial reuse rights, and feed freshness |
| 4 | Improve historical aviation summaries and evaluate official CBP data | Uses sources already close to the product's travel workflow | Restore/verify BTS access; validate CBP automated access; keep results historical |
| 5 | Add vertical-specific public datasets | Potentially strong only for the relevant sales industry | Confirm industry first; then validate terms, licensing, and update cadence |

Alongside external data, the app can learn from its own field activity: visit outcome, next-step completion, time since last visit, territory coverage, and conversion by geography or industry. These first-party signals can be more useful for prioritization than a broad public business count. Keep them scoped to the correct workspace and present them as observed product outcomes, not as a public-data fact.

## Data and reliability design

For each imported record or aggregate, retain at least: provider, source URL, geographic identifier, source/license attribution, reference or observation period, retrieval time, refresh policy, and limitations. Separate **observation**, **historical statistic**, **estimate**, and **reference data** in the UI. Apply freshness rules by source class: live alerts expire quickly; traffic incidents need short TTLs; business counts and census estimates remain valid as dated snapshots; POIs need periodic refresh and user correction.

Do not silently replace unavailable data with a straight-line estimate, stale record, or another source. Keep the current explicit unavailable/partial states. Cache regional snapshots instead of making high-volume API calls on every map interaction, and show the data's age and geographic coverage wherever it affects a territory score.

## Limitations

- The target sales vertical, operating regions, and expected request volume were not specified, so the ranking favors broadly useful layers and keeps sector sources conditional.
- Census CBP data is currently behind the calendar year; this is appropriate for market structure, not live business activity.
- A general Statistics Canada WDS API exists, but a dedicated Business Counts endpoint was not verified.
- Overture and OSM are usable only with their respective source/attribution obligations; hosted community services are not guaranteed production APIs.
- 511 commercial reuse terms and the official CBP automated-access path remain unverified.
- NASS and ECHO were assessed as candidates, not approved production dependencies.
- The current repository source check reports outbound 403 failures for several existing live providers. No new external integration should be considered operational until its host is tested from the actual app environment.
- “No free live-flight source verified” means none met the stated commercial and reliability requirements in this review; it is not a claim that no such product exists anywhere.

## Sources

1. [County Business Patterns APIs](https://www.census.gov/data/developers/data-sets/cbp-zbp/cbp-api.html) — U.S. Census Bureau.
2. [American Community Survey 5-Year API](https://www.census.gov/data/developers/data-sets/acs-5year.2022.html) — U.S. Census Bureau.
3. [County Business Patterns data and release status](https://www.census.gov/programs-surveys/cbp/data.html) — U.S. Census Bureau; accessed November 6, 2026.
4. [Census Data API User Guide](https://www.census.gov/content/dam/Census/data/developers/api-user-guide/api-user-guide.pdf) — U.S. Census Bureau, May 12, 2026.
5. [Getting Started with the Census API transcript](https://www2.census.gov/about/training-workshops/2026/2026-02-19-getting-started-with-census-api-transcript.pdf) — U.S. Census Bureau, February 19, 2026.
6. [Canadian Business Counts, December 2025](https://www150.statcan.gc.ca/n1/daily-quotidien/260213/dq260213c-eng.htm) — Statistics Canada, February 13, 2026.
7. [Business Register data products](https://www.statcan.gc.ca/en/statistical-programs/document/1105_D16_V4) — Statistics Canada.
8. [Statistics Canada Open Licence FAQ](https://www.statcan.gc.ca/en/terms-conditions/open-licence-faq) — Statistics Canada.
9. [Web Data Service API](https://www.statcan.gc.ca/en/microdata/api) — Statistics Canada.
10. [Overture Maps Places guide](https://docs.overturemaps.org/guides/places) — Overture Maps Foundation.
11. [Overture Maps attribution and licensing](https://docs.overturemaps.org/attribution/) — Overture Maps Foundation.
12. [OpenStreetMap Foundation attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).
13. [OpenStreetMap Foundation licence and legal FAQ](https://osmfoundation.org/wiki/Licence/Licence_and_Legal_FAQ).
14. [Overpass API documentation](https://wiki.openstreetmap.org/wiki/Overpass_API) — OpenStreetMap Wiki.
15. [City of Vancouver business licences dataset](https://opendata.vancouver.ca/explore/dataset/business-licences/map?disjunctive.businesssubtype&disjunctive.status&location=12%2C49.26904%2C-123.13494).
16. [511 SF Bay traffic open data](https://511.org/open-data/traffic).
17. [NWS API documentation](https://www.weather.gov/documentation/services-web-api) — National Weather Service.
18. [Open-Meteo terms of use](https://open-meteo.com/en/terms).
19. [OSRM API usage policy](https://github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy).
20. [FAA National Airspace System Status](https://nasstatus.faa.gov/) — Federal Aviation Administration.
21. [Airline On-Time Statistics](https://www.transtats.bts.gov/ontime/) — U.S. Department of Transportation, Bureau of Transportation Statistics.
22. [OpenSky Network terms of use](https://opensky-network.org/about/terms-of-use).
23. [Airport Wait Times specifications](https://awt.cbp.gov/Specs) — U.S. Customs and Border Protection.
24. [US Airport Security & Immigration Wait Times dataset](https://huggingface.co/datasets/digitalhen/us-airport-wait-times) — dataset card and license.
25. [FlyerIntel data sources](https://flyerintel.com/data-sources) — publisher methodology and historical-data notes.
26. [USDA NASS Quick Stats API](https://quickstats.nass.usda.gov/api).
27. [EPA ECHO web services](https://echo.epa.gov/tools/web-services).
28. [Statistics Canada Open Database of Healthcare Facilities](https://www.statcan.gc.ca/en/lode/databases/odhf).
