# Field Sales Atlas: additional aviation data and intelligence

Research checked November 6, 2026. Scope: airplanes, airlines, airports, airspace, flight operations, passenger experience, and aviation-specific intelligence for the two trainers.

For repository-specific wiring, dependencies and acceptance gates, see the [aviation connection blueprint](../architecture/AVIATION_DATA_CONNECTIONS.md), [machine-readable map](../architecture/aviation-connections.json) and [source catalog](aviation-source-catalog.csv).

The strongest new additions are an aircraft reference library, current air traffic control planning advisories, weather-hazard map overlays, and Canadian airport activity data. A live aircraft map is feasible, with licensing and coverage conditions. Free public data can explain much more about a journey, but does not supply a universal, verified source of future schedules, available seats, fares, assigned gates, cabin layouts, or rebooking.

This is a research deliverable. Availability, license conditions and sample responses are distinguished below; these findings do not mean new feeds have been implemented or activated.

## Starting point: extend the app's existing work

The active backend already contains FAA NAS airport notices, NOAA METAR/TAF, NWS weather, Canadian surface-weather handling, OurAirports, BTS history import/derived flight history, a posted airport-wait archive, and optional road routing. It also has a travel assistant, two-trainer planning and reviewed calendar changes. An existing adapter is not proof that its production data is configured, loaded, current or reliable.

Earlier aviation research already identified T-100 route history, OD40 fare benchmarks, extra NOAA hazards, passenger-rights guidance and an experimental ADS-B map. Those remain useful, but are not newly discovered integrations. This report adds aircraft identity and technical profiles, additional operational feeds, current access restrictions, Canadian aviation statistics, photo rights and aircraft performance models.

## 1. Build an aircraft profile library

### FAA aircraft registration database — strongest new aircraft source

