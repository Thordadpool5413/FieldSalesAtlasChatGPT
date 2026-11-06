# Bundled airport coordinates

`src/airport-reference.json` supplements the existing 102 U.S. starter airports with coordinates and ICAO identifiers from the public OurAirports dataset. It is a fallback reference, not a current flight schedule or availability feed.

- Source: https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
- Retrieved: 2026-11-05
- Source CSV SHA-256: `55bd82106c8ac1c9559cf5879ae9b69eb9c6e748df01514632dd5fbbb9e8b474`
- Match: existing starter IATA code, `iso_country=US`, `scheduled_service=yes`. All 102 starter codes matched.
- Retained fields: `latitude_deg`, `longitude_deg`, and `gps_code` (or `ident`).
- Public-domain source documentation: https://ourairports.com/data/

The original export omitted U.S. airport coordinates. Without the live directory, geographic ranking therefore excluded all U.S. starter airports. This snapshot keeps the same limited starter list useful during provider outages; the UI continues to label it as a limited reference. Refresh from the same source and criteria, validate coordinate ranges and unique IATA codes, and update this provenance when changing the snapshot.
