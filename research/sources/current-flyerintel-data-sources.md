Source: https://flyerintel.com/data-sources
Title: Data Sources · FlyerIntel
Fetched: 2026-11-06T05:59:14.658Z

[Skip to content](https://flyerintel.com/data-sources/#main)

# Data sources

FlyerIntel combines official public data with its own normalization and analysis. Everything below is either a source we ingest or a limitation we think you should know about.

**Historical coverage:** July 2023 – August 2026,22,316,707 individual flight records across 38 months.

## Sources we ingest

### ADSB.lol community ADS-B

ADSB.lol (Katia Esposito and contributing feeders)

Aircraft observed on the ground at, and airborne near, each covered airport by the ADSB.lol volunteer receiver network, plus departures and arrivals observed as aircraft change between those states.

**Updates:** Every 5 minutes

**License:** Open Database License (ODbL) 1.0 — https://opendatacommons.org/licenses/odbl/1-0/

**Limitations:** These are observations from a volunteer receiver network, not airport or FAA operational data. Counts are a floor: ADS-B coverage varies by airport and by hour, aircraft not received are simply absent, and ground counts depend on how much of a field a nearby receiver can see. FlyerIntel does not infer delays, ground stops, ground delay programs or cancellations from these figures, and does not publish taxi times from them — a five-minute sampling interval cannot time a taxi honestly. Movement counts cover only transitions actually witnessed between two consecutive readings, so they undercount whenever coverage is thin or a run is missed. Contains information from ADSB.lol, which is made available under the Open Database License (ODbL).

[api.adsb.lol](https://api.adsb.lol/)

### Aviation Weather Center — METAR

NOAA / National Weather Service Aviation Weather Center

Routine aerodrome weather observations for each airport: wind, visibility, ceiling, temperature, precipitation and flight category. FlyerIntel decodes these and derives its own operational impact assessment.

**Updates:** Hourly, with special observations issued when conditions change materially.

**License:** US Government public domain

**Limitations:** An observation describes conditions at the field at one moment. It does not describe en-route weather, and it does not by itself establish that any particular flight will be delayed.

[aviationweather.gov/data/api/](https://aviationweather.gov/data/api/)

### Aviation Weather Center — TAF

NOAA / National Weather Service Aviation Weather Center

Terminal aerodrome forecasts covering the 24 to 30 hours ahead at each airport, used for forward-looking operational weather context.

**Updates:** Issued every six hours, amended as needed.

**License:** US Government public domain

**Limitations:** A forecast is a probability statement about airfield conditions, not a prediction about any individual flight.

[aviationweather.gov/data/api/](https://aviationweather.gov/data/api/)

### Baltimore/Washington International Thurgood Marshall Airport conditions

Maryland Aviation Administration

Checkpoint waits by lane, and live space counts and posted rates for each BWI parking facility, above the airport’s own stated observation time.

**Updates:** Every few minutes.

**License:** Airport published information, used with attribution

**Limitations:** BWI’s stated observation time does not always advance — overnight the page has been seen still reporting the previous morning’s figures — so FlyerIntel refuses to publish a reading past its age limit rather than presenting a frozen one as current. The parser requires the whole page shape to match, so a redesign produces a loud failure rather than quietly wrong numbers.

[www.bwiairport.com/parking](https://www.bwiairport.com/parking)

### CBP Airport Wait Times

US Customs and Border Protection

Hourly passport control wait times for arriving international passengers at US airports, reported per terminal with US and non-US queues separated, booth counts and passenger volumes. FlyerIntel uses it to show what customs normally takes at each terminal, by hour and by day.

**Updates:** Daily, covering flights up to about two days earlier.

**License:** US Government public domain

**Limitations:** This is the arrivals queue at passport control, not the TSA departure security checkpoint — a different queue for a different passenger. Because records arrive about two days behind, it describes what is typical rather than what is happening now.

[awt.cbp.gov/](https://awt.cbp.gov/)

### Charleston International Airport conditions

Charleston County Aviation Authority

Counter-by-counter parking occupancy and checkpoint waits in real minutes, both published by CHS with an observation time.

**Updates:** Every few minutes; FlyerIntel reads it every fifteen.

**License:** Airport published information, used with attribution

**Limitations:** The parking payload states one observation time for the whole set rather than per counter, so every CHS lot carries the same stamp.

[iflychs.com/passengers/parking/](https://iflychs.com/passengers/parking/)

### Chicago O'Hare and Midway parking status

Chicago Department of Aviation

Open, temporarily full or closed status for each parking facility at both Chicago airports, with the published starting rate.

**Updates:** Continuously.

**License:** Airport published information, used with attribution

**Limitations:** Chicago publishes facility status and a starting rate, not space counts, so FlyerIntel shows exactly that and does not estimate availability from it.

[www.flychicago.com/](https://www.flychicago.com/)

### Cleveland Hopkins International Airport parking availability

City of Cleveland Department of Port Control

Spaces free in CLE’s Smart Garage, from the document its garage sign system publishes and its own homepage reads.

**Updates:** About once a minute; FlyerIntel reads it every fifteen.

**License:** Airport published information, used with attribution

**Limitations:** The document carries no observation time of its own, so its age is taken from the file’s Last-Modified header. It identifies facilities by sign identifier rather than by name, and only the facilities the sign system counts appear — CLE’s other lots are absent from it.

[www.clevelandairport.com/parking-transportation](https://www.clevelandairport.com/parking-transportation)

### Detroit Metropolitan Wayne County Airport parking availability

Wayne County Airport Authority

Live space counts for each parking level, published with the airport’s own observation time.

**Updates:** About once a minute.

**License:** Airport published information, used with attribution

**Limitations:** Counts come from vehicle sensors and can drift between physical audits.

[www.metroairport.com/parking](https://www.metroairport.com/parking)

### FAA National Airspace System Status

Federal Aviation Administration

Current airport-level operational events across the national airspace system: ground stops, ground delay programs, airport closures and general arrival or departure delay conditions.

**Updates:** Continuously; FlyerIntel polls every few minutes.

**License:** US Government public domain

**Limitations:** Reports conditions at the airport level. An airport operating normally does not guarantee any individual flight is on time, and the feed does not cover every operational restriction.

[nasstatus.faa.gov/](https://nasstatus.faa.gov/)

### FlyerIntel analysis

FlyerIntel

Statistics, reliability scores, percentile cohorts and time-of-day analysis computed by FlyerIntel from the sources above. Methods are published and every figure is reproducible from the underlying data.

**Updates:** Recomputed whenever new source data is ingested.

**License:** Proprietary

**Limitations:** Derived figures inherit the coverage limits of their inputs and are only published where sample-size thresholds are met.

[flyerintel.com/methodology/](https://flyerintel.com/methodology/)

### Frederick W. Smith International Airport parking availability

Memphis-Shelby County Airport Authority

Live occupancy counts for each lot, published with an observation time.

**Updates:** Every few minutes.

**License:** Airport published information, used with attribution

**Limitations:** Sensor drift is visible in this feed: at least one level has reported more cars than it has spaces. FlyerIntel discards readings that cannot be true rather than clamping them to zero.

[www.flymemphis.com/parking](https://www.flymemphis.com/parking)

### Hartsfield-Jackson Atlanta International Airport

City of Atlanta Department of Aviation

Official airport reference information for ATL: terminal and concourse layout, airline locations, parking facilities and published rates, and ground transportation.

**Updates:** Verified against the airport website; each fact carries its own verification date.

**License:** Airport published information, used with attribution

**Limitations:** Airport-published details change without notice. Every ATL reference fact on FlyerIntel shows when it was last verified; confirm time-critical details with the airport directly.

[www.atl.com/](https://www.atl.com/)

### Hollywood Burbank Airport parking availability

Burbank-Glendale-Pasadena Airport Authority

Spaces currently free in each of BUR’s Lots C, E, F and G and the four levels of its Short Term Parking Structure, as published on the airport’s own "Parking Availability" board.

**Updates:** The board updates on every page load; FlyerIntel reads it every fifteen minutes.

**License:** Airport published information, used with attribution

**Limitations:** BUR publishes no capacity for any facility, so FlyerIntel shows the number of free spaces and nothing else. The page carries no observation time of its own, so freshness is judged from when FlyerIntel retrieved it rather than from when a sensor last counted. The board shows "FULL" rather than a count for a facility with none free; Lot C is separately announced as closed for construction, and the board does not distinguish that from being genuinely full, so a "FULL" reading here may mean either.

[www.hollywoodburbankairport.com/parking/](https://www.hollywoodburbankairport.com/parking/)

### Indianapolis International Airport parking availability

Indianapolis Airport Authority

Live space counts for each garage level and lot.

**Updates:** Continuously.

**License:** Airport published information, used with attribution

**Limitations:** The feed publishes no observation time, so freshness is measured from retrieval. Its sensors drift — some rows report a negative number of cars present — and FlyerIntel discards those readings rather than showing a figure that cannot be true.

[www.ind.com/parking](https://www.ind.com/parking)

### Iowa Environmental Mesonet ASOS/METAR archive

Iowa Environmental Mesonet, Iowa State University

Hourly surface observations (METAR and SPECI reports) for every covered airport from July 2023, republished by the Iowa Environmental Mesonet from the National Weather Service stream. FlyerIntel joins the weather in each airport’s scheduled departure hour to the flight records to measure what fog, low ceilings, thunderstorms, snow and ice, and high wind cost in cancellations and delays.

**Updates:** Fetched once per UTC month, after the flight records for that month are loaded.

**License:** Public domain: the Mesonet’s disclaimer allows any lawful use of its materials and asks for attribution to the Iowa Environmental Mesonet of Iowa State University

**Limitations:** The archive is provided as collected, with very little quality control and no warranty of accuracy, and a missing value cannot always be told from an unreported one. An observation describes the field at one moment; FlyerIntel takes the worst conditions reported in each clock hour, so an hour with many special reports is more likely to show a brief storm than an hour with one. An hour with no observation has no weather and its flights are left out. The weather is that of the origin airport only, at the scheduled departure hour: it says nothing about the destination, the route, or weather that arrived after the flight was scheduled to leave. Comparing hours of one kind of weather with normal hours shows what flying was like in them, not what the weather caused, because the hours also differ in season and time of day.

[mesonet.agron.iastate.edu/request/download.phtml](https://mesonet.agron.iastate.edu/request/download.phtml)

### Jacksonville International Airport conditions

Jacksonville Aviation Authority

Checkpoint wait times and parking occupancy published by JAX, stamped with the time they were taken.

**Updates:** Every few minutes.

**License:** Airport published information, used with attribution

**Limitations:** JAX labels its wait times as estimates rather than measured queue times, and publishes parking as a percentage full rather than a space count. FlyerIntel presents both as published and does not convert a percentage into a count.

[www.flyjacksonville.com/](https://www.flyjacksonville.com/)

### John Wayne Airport parking availability

John Wayne Airport, Orange County

Live bay counts for each parking structure and lot.

**Updates:** Every few minutes.

**License:** Airport published information, used with attribution

**Limitations:** The published file carries no timestamp, so FlyerIntel dates the counts by when the file itself was last written and publishes nothing older than an hour.

[www.ocair.com/parking-transportation/parking/](https://www.ocair.com/parking-transportation/parking/)

### Lehigh Valley International Airport checkpoint waits

Lehigh-Northampton Airport Authority

Wait times in real minutes for ABE’s general and TSA PreCheck lanes, each stamped by the airport with the time it measured them.

**Updates:** The airport refreshes it every few minutes; FlyerIntel reads it every fifteen.

**License:** Airport published information, used with attribution

**Limitations:** Read from the refresh route the airport’s own widget calls rather than from its homepage, because the homepage is served from a cache that has been seen stating a time ninety minutes behind the live figure. ABE has two lanes and no others; a checkpoint it does not publish is simply absent.

[www.flyabe.com/](https://www.flyabe.com/)

### Louis Armstrong New Orleans International Airport parking availability

New Orleans Aviation Board

Live space counts for each lot and garage, published with an observation time.

**Updates:** Every few minutes.

**License:** Airport published information, used with attribution

**Limitations:** The airport states availability twice on the same page, and FlyerIntel publishes a facility only where the two figures agree — a mismatch means the page layout has shifted and the numbers can no longer be trusted to belong to the lot beside them.

[flymsy.com/parking/](https://flymsy.com/parking/)

### Miami International Airport parking availability

Miami-Dade County Aviation Department

Spaces currently free in MIA’s Dolphin and Flamingo garages, as published on the airport’s own "Available Parking Spaces" table.

**Updates:** The airport’s page refreshes it every two minutes; FlyerIntel reads it every fifteen.

**License:** Airport published information, used with attribution

**Limitations:** MIA publishes no capacity for either garage, so FlyerIntel shows the number of free spaces and nothing else — there is no percentage full, because deriving one would require a denominator the airport does not publish. The feed also covers only these two garages: the Ibis garage, the valet, economy and cell phone lots are absent from it. Its stated time is generated when the request is served rather than when a sensor last counted, so it establishes when the figures were read but cannot by itself prove the counting system behind them is still running.

[www.miami-airport.com/airport-parking.asp](https://www.miami-airport.com/airport-parking.asp)

### Minneapolis-Saint Paul International Airport parking availability

Metropolitan Airports Commission

How full each parking ramp is, published as a percentage with the time of the reading.

**Updates:** Every fifteen minutes.

**License:** Airport published information, used with attribution

**Limitations:** MSP publishes a percentage rather than a space count, so FlyerIntel shows the percentage and does not convert it into a number of spaces.

[www.mspairport.com/parking](https://www.mspairport.com/parking)

### Myrtle Beach International Airport parking availability

Horry County Department of Airports

Capacity, spaces free, an open or closed flag and the posted daily rate for each MYR lot, from the route the airport’s own parking table is built from.

**Updates:** Every few minutes; FlyerIntel reads it every fifteen.

**License:** Airport published information, used with attribution

**Limitations:** The route publishes no observation time, so these figures are dated to when FlyerIntel read them rather than when the airport counted.

[www.flymyrtlebeach.com/parking-transportation/](https://www.flymyrtlebeach.com/parking-transportation/)

### NWS Active Alerts

NOAA National Weather Service

Active National Weather Service watches, warnings and advisories covering each airport, queried by the airport's coordinates.

**Updates:** Every 10 minutes

**License:** Public domain (US Government work)

**Limitations:** A warning describes forecast hazardous weather, not airport operations. FlyerIntel does not infer flight delays, ground stops or cancellations from an alert. Only warnings that plausibly bear on flying are shown; heat and air-quality advisories are excluded.

[api.weather.gov/alerts/active](https://api.weather.gov/alerts/active)

### OurAirports airport database

OurAirports

Airport identity reference data: ICAO codes, coordinates, elevation, municipality and region, used to establish and verify FlyerIntel airport records.

**Updates:** Continuously maintained; FlyerIntel refreshes on demand.

**License:** Public domain (dedicated by the project)

**Limitations:** Community maintained. FlyerIntel treats it as a cross-check against the codes present in federal data rather than as an operational source.

[ourairports.com/data/](https://ourairports.com/data/)

### Port Authority of NY & NJ airport statistics (Open NY)

The Port Authority of New York and New Jersey, via data.ny.gov

Monthly operating statistics for the Port Authority airports — JFK, LaGuardia, Newark Liberty, and also Stewart and Atlantic City — covering air passengers, flights and cargo tonnage from 1977, and public parking, taxi dispatches, coach bus passengers and shared-ride vans from 2002 onwards. Read from the Socrata JSON API on New York State's open data portal.

**Updates:** Not updated. The publisher declares a quarterly or annual posting frequency in the dataset metadata, but no new rows have been published since November 2016.

**License:** No license stated by the publisher

**Limitations:** These are MONTHLY HISTORICAL AGGREGATES and must never be presented as live or current conditions. A parking figure is how many cars used the lots across a whole month, not how full a lot is; a taxi figure is how many cabs were dispatched, not how long the queue is. The series are also closed: the newest month anywhere in this family is September 2016, and most stop at December 2015, so every figure must be shown with the month it describes. Passenger counts exclude crew and other non-revenue passengers; flight counts exclude helicopters; cargo tonnage excludes mail; shared-ride counts cover only bookings taken at the Port Authority Welcome Center desks; parking counts say nothing about how long a vehicle stayed. Domestic and international figures are aggregated with no country or city detail.

[data.ny.gov/browse?q=port%20authority%20airports](https://data.ny.gov/browse?q=port%20authority%20airports)

### Reporting Carrier On-Time Performance

US Department of Transportation, Bureau of Transportation Statistics

Individual records for every scheduled domestic flight operated by carriers that meet the DOT reporting threshold. Includes scheduled and actual departure and arrival times, delay minutes, cancellation and diversion flags, taxi times, distance and delay cause categories. This is the backbone of every historical reliability figure on FlyerIntel.

**Updates:** Monthly, released roughly two to three months after the month it covers.

**License:** US Government public domain

**Limitations:** Covers only carriers above the DOT reporting threshold, and only flights between points within the United States and its territories. Regional flights operated under a mainline brand are reported by the operating carrier, not the marketing carrier. Delay cause minutes are only reported for arrivals delayed 15 minutes or more.

[www.transtats.bts.gov/Fields.asp?gnoyr\_VQ=FGJ](https://www.transtats.bts.gov/Fields.asp?gnoyr_VQ=FGJ)

### San Francisco International Airport conditions

San Francisco International Airport

Spaces currently free in each SFO garage, published on the airport’s parking page beside an occupancy dial for the same garage; and security checkpoint wait times, with general and TSA PreCheck lanes reported separately, alongside the time the figures were taken.

**Updates:** The parking figures change on about a five-minute cycle; FlyerIntel reads them every fifteen. Checkpoint waits are published every few minutes when SFO is publishing them at all.

**License:** Airport published information, used with attribution

**Limitations:** Two separate feeds under one heading, and either can be absent without the other. For checkpoint waits, FlyerIntel uses the page’s own stated observation time and publishes nothing once it is more than 45 minutes old; SFO switches that feed off for long stretches and says so on the page, most recently for the whole of late August 2026, and those periods show as no checkpoint data rather than as a stale figure. The parking page carries no observation time of any kind, so its counts are dated from when FlyerIntel retrieved them rather than from when a sensor counted; the page is served uncached and its figures were seen moving on about a five-minute cycle, but if that counting system ever froze there is nothing on the page that would reveal it. SFO publishes no capacity, so each garage shows spaces free and no percentage — one is implied by the count and the occupancy dial together, but the airport’s own text contradicts the implied figure for ParkFAST, so it is used only to check the readings against each other. ParkFAST itself is not listed: SFO says it sits inside the Domestic Garage, and publishing both risks counting the same spaces twice.

[www.flysfo.com/passengers/parking](https://www.flysfo.com/passengers/parking)

### San José Mineta International Airport parking availability

City of San José

Live space counts and posted rates for each lot, with a per-lot observation time.

**Updates:** Every few minutes.

**License:** Airport published information, used with attribution

**Limitations:** Counts come from vehicle sensors and can drift between physical audits.

[www.flysanjose.com/parking](https://www.flysanjose.com/parking)

### Santa Barbara Airport parking availability

City of Santa Barbara Airport Department

Capacity, cars present and an observation time for each SBA lot, from the route the airport’s own live parking panel is filled from.

**Updates:** Every few minutes; FlyerIntel reads it every fifteen.

**License:** Airport published information, used with attribution

**Limitations:** The feed counts cars present rather than spaces free; the number free is the capacity less that count, which assumes the stated capacity is current.

[flysba.santabarbaraca.gov/airport/parking](https://flysba.santabarbaraca.gov/airport/parking)

### Seattle-Tacoma International Airport checkpoint wait times

Port of Seattle

Live security checkpoint wait times published by the Port of Seattle, with general and PreCheck lanes reported separately.

**Updates:** Continuously; FlyerIntel polls every few minutes.

**License:** Airport published information, used with attribution

**Limitations:** The feed marks individual checkpoints as having no current data while still carrying their last known figure. FlyerIntel honors that flag and shows nothing for those checkpoints rather than repeating a stale number.

[www.portseattle.org/page/live-estimated-checkpoint-wait-times](https://www.portseattle.org/page/live-estimated-checkpoint-wait-times)

### St. Louis Lambert International Airport parking counts

St. Louis Lambert International Airport

Live space counts for each lot.

**Updates:** Continuously.

**License:** Airport published information, used with attribution

**Limitations:** The feed publishes no observation time of its own, so freshness is measured from when FlyerIntel retrieved it. Counts come from sensors and can drift.

[www.flystl.com/parking-transportation/](https://www.flystl.com/parking-transportation/)

### Tucson International Airport parking availability

Tucson Airport Authority

How full each TUS car park is, from the endpoint the airport’s own homepage reads its counting system through.

**Updates:** Every few minutes; FlyerIntel reads it every fifteen.

**License:** Airport published information, used with attribution

**Limitations:** TUS publishes a percentage rather than a space count, and FlyerIntel does not convert one into the other. The payload identifies car parks by keys that are meaningless on their own; which key is which lot is stated only in the airport’s own page script.

[flytucson.com/parking\_transportation/parking.php](https://flytucson.com/parking_transportation/parking.php)

### Wilmington International Airport parking availability

New Hanover County Airport Authority

Spaces free in each ILM lot, from the route its own "Current Available Parking" table is built from.

**Updates:** The airport serves it uncached; FlyerIntel reads it every fifteen minutes.

**License:** Airport published information, used with attribution

**Limitations:** The route publishes no observation time, so FlyerIntel can date these figures only to when it read them.

[flyilm.com/parking-options/](https://flyilm.com/parking-options/)

## Where live data isn't available

FlyerIntel only collects data it is permitted to collect. Where a source blocks automated access, we do not work around it — we leave the section empty and say why. Two limitations currently affect the product:

### FAA National Airspace System status

The FAA publishes current ground stops, ground delay programs and airport closures at [nasstatus.faa.gov](https://nasstatus.faa.gov/). The feed is US Government public domain and the site’s `robots.txt` permits automated access, but requests from FlyerIntel’s server are refused at the CDN edge with an HTTP 403, which appears to be a blanket block on datacenter address ranges rather than a policy decision about this feed.

The collector, the normalization model and the operational-event storage are all built and tested. Until a permitted route to the data exists — an allow-listed address, or an official API — FlyerIntel does not display FAA operational conditions, and never presents their absence as if the airspace system were known to be running normally. In their place an airport page shows what departures in that hour have historically done, drawn from the BTS record and labeled as history. Last attempt returned: `HttpError: HTTP 403 for https://nasstatus.faa.gov/api/airport-status-information`

### Airport security waits and parking

Many airports publish checkpoint wait times and parking availability on their own websites. Where an airport serves that data through an official API or a public feed, FlyerIntel ingests it, normalizes it into a common format and preserves a history so that patterns can be analyzed over time.

Hartsfield-Jackson Atlanta International Airport currently serves every path on [atl.com](https://www.atl.com/) — including`robots.txt` — behind an interactive challenge that has to be solved in a browser. That is an access control the airport has deliberately put in place, and defeating it is not something FlyerIntel does. ATL’s security module and live parking availability are therefore empty; a published daily parking rate is still shown, verified separately against the airport’s own reference information rather than pulled from the blocked feed. Everything else on the ATL profile — reliability, best times to fly, carrier performance and aviation weather — is unaffected.

If you operate an airport and would like your published data represented accurately on FlyerIntel, we would rather work from a source you sanction than from anything else.

## Airports we have decided not to collect from

Some airports publish exactly what this site needs, on paths that are technically open, and we still do not take it. These are the decisions and what would change them. The list is enforced in the collection code rather than kept as a note, because a determination made once has to hold every time a new collector is added.

| Airport | Why not | What would change it |
| --- | --- | --- |
| PDX | flypdx.com's Terms of Use bar access by any robot, spider or other automatic device, and license the content for personal, non-commercial use. Its robots.txt permits the path, but robots is not the whole permission story. | Written permission from the Port of Portland for attributed automated collection. |
| OMA | flyoma.com's robots.txt names its wait-times, parking and parking-rate applications by path and disallows them. That is an explicit statement of intent about exactly this data. | An allow-listed user agent, or a data-sharing arrangement with the airport. |
| SLC | The wait times served under slcairport.com are a third party’s crowd-sourced and modeled estimates proxied through the airport domain. Ingesting them would mean republishing someone else’s model as airport-measured data. | A feed sourced from the airport’s own sensors. |
| PHL | phl.org returns 403 for robots.txt itself, so its crawling policy cannot be read. An unreadable policy is not permission. | A readable robots.txt, or direct confirmation from the airport. |
| GRR | grr.org’s Terms of Use bar the use of any “robot, spider, or other automatic device, process, or means to access the Website for any purpose, including monitoring or copying any of the material”, and license the site for personal, non-commercial use only. Its live feeds — grrfidsrelay.org/parking and /xovis-wait-times — answer openly and carry their own timestamps, so nothing technical stands in the way; the terms do. | Written permission from the Gerald R. Ford International Airport Authority for attributed automated collection at a stated polling rate. |
| RNO | renoairport.com's Terms of Use bar "any robot, spider or other automatic device, process or means" from accessing the site, and permit use "for your personal, non-commercial use only". The live parking feed is served from that same host, so it sits squarely inside those terms even though robots.txt allows the path. | Written permission from the Reno-Tahoe Airport Authority for attributed automated collection. |
| GSP | gspairport.com's Terms of Service prohibit "using any robot, spider or other similar automatic technology, process or means to access or use the Website for any purpose, including monitoring or copying any of the material". Its parking and checkpoint REST routes are open and unauthenticated, which makes this a permissions decision rather than a technical one. | Written permission from the Greenville-Spartanburg Airport District for attributed automated collection. |
| CMH | flycolumbus.com's Terms of Service prohibit "using any robot, spider or other similar automatic technology, process or means to access or use the Website for any purpose, including monitoring or copying any of the material". Its car-park status route is open, but the terms are an explicit statement about exactly this kind of access. | Written permission from the Columbus Regional Airport Authority for attributed automated collection. |
| OAK | iflyoak.com publishes its live space counts as a file under /wp-content/uploads/, and its robots.txt disallows that entire directory. The disallow covers exactly the path the data lives at, which is a statement of intent rather than an accident of CMS layout. | An allow-listed user agent, an exception for the parking-data path, or the same figures published outside the disallowed directory. |
| DFW | dfwairport.com publishes checkpoint waits, but its own page reads them from \`<host>/wait-times/checkpoint/DFW\` with an \`Api-Key\` header whose value is compiled into the site bundle. Lifting that key out of the bundle and using it would be helping ourselves to a credential the airport issued to its own front end. The map legend beside it is banded (0-10, 11-20, 20+) and the per-checkpoint figure is labeled a prediction, so even with a key the shape of the value would need checking before anything was published. | An API key issued to FlyerIntel by DFW, or a documented public endpoint for the same figures. |
| LAS | harryreidairport.com serves no robots.txt and bars nothing, but it does not publish the wait times itself: the page embeds a third-party analytics vendor at \`embed.zensors.live/LAS/.../waitTimeExplorer?token=…\`, and the token is a credential carried in the page. Reusing it would be using a key found in a site’s JavaScript, and the vendor host serves an application shell in place of a robots.txt, so its crawling policy cannot be read either. | An airport-hosted endpoint for the same figures, or a token issued to FlyerIntel by Clark County Department of Aviation together with the vendor’s documented terms. |
| SAN | san.org renders both its checkpoint lane waits and its parking through a third-party widget served from \`app.flyfruition.com\`, whose robots.txt is \`User-agent: \* / Disallow: /\` — a blanket refusal covering every path, including the widget the airport embeds. The live values themselves arrive over a WebSocket to \`wss://dev-api.flyfruition.com/\`, a vendor development host, which is not a published interface under any reading. | An endpoint on san.org itself, or the vendor’s permission together with a robots.txt that does not forbid the path. |
| HNL | airports.hawaii.gov shows HNL occupancy only through a third-party vendor widget loaded from rezcommdev.com, and that host refuses robots.txt with HTTP 403. An unreadable policy is not permission, and a vendor development host is not a published interface in any case. | An airport-hosted endpoint, or the vendor's documented terms together with a readable robots.txt. |
| MCO | Orlando publishes checkpoint waits through \`api.goaa.aero\`, which its own bundle calls with an \`Api-Key\` header whose value is compiled into the site JavaScript. That host answers \`User-agent: \* / Disallow: /\` — a blanket refusal covering the endpoint — and returns 401 "Unknown/Invalid API Key!" without the key. Lifting the key out of the bundle would be helping ourselves to a credential the airport issued to its own front end. | An API key issued to FlyerIntel by the Greater Orlando Aviation Authority, together with a robots.txt that does not forbid the path. |
| CVG | Cincinnati serves its wait-time widget from \`api.cvgairport.mobi\` with an \`Api-Key\` header carried in the site bundle. The host returns 401 "Unknown/Invalid API Key!" and its robots.txt is \`User-agent: \* / Disallow: /\`. Nothing on cvgairport.com itself carries the figures — the page renders a placeholder until the keyed call returns. | An API key issued to FlyerIntel by the Kenton County Airport Board, together with a robots.txt that does not forbid the path. |
| CLT | Charlotte’s checkpoint widget calls \`api.cltairport.mobi\` with an \`Api-Key\` header compiled into the site bundle; the host returns 401 "Unknown/Invalid API Key!" and serves \`User-agent: \* / Disallow: /\`. cltairport.com’s own robots.txt allows everything, but the data does not live there. | An API key issued to FlyerIntel by the Charlotte Aviation Department, together with a robots.txt that does not forbid the path. |
| IAH | Houston serves both its airports’ checkpoint waits from \`api.houstonairports.mobi/wait-times/checkpoint/…\` behind an \`Api-Key\` header whose value is compiled into the fly2houston.com bundle. The host returns 401 without it and its robots.txt is \`User-agent: \* / Disallow: /\`. | An API key issued to FlyerIntel by the Houston Airport System, together with a robots.txt that does not forbid the path. |
| HOU | William P. Hobby is served by the same keyed endpoint as IAH — \`api.houstonairports.mobi/wait-times/checkpoint/hou\`, \`Api-Key\` header from the site bundle, 401 without it, and \`User-agent: \* / Disallow: /\` on the API host. | An API key issued to FlyerIntel by the Houston Airport System, together with a robots.txt that does not forbid the path. |
| EWR | newarkairport.com allows everything in robots.txt and publishes real per-terminal, per-lane waits in minutes — but only through \`/api/graphql\`, which answers 403 to FlyerIntel while the rest of the site answers 200. The airport’s own API host, \`api.newarkairport.com\`, returns 401 "Access denied due to missing subscription key", as does the \`avi-prod-mpp-webapp-api.azurewebsites.net\` service behind it. Every route to the data is behind a credential or a block we will not work around. | An Azure API Management subscription key issued to FlyerIntel by the Port Authority of New York and New Jersey, or an unblocked public endpoint. |
| JFK | John F. Kennedy is on the same Port Authority platform as EWR: \`api.jfkairport.com/graphql\` returns 401 "Access denied due to missing subscription key", and the site’s own \`/api/graphql\` returns 403 to FlyerIntel while its pages answer 200. | An Azure API Management subscription key issued to FlyerIntel by the Port Authority of New York and New Jersey, or an unblocked public endpoint. |
| LGA | LaGuardia is on the same Port Authority platform as EWR and JFK: \`api.laguardiaairport.com/graphql\` returns 401 "Access denied due to missing subscription key", and the site’s own \`/api/graphql\` returns 403 to FlyerIntel while its pages answer 200. | An Azure API Management subscription key issued to FlyerIntel by the Port Authority of New York and New Jersey, or an unblocked public endpoint. |
| BOS | massport.com serves its passenger pages behind an Imperva/Incapsula bot challenge: a request for the Logan security page returns a challenge document and an incident id rather than the page. Defeating that would mean breaking an access control the operator deliberately put in place, which FlyerIntel does not do. | An allow-listed user agent or source address from Massport, or an airport-hosted endpoint outside the challenge. |
| MHT | flymanchester.com allows everything in robots.txt, publishes no terms of use, and prints its general and PreCheck waits straight into the page with a full ISO 8601 observation time — everything a source needs except a number. The values are bands ("0-5 min"), and no end of a band is a measurement. Its refresh route is worse rather than better: it is reached through admin-ajax.php with a per-page nonce, which is a credential carried in the page. | A figure in minutes from the airport, or the underlying value the band is derived from. |
| CAE | flycae.com renders its checkpoint widget server-side as a bucket index and a band label (\`data-gc="0"\`, text "0–4"), with no observation time anywhere on the page. Two failures at once: the value is a band that cannot honestly become a number, and a reading that cannot be dated cannot be published as live. Its robots.txt also disallows every URL carrying a query string, which rules out the refresh route. | A figure in minutes with an observation time, published on a path robots.txt permits. |
| PNS | Pensacola publishes no wait times of its own. Its site links out to livetsawaittimes.com, a third party’s crowd-sourced and modeled estimates; republishing those under an airport’s name would present someone else’s model as airport-measured data. | A feed sourced from the airport’s or TSA’s own measurements. |
| SYR | syrairport.org/parking/ server-renders a "Live Parking Status" panel with real counts for four car parks — occupied over capacity, spaces free, and a "Last fetched" stamp — and its robots.txt permits that page (it disallows only /wp-admin/, /wp-includes/, /wp-json/ and query-string REST routes, and the figures are in the page itself rather than behind any of them). The Syracuse Regional Airport Authority's "Website Terms of Use and Privacy Policy" is what stops it, twice over: it bars "any robot, spider or other automatic device, process or means to access the Website for any purpose, including monitoring or copying any of the material on the Website", and separately permits use of the site "for your personal, non-commercial use only". That is the same template already keeping GRR, RNO, GSP and CMH off the site, and it is applied the same way here. | Written permission from the Syracuse Regional Airport Authority for attributed automated collection at a stated polling rate. |
| RDU | rdu.com/parking/ server-renders a percent-full figure for each of the four ParkRDU lots beside an explicit "Current status as of <date>, <time>" and the drive-up rates, and its robots.txt disallows only /wp-content/uploads/ — not the parking page, which is what separates it from the OAK case. There is no robot or automatic-device clause anywhere, so reading the page is not what is refused. Republishing is: the Raleigh-Durham Airport Authority's Legal Information page states under "Restrictions on use" that "You may not modify, copy, reproduce, republish, upload, post, transmit or distribute in any way any material from this website including code and software", with no carve-out for factual or non-commercial use. Putting the figures on an airport page is republishing material from that site, so the terms and the intended use are in direct conflict. | Written permission from the Raleigh-Durham Airport Authority to republish attributed live parking figures at a stated polling rate, or a separately licensed open-data feed. This is a republication question rather than an access one, which should make it an easier ask. |
| MKE | mitchellairport.com's robots.txt bars only concrete5 application internals and permits the parking pages, and there is nothing live behind them: the parking pages carry rates and descriptive text with no counts, no status and no request that would fetch either, and the security pages carry TSA guidance and no waits. What settles it regardless is the airport's "Privacy Policy & Terms" at mitchellairport.com/privacy, which licenses the site "for your personal, noncommercial use only" and continues: "Otherwise, content on this web site may not be copied, reproduced, modified, distributed, transmitted, displayed, published, linked to or broadcast without the prior written permission of Milwaukee Mitchell International Airport." That is the personal-non-commercial license keeping PDX, GRR, RNO, GSP, CMH and SYR off the site, plus the republication bar that is the RDU objection, in one clause. | Written permission from Milwaukee Mitchell International Airport, which the same page invites at info@mitchellairport.com — and, separately, live figures to collect, because today there are none. |

Airports we have decided not to collect from

## How we treat sources

### Official sources first

We prefer machine-readable data published by the operator of the thing being described — the airport, the airline, or the agency that regulates them.

### Attribution on every module

Anything that comes from a source names that source and shows when it was retrieved. Anything FlyerIntel calculated says so.

### Access rules respected

We check robots and terms before building a connector, cache responsibly, identify our collector with a contactable user agent, and never bypass a control.

### Failure is visible, not filled in

A broken connector leaves the previous value in place marked stale, or shows nothing. It never substitutes an estimate, and it never takes down the rest of a page.

[How the numbers are calculated](https://flyerintel.com/methodology/) · [Download the numbers](https://flyerintel.com/data/) · [Report a problem](https://flyerintel.com/corrections/)