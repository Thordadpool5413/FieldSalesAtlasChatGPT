# Research Notes: Free Data Sources for Field Sales Atlas

**Status:** complete
**Depth:** Standard

## Plan

- **Question:** Which additional free or public APIs and datasets can materially improve Field Sales Atlas territory and travel intelligence?
- **Scope:** Review current app sources, identify authoritative additions for territory sizing, local prospecting, travel operations, and selected verticals; compare licensing, cost, coverage, cadence, and operational fit. Exclude paid flight inventory and sources without workable commercial terms.
- **Audience:** Field Sales Atlas product owner and engineering team.
- **Deliverable:** Evidence-backed report with a ranked integration plan, limitations, source links, and recommendations for safe data freshness and provenance.

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Current API and data coverage | complete | 6 |
| 2 | Census and economic territory intelligence | complete | 9 |
| 3 | Open places and local prospecting data | complete | 6 |
| 4 | Ground travel, weather, and aviation operations | complete | 8 |
| 5 | Industry-specific public data and integration priorities | complete | 3 |

## Coverage Checklist

- [x] What public sources are already wired into the app, and what are their stated gaps?
- [x] Which authoritative data can improve territory sizing and business-density estimates?
- [x] Which open POI datasets can help identify relevant local prospects, with usable licensing?
- [x] What free sources can improve travel context without implying live traffic or flight status?
- [x] Which datasets are genuinely free for commercial use versus merely free for personal/research use?
- [x] Which sources should be integrated first, and what refresh, provenance, and confidence rules are needed?

## Findings Log

_[@key] markers reference sources in research/sources.json; they become numbered citations in the final report._

### Current API and data coverage

Repository audit: adapters exist for FAA airport-wide notices, NOAA aviation observations/forecasts, NWS U.S. alerts/point forecasts, an ECCC surface-observation candidate, Census Gazetteer/geocoding, OurAirports reference data, a manual BTS monthly import, and optional OSRM road matrices. A third-party FlyerIntel historical BTS aggregate and a Hugging Face airport-wait archive are also called by backend code. The app correctly labels these as historical or airport-wide evidence, not flight-specific live status, airfare inventory, or verified live traffic. The source check dated 2026-11-06 reports current outbound requests to FAA/NOAA/NWS/ECCC, BTS downloads, and routing setup unavailable because of an outbound 403; the OurAirports reference refresh succeeded. The HF dataset is a third-party archive/scrape of airport-published estimates and CBP data, with variable source freshness and gaps. [@current-flyerintel] [@current-hf-airport-wait] [@bts-on-time] [@faa-nas] [@nws-api] [@cbp-airport-wait-times]

### Census and economic territory intelligence

ACS 5-year estimates add demographic, housing, and economic context; CBP/ZBP add establishment counts, employment, and payroll by NAICS and geography. These are aggregate market-sizing inputs, not named prospects. As of 2026-11-06, Census lists 2023 as the latest CBP reference year, with no planned 2024 release date. Census API access is free; an API key is required above 500 daily requests per IP, and for an app that exceeds 500 calls/day even when traffic comes from many users. An earlier subagent summary incorrectly described keys as universally required; the official 2026 guide and training transcript resolve that conflict. [@census-acs-api] [@census-cbp-api] [@census-cbp-release] [@census-api-guide] [@census-api-training]

Statistics Canada's Canadian Business Counts offer more current biannual aggregate counts by industry, employment size, province/territory, CMA, and CSD; December 2025 counts were released in February 2026. The general Web Data Service exists, but a dedicated Business Counts API route was not confirmed, so the first implementation assumption should be an official published table/bulk file, not an unverified API. Statistics Canada's open licence permits commercial reuse with attribution. [@statcan-business-counts] [@statcan-business-products] [@statcan-wds] [@statcan-open-license]

### Open places and local prospecting data

Overture Places is the best global POI candidate found for bulk prospect-density context; it is a static/monthly dataset, not live verification, and its attribution page lists different licenses and source obligations across contributors. Preserve source lineage and attribution at record/layer level rather than treating it as a single undifferentiated feed. [@overture-places] [@overture-attribution]