Sources: [official download overview](https://www.faa.gov/licenses_certificates/aircraft_certification/aircraft_registry/releasable_aircraft_download), [field documentation](https://registry.faa.gov/database/ardata.pdf).

The public bulk download contains the registration master and aircraft make/model reference files. FAA says it refreshes daily at 11:30 p.m. Central. The documentation includes registration, aircraft and engine reference codes, year manufactured and Mode S hexadecimal identifiers. Join the master and reference files to describe the aircraft rather than exposing raw codes.

**Atlas feature:** a plane detail panel linked from a trusted tail-number assignment or an observed aircraft: registration, manufacturer, model, manufacture year where populated, technical reference, source and refresh date. Historical BTS tail numbers could also link to an appropriately dated aircraft record.

**Important boundaries:** this covers U.S. registrations, not every aircraft worldwide. Registered owner is not necessarily the operating airline. Registrations can be reassigned; preserve identity and validity history. Do not mistake a registry record for proof that an aircraft is operating a particular flight today. FAA now permits certain owner personal information to be withheld; use technical aircraft facts and avoid importing owner names/addresses for this feature. Aircraft age alone is not a safety, maintenance or cabin-comfort score.

**Verification:** official overview and PDF field documentation retrieved. The full approximately 60 MB archive was not downloaded or imported.

### FAA Aircraft Characteristics Database — verified machine-readable model data

Sources: [overview](https://www.faa.gov/airports/engineering/aircraft_char_database), [actual spreadsheet](https://www.faa.gov/airports/engineering/aircraft_char_database/aircraft_data).

A real XLSX file was downloaded and inspected. Columns include ICAO type code, manufacturer/model, engine class/count, wingspan, length, maximum take-off weight, wake category and approach characteristics. The landing page labels the release October 2024; it must be presented as a reference edition, not a current fleet feed.

**Atlas feature:** readable type explanations such as aircraft family, jet/turboprop, dimensions and engine count; map icons grouped by aircraft category. Preserve the exact model/variant matching method.

**Limitations:** airport-planning characteristics do not establish airline seating, Wi-Fi, outlets, seat pitch, an assigned variant or the interior of a specific aircraft. Some fields reference other technical sources; retain provenance rather than assume all referenced source materials have identical reuse terms.

## 2. Explain airport and airspace disruption

### FAA ATCSCC operations-plan advisories

Source: [current operations plan](https://www.fly.faa.gov/adv/adv_spt).

This is more detailed operational context than a basic airport delay flag. The sampled November 6 advisory contained active and possible ground stops/delay programs, weather constraints, routing initiatives, staffing triggers, and runway/equipment impacts. It included an advisory number, issue time and event windows.

**Atlas feature:** an airport/itinerary briefing that explains the source's stated reason for constraints, affected airports and validity window. Distinguish ACTIVE, PLANNED, POSSIBLE and EXPIRED. An explicitly possible future ground stop must never become a confirmed current event in the assistant.

**Engineering:** this is a public text/HTML product, not a guaranteed stable JSON API. Keep raw advisories and parser versions, deduplicate advisory IDs, normalize UTC and date rollovers, and check for replacement/cancellation. Avoid attributing a specific flight delay to an airport-wide advisory unless that relationship is confirmed.

### FAA NOTAM Management Service and SWIM

Sources: [NOTAM modernization](https://www.faa.gov/about/initiatives/notam), [NMS FAQ](https://www.faa.gov/about/initiatives/notam/faqs), [SWIM access](https://www.faa.gov/air_traffic/technology/swim/products/get_connected).

Runway, taxiway, equipment and airspace notices could support a richer operational map. The NMS FAQ explicitly requires contacting FAA to request the NMS distribution API. Its documentation contains transition plans and dates; a planned rollout is not evidence that Atlas already has production access.

SWIM's current access page describes a SWIFT portal distributing near-real-time data using Solace JMS. Some services require a separate reviewed request. It is a substantial integration project with service-specific access, schemas and permissions, rather than an anonymous REST URL that can simply be added to Replit.

**Recommendation:** pursue these after the simpler public advisory integration. Confirm access, allowed use, fees if any, service coverage and current production documentation first. A public information page does not establish unrestricted free API rights. A runway closure or nearby temporary flight restriction does not automatically mean a passenger's flight is cancelled.

### FAA NASR and airport diagrams

Sources: [NASR subscriptions](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/), [digital terminal procedures](https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/).

Use published facility/runway reference data and official diagram links to enrich airport details. Preserve effective-cycle dates and choose the current applicable cycle; the latest file retrieved by an application can still be an older edition. This is airport reference, not a universal terminal-amenities or real-time gate feed.

## 3. Add actual aviation hazard layers

Source: [NOAA Aviation Weather Center API documentation](https://aviationweather.gov/data/api/).

Expand the existing METAR/TAF integration with SIGMET polygons, G-AIRMETs, Center Weather Advisories and pilot reports where applicable. Show issue/observation time, expiry, altitude range, hazard type and raw source text. Product coverage differs by geography; do not use obsolete CONUS text AIRMET products in a new integration.

**Validated samples:** the SIGMET endpoint returned a GeoJSON FeatureCollection with four features and validity times. A pilot-report query around Orlando returned 22 records with observation times, positions, flight levels and raw reports. Those counts describe the sampled time and query area, not a permanent service volume.

- SIGMET sample: `https://aviationweather.gov/api/data/airsigmet?format=geojson`
- Pilot-report sample: `https://aviationweather.gov/api/data/pirep?id=KMCO&distance=150&age=2&format=json`

**Atlas feature:** a time-aware weather layer and a sourced explanation of conditions relevant to the itinerary. A pilot report describes one aircraft's experience at a place, altitude and time; it is not a guarantee of another aircraft's ride. Origin/destination alone does not establish the actual flight path. Do not convert a hazard intersection into a flight-safety judgment or an unvalidated cancellation probability.

## 4. Live aircraft positions and historical tracks

### adsb.lol

Sources: [live API source/readme](https://github.com/adsblol/api), [historical data documentation](https://www.adsb.lol/docs/open-data/historical).

A bounded live query near Orlando returned valid aircraft JSON containing 58 records. Fields included ICAO hexadecimal address, callsign, registration/type when available, latitude/longitude, altitude, ground speed, heading and observation-age fields. The API documentation root intermittently returned 503 even while the sampled data endpoint worked. Plan for independent endpoint failures.

Historical daily files are explicitly ODbL 1.0. Observe attribution and applicable database share-alike requirements; determine obligations before combining a distributable derived database with private application data. The API readme says limits vary with load and future access may require a feeder-obtained key. Confirm live-service production terms separately from historical dataset licensing.

**Atlas feature:** an optional nearby-aircraft map and selected-aircraft history. Server-side bounding-box queries, shared caching, stale-position suppression and clear last-seen labels are preferable to polling every aircraft from every browser.

**Critical distinction:** ADS-B observations do not establish scheduled service, a gate, cancellation, a passenger booking or available seats. Marketing flight numbers, operating flight numbers and radio callsigns are different identifiers. An inbound-aircraft dependency alert requires a trustworthy date-specific aircraft/operating-flight assignment. Receiver gaps, ground coverage and missing transmissions must remain visible uncertainties.

### Other tracking and lookup services

- [adsb.fi open-data terms](https://github.com/adsbfi/opendata): public endpoints are limited to one request per second; the current terms expressly restrict the open service to personal, non-commercial use. It is not approved as a free work-app dependency without another arrangement.
- [airplanes.live](https://airplanes.live/api-docs/): documentation retrieved, but the sampled data endpoint returned 403 and usable business permissions were not established. Keep it unapproved pending verification.
- [OpenSky REST documentation](https://openskynetwork.github.io/opensky-api/rest.html): OAuth2 client credentials, endpoint-specific credit budgets and different anonymous/authenticated history access. Its terms page could not be retrieved in this environment; a free quota is not proof of commercial rights.
- [adsbdb](https://github.com/mrjackwills/adsbdb): a callsign lookup returned airline and route metadata. However, its README explicitly prohibits copying, publishing or incorporating its flight-route data into another database without the named contributor's permission. The server code's MIT license does not remove that data restriction. Do not use it as an unrestricted route database.

## 5. Aircraft imagery and aviation knowledge

### Planespotters photo API

Source: [API documentation and terms](https://www.planespotters.net/photo/api).

The free, keyless API can return a thumbnail for a registration or hex code. It requires visible photographer credit and an obvious link to the original photo. Non-browser clients need a descriptive User-Agent with contact information. JSON may be cached up to 24 hours; the viewer must fetch the returned image URL directly and unchanged. Rehosting or storing image binaries for later use is prohibited.

**AI restriction:** photos and metadata may not be used to train, fine-tune, evaluate or otherwise build AI/ML datasets. Keep this source outside model-training, evaluation and dataset-generation pipelines. A display-only card with compliant credit is the appropriate proposed use.

A sampled registration query returned valid JSON with an empty photo array. This establishes API access and valid no-result handling, not photo availability for every airplane.

### Wikimedia Commons

Sources: [reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [Imageinfo API](https://www.mediawiki.org/wiki/API:Imageinfo).

A second option for aircraft-type images, with each file's license, attribution and share-alike requirements carried into the UI. Do not assume every image or its metadata has the same license. Prefer a curated set of verified type photos. Exterior photos do not prove the booked aircraft's current cabin configuration.

### OpenAP aircraft performance models

Sources: [handbook](https://openap.dev/), [code and data-source notes](https://github.com/TUDelft-CNS-ATM/openap), [LGPL v3 license](https://github.com/TUDelft-CNS-ATM/openap/blob/master/LICENSE).

OpenAP is an open-source Python aircraft performance toolkit with aircraft/engine properties, fuel/emissions estimates, kinematic models and flight-phase functions. It is a calculation library, not an airline status API or a trained travel assistant. The repository identifies different underlying data sources; assess the specific model/data components used and comply with LGPL obligations.

**Atlas feature:** an optional educational aircraft comparison or clearly modeled emissions estimate, with aircraft type, trajectory assumptions, load-factor assumptions and model version. It cannot establish actual fuel burned, actual airline efficiency, per-passenger emissions, cabin comfort or a safe operational flight plan from a model name alone. Lower priority than dependable arrival and recovery information.

## 6. Canadian aviation data and screening context

Sources: Statistics Canada [monthly aircraft movements, table 23-10-0303-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2310030301), [annual airport passenger traffic, table 23-10-0253-01](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=2310025301), [Open Government Licence – Canada](https://open.canada.ca/en/open-government-licence-canada).

The official open-data catalog returned real records, table identifiers, CSV download URLs and the Canadian open-government license for these datasets. Additional movement tables separate domestic/international activity, operation type and aircraft weight categories. Preserve each table's scope: not every aircraft movement is a scheduled passenger flight. Passenger totals and airport movements are activity baselines, not current queues or flight availability.

**Atlas feature:** Canadian airport profiles and seasonal activity context, complementing the app's U.S.-heavy historical sources. Import the published tables as background jobs and label reporting periods. The catalog was verified; bulk statistical files were not imported and a live route schedule was not established.

[CATSA's actual current-wait page](https://www.catsa-acsta.gc.ca/en/current-wait-times) was reachable. It says the page updates every two minutes and explains that the measurement covers the queue before screening. It excludes check-in, baggage drop, screening processing, U.S. preclearance and walking to the gate. This is useful official traveler context, but a supported reusable API and production data permission were not established. Start with an official link, rather than inventing a CATSA API or assuming the displayed queue covers the complete airport process.

Transport Canada's aircraft register search was also reachable; a verified bulk feed and its reuse terms were not established in this pass. Do not describe it as a ready-to-import free aircraft API.

## 7. Still valuable: historical airline and passenger data

These extend the earlier aviation audit, rather than representing new live connections:

- [BTS T-100](https://www.transtats.bts.gov/DatabaseInfo.asp?QO_VQ=EEE&Yv0x=D): use **segment** records for historical nonstop service, performed departures, capacity and aircraft/service categories. Together with BTS on-time history this can identify historically served alternate routes. It cannot verify a future flight or seat. Do not confuse segment data with itinerary market data.
- [BTS OD40](https://www.bts.gov/OD-40): historical fare context with the newer 40% ticket-sampling program. Distinguish successor and legacy schemas, reporting periods and publication lag. A benchmark is not a live quote.
- [DOT Air Travel Consumer Reports](https://www.transportation.gov/individuals/aviation-consumer-protection/air-travel-consumer-reports): baggage, oversales, accessibility and complaint context where reported. Normalize appropriate denominators and explain carrier/reporting coverage. These are not individual-flight or individual-bag predictions.
- [NTSB public aviation data](https://www.ntsb.gov/safety/data/Pages/Data_Stats.aspx): optional factual incident and investigation lookup. Preserve preliminary/final status and distinguish general aviation from commercial airline operations. Do not produce a “safest aircraft/airline” ranking from raw incident counts or aircraft age.

## 8. European data: useful research, restricted production rights

[EUROCONTROL's Aviation Data Repository for Research](https://www.eurocontrol.int/dashboard/aviation-data-research) now advertises a meaningful October 2026 expansion: annual coverage increases from four months to twelve and release delay falls from 24 to 12 months. However, its linked [terms](https://www.eurocontrol.int/sites/default/files/2025-04/eurocontol-aviation-data-repository-research-terms-of-use.pdf) restrict access to R&D and prohibit commercial use/transfer of derived products without written permission. The linked 2025 terms also describe the older four-month coverage, so obtain the applicable agreement rather than infer rights from newer coverage marketing.

[EUROCONTROL performance downloads](https://ansperformance.eu/data/) include airport traffic, arrival flow-management delay, additional taxi/holding time and other historical metrics. [OPDI](https://www.opdi.aero/data) publishes flight events and measurements derived in collaboration with OpenSky; its current data page lists January 2022–September 2026. Both the [site disclaimer](https://ansperformance.eu/about/disclaimer/) and OPDI's own explanation constrain commercial use. “Open data” in a project title is not sufficient for commercial ingestion rights.

[UK CAA punctuality statistics](https://www.caa.co.uk/data-and-analysis/uk-aviation-market/flight-punctuality/uk-flight-punctuality-statistics/) are another useful historical candidate if UK travel matters. The yearly index was verified; the actual download formats and applicable reuse rights still need review.

## 9. Make the intelligence useful for the two trainers

### A. Aircraft and airport briefing

Question: “What airplane is this, and what should we know about this airport?”

Return a sourced aircraft technical profile, assignment verification status, airport reference, current valid notices and relevant weather. Cabin and airline-specific facts require their own current sources. Never fill missing seat-map/Wi-Fi/aircraft-assignment details from a generic aircraft-family description.

### B. Connection and disruption explanation

Question: “What could affect our connection, and which visits would be affected?”

Combine confirmed or supplied flight changes, saved trainer constraints, active operational notices, valid weather, historical delays and actual transfer allowances. Explain consequences for each trainer. Identify historical alternative airports/routes as candidates for verification, not flights available to book. Explain the difference between a confirmed event, a forecast, a historical pattern and a calculated consequence.

### C. Arrival deadline and recovery comparison

Question: “Can we finish these visits and both get home Thursday?”

Use deterministic itinerary and calendar calculations, sourced travel facts and explicit buffers. Compare the effects of shifting a visit, splitting coverage or using another airport. The assistant should state which result changes if a provisional assumption changes. Require current airline confirmation for availability and reviewed calendar updates.

### D. Personal learning and calibrated prediction

Use opt-in trip actuals for each trainer: terminal access, bag collection, rental pickup, transfers and meeting overruns. Report sample sizes and uncertainty. For any future statistical delay model, use temporal holdouts, compare against a simple historical baseline, check calibration and measure performance by airport/route/season. Prevent future information leakage. Do not invent a confidence percentage or train on data whose terms forbid it.

The practical AI design is retrieval plus typed tools: retrieve an allowed source, compute a travel consequence, cite the evidence. A language model explains the result; it should not invent aircraft assignments, calculate a timetable from memory, or turn observations into booking inventory.

## 10. Proposed mapping into the existing app

| Area | New data and behavior |
| --- | --- |
| Atlas map | Optional live aircraft; time-filtered SIGMET/G-AIRMET polygons and pilot-report points; airport/runway reference; clearly marked operational notices. |
| Booked flight detail | Verified assignment status, aircraft profile, lawful image credit, source age, valid airport notices and any confirmed inbound-aircraft relationship. |
| Flight DNA | Historical route frequency, reporting-period airline experience, Canadian activity context and sample counts. |
| Travel assistant | Aviation tools for aircraft lookup, notices, hazards and historical alternatives; calculations using both trainers' constraints. |
| Recovery review | Impact on both trainers, explained alternatives, availability verification state and a reviewed calendar update. |

Recommended build order:

1. Repair remaining existing source/schema/freshness gaps and verify production BTS/routing readiness.
2. Add FAA aircraft registration/reference and the Aircraft Characteristics spreadsheet. These provide genuinely new plane knowledge with predictable import behavior.
3. Add structured ATCSCC advisories and AWC hazard overlays; link them to airport/travel dates and retain raw evidence.
4. Add Canadian activity tables and deeper historical route/passenger metrics where relevant.
5. Add a compliant aircraft photo card and a live aircraft pilot only after production rights and matching behavior are resolved.
6. Consider NMS/SWIM and advanced performance/research models after access, engineering cost and practical travel benefit are established.

Every fact needs source URL, permitted use/license, geographic coverage, retrieval time, observation/issue time, validity or reporting period, schema/model version, and matching method. Historical metrics additionally need the denominator, sample size, scope and missing-data rules. Missing, expired, no relevant record and provider unavailable are different states. For combined output, expose the age of each contributing source rather than a single misleading “live” timestamp.

## 11. Free-service traps relevant to this work app

- [Aviationstack](https://aviationstack.com/pricing): the free plan currently advertises 100 requests and personal/non-commercial use.
- [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/): Personal permits personal/academic derivative use; the Standard tier covers business use and currently lists a $100 monthly minimum. It is not a free business flight-status dependency.
- [AirLabs](https://airlabs.co/): a free package is advertised, but current business-use permissions, covered endpoints and permanent allowance were not verified. Its terms also describe limited free trials.
- [AeroDataBox](https://aerodatabox.com/pricing/): free plans are advertised through marketplaces, while derived-work licensing has separate pricing. Confirm the selected marketplace plan and derived-data use before treating it as a free intelligence backend.
- API access, software licensing, underlying data licensing, model training permission and redistribution are separate checks. Free data can still incur hosting, storage, bandwidth and maintenance costs.

The valuable near-term result is an aviation briefing and decision system with evidence at every step: what the aircraft is, what the airport and airspace are doing, what history suggests, what each trainer can still accomplish, and which facts require confirmation.
