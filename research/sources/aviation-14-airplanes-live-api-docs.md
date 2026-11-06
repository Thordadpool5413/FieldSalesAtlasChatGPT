Source: https://airplanes.live/api-docs
Title: API Documentation | Airplanes.live
Fetched: 2026-11-06T07:26:02.872Z

#### Airplanes.live API

[Overview](https://airplanes.live/api-docs/#/)

Endpoints

Feed

[Get feeder status\\
\\
get](https://airplanes.live/api-docs/#/paths/feed-status/get)

Reference

[Search or list airports.\\
\\
get](https://airplanes.live/api-docs/#/paths/rest-v1-ref-airports/get) [Search or list airlines.\\
\\
get](https://airplanes.live/api-docs/#/paths/rest-v1-ref-airlines/get) [Search or list countries.\\
\\
get](https://airplanes.live/api-docs/#/paths/rest-v1-ref-countries/get) [Search or list cities.\\
\\
get](https://airplanes.live/api-docs/#/paths/rest-v1-ref-cities/get) [List timezones.\\
\\
get](https://airplanes.live/api-docs/#/paths/rest-v1-ref-timezones/get)

Live

[Single aircraft position by registration.\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-reg-reg/get) [Single aircraft position by Mode S code (hex/ICAO).\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-hex-hex/get) [Live aircraft position by Mode S code\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-hex-hex--live/get) [Last known position by Mode S code\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-hex-hex--last/get) [Aircraft by callsign.\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-callsign-callsign/get) [Aircraft by squawk (Mode A) code.\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-squawk-squawk/get) [Tagged military aircraft.\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-mil/get) [Aircraft within a radius (nautical miles) of a point.\\
\\
get](https://airplanes.live/api-docs/#/paths/v2-point-lat---lon---radius/get)

Schemas

[Error](https://airplanes.live/api-docs/#/schemas/Error) [BeastClient](https://airplanes.live/api-docs/#/schemas/BeastClient) [MlatClient](https://airplanes.live/api-docs/#/schemas/MlatClient) [FeedStatus](https://airplanes.live/api-docs/#/schemas/FeedStatus) [Feed](https://airplanes.live/api-docs/#/schemas/Feed) [Airport](https://airplanes.live/api-docs/#/schemas/Airport) [Airline](https://airplanes.live/api-docs/#/schemas/Airline) [Country](https://airplanes.live/api-docs/#/schemas/Country) [City](https://airplanes.live/api-docs/#/schemas/City) [Timezone](https://airplanes.live/api-docs/#/schemas/Timezone) [AirportList](https://airplanes.live/api-docs/#/schemas/AirportList) [AirlineList](https://airplanes.live/api-docs/#/schemas/AirlineList) [CountryList](https://airplanes.live/api-docs/#/schemas/CountryList) [CityList](https://airplanes.live/api-docs/#/schemas/CityList) [TimezoneList](https://airplanes.live/api-docs/#/schemas/TimezoneList) [Aircraft](https://airplanes.live/api-docs/#/schemas/Aircraft) [V2Response](https://airplanes.live/api-docs/#/schemas/V2Response)

[powered by **Stoplight**](https://stoplight.io/?utm_source=elements&utm_medium=Airplanes.live%20API&utm_campaign=powered_by&utm_content=/)

# Airplanes.live API

Export

v2.0.0

API Base URL

Production server:https://api.airplanes.live

Additional Information

[Apache-2.0](https://spdx.org/licenses/Apache-2.0.html)

Feed and statistics API for airplanes.live, plus aviation reference data (airports, airlines, countries, cities and timezones).