# Flight intelligence workspace

The Flight DNA page now opens a visible results workspace. Its six primary tools
appear before the route form, on desktop and phone. Selecting a tool changes the
results pane, updates `intel` in the URL, and focuses the results. Back/Forward
restores the selected tool without discarding loaded history. Route/date/filter
changes invalidate previous results; request tokens prevent late responses from
populating a different query.

| Tool | Visible result | Connection and boundary |
| --- | --- | --- |
| Flight DNA | Official per-leg outcomes, independent historical matches, sample sizes, rates, reporting cutoffs and airport monthly trends | `/api/travel/history` reads installed BTS records. `/api/travel/flight-history` queries independent aggregates. Separate cohorts; no combined connecting-trip reliability rate. |
| Airport pressure | Each airport's FAA notice, runway configuration and evidence | `/api/travel/disruptions`. An omitted airport remains unknown. Restrictions and missing coverage have different presentation. |
| Weather risk | Aviation observations, forecasts and local/regional warnings | `/api/travel/airports/:iata/brief`; NOAA, NWS or ECCC according to coverage. Source time, age and scope stay attached. Expired observations cannot remain current recommendations. |
| Connection survival | Minutes remaining for 0/15/30/60-minute inbound delays | Entered layover minus the user's gate-transfer allowance minus hypothetical delay. Device-local allowance; arithmetic, not an airline minimum connection time or probability. |
| Security & airport | Historical checkpoint query and trainer-specific device memory | `/api/travel/security-history`. Route departure and travel date populate the query. Unsupported airports remain explicitly unverified rather than silently becoming MCO. |
| Alternatives | Historical connecting corridors and optional alternative-arrival sample | Independent history response. An empty sample does not prove no service; schedules, seats and fares need verification. |
| Route & airport map | Reference coordinates and schematic corridor | Existing geographic component. Lines do not establish schedules or actual flight paths. |
| Aircraft nearby | Community position snapshot, source age and observations | `/api/travel/live-aircraft`. Loaded on opening this tool after analysis, with explicit refresh and no background polling. Positions cannot confirm flight status or bookings. |

`FlightRadar.tsx` owns the shared route and selected view. `FlightToolkit.tsx`
projects returned facts into navigation cards. `FlightDnaPanel.tsx` stays mounted
as views change, so history requests complete independently of the selected tool.
History, alternatives and connection views share data without duplicating
requests or mixing their meanings. Aircraft observations no longer sit between
the toolkit and detailed history.

`FlightHistoryData.ts` validates both history response contracts before metrics
or evidence are rendered. An incomplete response from an older API build
produces a source-specific error with no assigned rate, rather than crashing the
travel page. Retrying historical analysis checks both sources again. Either
source can remain useful while the other is unavailable.

The old photo carousel, duplicate summary/map block and global deep-research
disclosure were removed. The optional combined decision brief remains below the
selected tool. Source records and limitations stay with the results they support.

## Verification boundaries

Browser coverage includes visible default history, tool destinations, keyboard
activation and focus, URL Back/Forward, shared layover calculations, route
invalidation, source failure, incompatible responses and retry, unsupported
security airports, Canadian weather, official BTS results, expiry of station/FAA
evidence, and on-demand aircraft observations. Responsive checks measure actual
evidence panels at phone, landscape and laptop widths.

A live independent-source check on 2026-11-11 returned all four datasets and a
compatible response: MCO–ATL matched 27,428 historical flights through August
2026 and eight historically documented connecting corridors. This does not
establish current airline service, every airport's coverage or continued provider
uptime. Hosted Replit secrets, production BTS imports and the published runtime
must still be verified on Replit. This change does not publish the application.
