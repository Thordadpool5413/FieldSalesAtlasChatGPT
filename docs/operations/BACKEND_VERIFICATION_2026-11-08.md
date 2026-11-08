# Backend verification — 2026-11-08

Scope: the revised backend in an isolated cloud verification data directory.
These results do not establish the configuration of the user's Replit deployment.
No published application was changed by this verification.

## Confirmed defects corrected

- The map and planner share one versioned airport reference, including migration
  of the old map snapshot with its original age. A failed refresh remains stale
  on repeated reads instead of becoming fresh through the memory cache.
- Legacy weather routes share station identity, source timestamp, cache failure
  and validity checks with journey analysis. Wrong-station and stale METARs do
  not become usable observations. Undated empty alert collections remain unknown;
  published empty collections retain their actual publication time and limits.
- Complete TAFs and forecast text are retained. Source-sized limits reject an
  oversized report instead of silently dropping forecast groups. Legacy NWS
  periods retain their original timezone offsets for local-date comparisons.
- FAA arrays retain their individual notices; airport omission remains unknown.
- Flight DNA displays source evidence and ages, and stops counting expired
  observations when time passes. Desktop and mobile expiration behavior passed.
- Source diagnostics paginate and select the latest check per provider/subject,
  rather than silently omitting records after the first 100 or showing duplicates.
- BTS alternate-name failures are recorded as prior attempts, not an active
  error after success. Installed, row-count-validated months are reused.
- Daily work uses durable completion records, leases and startup catch-up rather
  than requiring the process to be awake at exactly 06:00 Eastern. External
  maintenance access requires a separate bearer token of at least 32 characters.
- SQLite online backups include committed WAL records, integrity checks,
  checksums and a safe temporary-directory restore drill. Tampering is rejected.
- Web and API identities are separate JSON endpoints. Active route/access
  inventory is available at `/api/openapi.json`; it is not represented as a
  complete business payload schema.

## Live data checks

At **2026-11-08 21:49 UTC**, using official sources; the supplementary archive checks were repeated later in the same session:

| Connection | Result | Limits |
| --- | --- | --- |
| OurAirports | 9,053 validated IATA reference records, fresh version | Reference records include airports without scheduled service; listings do not establish flights or availability. |
| MCO METAR and TAF | Current, matching station | Airport weather does not confirm airline status. |
| MCO NWS point forecast and alerts | Current source timestamps | Empty alerts describe this point at publication time, not future or wider-area conditions. |
| MCO FAA NAS | Partial: airport omitted | Its operational status remains unknown. |
| YYZ METAR and TAF | Current, matching station | The complete TAF was 356 characters; the former 240-character truncation is removed. |
| YYZ ECCC observations, city forecast and warnings | Current source timestamps | Regional products; city-page periods do not supply exact validity bounds. |
| Official BTS August 2026 | 608,389 rows imported; SHA-256 below | U.S. reporting-carrier domestic history only; not live status or a prediction. |
| BTS repeat sync | Validated existing month reused without re-download | New months still depend on official publication and access. |
| OSRM Florida graph | Real MCO → downtown Orlando route: **25 estimated driving minutes** | Cloud-local graph only; no traffic, closures or border queues. |
| Routing outside Florida | Route unavailable (`null`), partial coverage evidence | No geographic substitute for an out-of-region transfer. |
| Flyerintel datasets | All four datasets validated: 64 airport, 314 route, 2,791 flight-number and 2,432 monthly aggregates | Independent historical aggregates covering through August 2026, not live airline data. |
| Open checkpoint archive | Partial MCO sample: three historical queue groups; PreCheck request timed out | Partial samples remain flagged; posted historical estimates do not measure current queues. |
| Application + BTS backup | Both copied consistently and restore-verified | Local drill; off-host retrieval and real deployment restoration remain to be verified. |

BTS source:
`https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_2026_8.zip`

BTS SHA-256:
`203509350f574f81728ca51175a17360d0413aa990512f8e0c8f1342f5baf23a`

Routing source:
`https://download.geofabrik.de/north-america/us/florida-latest.osm.pbf`

Routing merged extract SHA-256:
`8b3d3b4770d815c677fbcc026dfe2b3cc9252b785198a82051bf32330cca8b5c`

Routing source Last-Modified: `Sun, 08 Nov 2026 03:36:15 GMT`.
The graph was installed and probed at 21:48–21:49 UTC. This was a temporary
cloud-local service, not a publicly hosted Replit routing endpoint. Routing data
and BTS database files are not committed to Git.

## Automated verification

- Full unit/API suite: **59 passed**.
- Nine targeted backend regressions passed again after final validation changes.
- Browser suite: **54 passed, one intentionally skipped**; the additional Flight DNA
  evidence-expiration test passed on both desktop and mobile (**two more checks**).
- Runtime/backup suite: **three passed**, including bearer rejection, served build
  identities, route inventory, startup/shutdown, persistence, WAL backup and tamper rejection.
- BTS sync regression suite: **two passed**.
- API integration smoke and production build/type checking passed.

## Still required on the actual deployment

1. A persistent routing host/graph or maintained HTTPS endpoint, followed by a
   successful route probe from Replit. The cloud loopback service cannot serve
   Replit's separate machine.
2. A verified persistent database volume and appropriate single-instance hosting,
   plus separately protected backup storage and an off-host recovery drill.
3. Host and GitHub maintenance secrets if using the optional scheduled workflow.
   The workflow stays disabled until its repository variable and secrets are configured; source timers cannot wake a sleeping host.
4. Explicitly opt into large BTS refreshes with `ATLAS_BTS_AUTO_SYNC=1` if wanted.
5. A suitable authorized airline/flight-status provider. No booking or live flight
   status provider is configured; confirmation numbers remain traveler-supplied.

Follow [the deployment and recovery guide](BACKEND_RELIABILITY.md). No deployment
or airline access is marked verified merely because code or a configuration flag exists.