OSM data can be commercially used under ODbL with attribution and possible share-alike duties for a derived database; that does not grant unlimited access to community-hosted Overpass or tile servers. Prefer regional extracts or an operated/licensed service for production. Municipal business-licence datasets can provide richer local presence signals, but Vancouver is only one example: coverage, addresses, update frequency, privacy fields, and commercial terms vary and need review city by city. [@osm-attribution] [@osm-license-faq] [@overpass-api] [@vancouver-business-licenses]

None of these POI sources certifies an active buying prospect. Treat them as candidates to review, reconcile duplicates/closed locations, and score against a confirmed sales vertical.

### Ground travel, weather, and aviation operations

NWS is already in the app and remains the strongest free U.S. weather/alerts source; requests require an identifying User-Agent and should respect the service's operational guidance. A NWS point forecast or airport observation does not establish road conditions. Open-Meteo's free API is non-commercial, so it should not be added to a commercial product on that tier. [@nws-api] [@open-meteo-terms]

For road risk, regional 511 feeds can add closures/incidents where a target territory overlaps. 511 SF Bay requires a token, documents a 60 requests/hour default, and is regional; its data agreement/commercial reuse status must be confirmed. This is a regional pilot candidate, not a national API recommendation. Existing OSRM routing is optional and has no live traffic; self-hosted/maintained routing is safer than relying on a public demo. [@511-sf-bay] [@osrm-policy]

For aviation, use the app's existing historical BTS-derived data for baseline delay/cancellation context, not a current departure confirmation. The independent wait archive is a recent, 30-airport CC BY 4.0 dataset of airport-published estimates, polled roughly each minute but with airport-dependent update cadence and gaps. Official CBP airport wait-time statistics add historical passport-control outcomes; an automated API or reuse route was not confirmed. OpenSky's terms do not support a for-profit live product without written approval, so it is not a safe free-flight-status dependency. [@bts-on-time] [@current-flyerintel] [@current-hf-airport-wait] [@cbp-airport-wait-times] [@opensky-terms] [@faa-nas]

### Industry-specific public data and integration priorities

Industry-specific feeds are conditional, not universal: USDA NASS Quick Stats may help an agriculture sales team with regional commodity/activity context; EPA ECHO may help environmental/regulated-industry prospecting; and the Statistics Canada healthcare-facility dataset reviewed is based on 2019–2020 source data and is too stale to use as a current facility directory without replacement/validation. NASS API keys, row limits, disclaimer obligations, EPA terms/cadence, and direct commercial reuse should be checked before production use. [@usda-nass] [@epa-echo] [@statcan-odhf]

The most useful intelligence layer may be the app's own first-party visit outcomes: outcomes, next-step completion, timing, territory coverage, and conversion by geography/vertical. This avoids treating public counts as lead intent and can turn future sales experience into a product-specific signal; access should remain scoped by workspace and use clear provenance.

## Conflicts & Open Questions

- Free-access terms can differ from commercial-use rights, especially for hosted community APIs and map/POI services.
- A free source may be a bulk download rather than an operational API; assess update cadence and hosting burden separately.
- Census keys are not universally required: free no-key usage is allowed up to the documented query limit, but an application exceeding 500 calls/day requires a key. Avoid repeating the earlier incorrect "key required" summary.
- StatCan has a general WDS API, but the exact Canadian Business Counts table/API linkage was not established; treat this as a bulk-data candidate until verified.
- Overture Places uses multiple upstream licenses/attributions; do not make a blanket license claim based on one contributor.
- A 511 developer portal may provide free regional access while commercial reuse rights remain subject to a separate agreement; do not equate "free token" with unrestricted commercial use.
- User's market vertical, operating regions, and expected request volume are unknown.

## Cross-check and Deliverable

The final report was checked against saved source pages for Census API limits, CBP release status, Canadian Business Counts cadence, Overture cadence/licensing, 511 limits, Open-Meteo terms, OpenSky restrictions, the airport-wait archive, and official CBP historical wait-time semantics. The report is `research/free-data-intelligence.md`; the source registry is `research/sources.json` with 28 sources.

## Gaps

- The target sales vertical is not specified; vertical-specific sources will be recommended conditionally rather than treated as universal.
- Exact usage volume and geographic footprint are unknown; free-tier fit will be framed with conservative operational caveats.
- No national, commercially safe, free live flight-specific status feed was verified; existing data is airport-wide, historical, or airport-published estimates.
