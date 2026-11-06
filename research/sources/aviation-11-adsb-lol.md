Source: https://api.adsb.lol/
Title: adsb.lol API
Fetched: 2026-11-06T07:24:58.725Z

# adsb.lol API  ```  0.0.2  ```    ``` OAS 3.1 ```

[/api/openapi.json](https://api.adsb.lol/api/openapi.json)

The adsb.lol API is a free and open source
API for the [adsb.lol](https://adsb.lol/) project.

## Usage

You can use the API by sending a GET request
to the endpoint you want to use.
The API will return a JSON response.

## Feeders

By sending data to adsb.lol, you get access to the
[direct readsb re-api](https://www.adsb.lol/docs/feeders-only/re-api/)
and
[our raw aggregated data](https://www.adsb.lol/docs/feeders-only/beast-mlat-out/). :)

## Terms of Service

You can use the API for free.

In the future, you will require an API key
which you can get by feeding to adsb.lol.

If you want to use the API for production purposes,
please contact me so I do not break your application by accident.

## License

The license for the API as well as all data ADSB.lol
makes public is [ODbL](https://opendatacommons.org/licenses/odbl/summary/).

This is the same license
[OpenStreetMap](https://www.openstreetmap.org/copyright) uses.

[Open Data Commons Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/1-0/)

### [v2](https://api.adsb.lol/docs\#/v2)

GET
[/v2/pia](https://api.adsb.lol/docs#/v2/v2_pia_v2_pia_get)

Aircrafts with PIA addresses (Privacy ICAO Address)

GET
[/v2/mil](https://api.adsb.lol/docs#/v2/v2_mil_v2_mil_get)

Military registered aircrafts

GET
[/v2/ladd](https://api.adsb.lol/docs#/v2/v2_ladd_v2_ladd_get)

Aircrafts on LADD (Limiting Aircraft Data Displayed)

GET
[/v2/sqk/{squawk}](https://api.adsb.lol/docs#/v2/v2_squawk_filter_v2_sqk__squawk__get)

Aircrafts with specific squawk (1200, 7700, etc.)

GET
[/v2/squawk/{squawk}](https://api.adsb.lol/docs#/v2/v2_squawk_filter_v2_squawk__squawk__get)

Aircrafts with specific squawk (1200, 7700, etc.)

GET
[/v2/type/{aircraft\_type}](https://api.adsb.lol/docs#/v2/v2_type_filter_v2_type__aircraft_type__get)

Aircrafts of specific type (A320, B738)

GET
[/v2/reg/{registration}](https://api.adsb.lol/docs#/v2/v2_reg_filter_v2_reg__registration__get)

Aircrafts with specific registration (G-KELS)

GET
[/v2/registration/{registration}](https://api.adsb.lol/docs#/v2/v2_reg_filter_v2_registration__registration__get)

Aircrafts with specific registration (G-KELS)

GET
[/v2/icao/{icao\_hex}](https://api.adsb.lol/docs#/v2/v2_hex_filter_v2_icao__icao_hex__get)

Aircrafts with specific transponder hex code (4CA87C)

GET
[/v2/hex/{icao\_hex}](https://api.adsb.lol/docs#/v2/v2_hex_filter_v2_hex__icao_hex__get)

Aircrafts with specific transponder hex code (4CA87C)

GET
[/v2/callsign/{callsign}](https://api.adsb.lol/docs#/v2/v2_callsign_filter_v2_callsign__callsign__get)

Aircrafts with specific callsign (JBU1942)

GET
[/v2/lat/{lat}/lon/{lon}/dist/{radius}](https://api.adsb.lol/docs#/v2/v2_point_v2_lat__lat__lon__lon__dist__radius__get)

Aircrafts surrounding a point (lat, lon) up to 250nm

GET
[/v2/point/{lat}/{lon}/{radius}](https://api.adsb.lol/docs#/v2/v2_point_v2_point__lat___lon___radius__get)

Aircrafts surrounding a point (lat, lon) up to 250nm

GET
[/v2/closest/{lat}/{lon}/{radius}](https://api.adsb.lol/docs#/v2/v2_closest_v2_closest__lat___lon___radius__get)

Single aircraft closest to a point (lat, lon)

### [v0](https://api.adsb.lol/docs\#/v0)

GET
[/api/0/airport/{icao}](https://api.adsb.lol/docs#/v0/api_airport_api_0_airport__icao__get)

Airports by ICAO

POST
[/api/0/routeset](https://api.adsb.lol/docs#/v0/api_routeset_api_0_routeset_post)

Api Routeset

GET
[/0/me](https://api.adsb.lol/docs#/v0/api_me_0_me_get)

Information about your receiver and global stats

GET
[/0/my](https://api.adsb.lol/docs#/v0/api_my_0_my_get)

My Map redirect based on IP

#### Schemas

**HTTPValidationError**
Expand all **object**

**PlaneInstance**
Expand all **object**

**PlaneList**
Expand all **object**

**V2Response\_AcItem**
Expand all **object**

**V2Response\_LastPosition**
Expand all **object**

**V2Response\_Model**
Expand all **object**

**ValidationError**
Expand all **object**