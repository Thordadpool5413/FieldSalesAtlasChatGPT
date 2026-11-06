Source: https://www.weather.gov/documentation/services-web-api
Title: API Web Service
Fetched: 2026-11-06T05:53:01.278Z

- [HOME](https://www.weather.gov/documentation/services-web-api#)

- [FORECAST](https://www.weather.gov/forecastmaps/)



  - [Local](https://www.weather.gov/)
  - [Graphical](https://digital.weather.gov/)
  - [Aviation](https://aviationweather.gov/)
  - [Marine](https://www.weather.gov/marine/)
  - [Rivers and Lakes](https://water.noaa.gov/)
  - [Hurricanes](https://www.nhc.noaa.gov/)
  - [Severe Weather](https://www.spc.noaa.gov/)
  - [Fire Weather](https://www.weather.gov/fire/)
  - [Sunrise/Sunset](https://gml.noaa.gov/grad/solcalc/)
  - [Long Range Forecasts](https://www.cpc.ncep.noaa.gov/)
  - [Climate Prediction](https://www.cpc.ncep.noaa.gov/)
  - [Space Weather](https://www.swpc.noaa.gov/)

- [PAST WEATHER](https://www.weather.gov/wrh/climate)



  - [Past Weather](https://www.weather.gov/wrh/climate)
  - [Astronomical Data](https://gml.noaa.gov/grad/solcalc/)
  - [Certified Weather Data](https://www.climate.gov/maps-data/dataset/past-weather-zip-code-data-table)

- [SAFETY](https://www.weather.gov/safety/)

- [INFORMATION](https://www.weather.gov/informationcenter)



  - [Wireless Emergency Alerts](https://www.weather.gov/wrn/wea)
  - [Weather-Ready Nation](https://www.weather.gov/wrn/)
  - [Brochures](https://www.weather.gov/owlie/publication_brochures)
  - [Cooperative Observers](https://www.weather.gov/coop/)
  - [Daily Briefing](https://www.weather.gov/briefing/)
  - [Damage/Fatality/Injury Statistics](https://www.weather.gov/hazstat)
  - [Forecast Models](http://mag.ncep.noaa.gov/)
  - [GIS Data Portal](https://www.weather.gov/gis/)
  - [NOAA Weather Radio](https://www.weather.gov/nwr)
  - [Publications](https://www.weather.gov/publications/)
  - [SKYWARN Storm Spotters](https://www.weather.gov/skywarn/)
  - [StormReady](https://www.weather.gov/stormready)
  - [TsunamiReady](https://www.weather.gov/tsunamiready/)
  - [Service Change Notices](https://www.weather.gov/notification/)

- [EDUCATION](https://www.weather.gov/education/)

- [NEWS](https://www.weather.gov/news)

- [SEARCH](https://www.weather.gov/search/)



  - Search For

    NWSAll NOAA


- [ABOUT](https://www.weather.gov/about/)



  - [About NWS](https://www.weather.gov/about/)
  - [Organization](https://www.weather.gov/organization)
  - [For NWS Employees](https://sites.google.com/a/noaa.gov/nws-insider/)
  - [National Centers](https://www.weather.gov/ncep/)
  - [Careers](https://www.noaa.gov/nws-careers)
  - [Contact Us](https://www.weather.gov/contact)
  - [Glossary](https://forecast.weather.gov/glossary.php)
  - [Social Media](https://www.weather.gov/socialmedia)
  - [NWS Transformation](https://www.noaa.gov/NWStransformation)

Local forecast by

"City, St" or ZIP code

Sorry, the location you searched for was not found. Please try another search.

Multiple locations were found. Please select one of the following:

Location Help

![](https://www.weather.gov/bundles/templating/images/top_news/important.png)

# Hazardous Weather Impacts on the East and West Coasts

A cold front will continue to progress eastward today and Friday across the Eastern Seaboard with showers and thunderstorms bringing isolated heavy rainfall, gusty to damaging winds, and a possible tornado. A series of Pacific storms will begin to push into the Pacific Northwest today with impacts from heavy rain and snow continuing through the middle of next week.
[Read More >](http://www.wpc.ncep.noaa.gov/discussions/hpcdiscussions.php?disc=pmdspd)

Documentation

National Headquarters

# API Web Service

[Weather.gov](https://www.weather.gov/)
\> [Documentation](https://www.weather.gov/documentation)
\> API Web Service


- [Services](https://www.weather.gov/documentation/services-web-api)



  - [API Web Service](https://www.weather.gov/documentation/services-web-api)
  - [Alerts Web Service](https://www.weather.gov/documentation/services-web-alerts)

- [Technical Bulletins](https://www.weather.gov/documentation/tb)


Overview

Examples

Updates

Specification

## Overview

The National Weather Service (NWS) API allows developers access to critical forecasts, alerts, and observations, along with other weather data. The API was designed with a cache-friendly approach that expires content based upon the information life cycle. The API is based upon of [JSON-LD](http://json-ld.org/) to promote machine data discovery.

The API is located at: [https://api.weather.gov](https://api.weather.gov/)

Operational issues should be reported to [nco.ops@noaa.gov](mailto:nco.ops@noaa.gov).

General use questions can be asked on [the API github site](https://weather-gov.github.io/api/).

### Pricing

All of the information presented via the API is intended to be open data, free to use for any purpose. As a public service of the United States Government, we do not charge any fees for the usage of this service, although there are reasonable rate limits in place to prevent abuse and help ensure that everyone has access. The rate limit is not public information, but allows a generous amount for typical use. If the rate limit is execeed a request will return with an error, and may be retried after the limit clears (typically within 5 seconds). Proxies are more likely to reach the limit, whereas requests directly from clients are not likely.

### Content Negotiation

The new API will use headers to modify the version and format of the response. Every request, either by browser or application, sends header information every time you visit any website. For example, a commonly used header called "UserAgent" tells a website what type of device you are using so it can tailor the best experience for you. No private information is shared in a header, and this is a standard practice for all government and private sites. Developers can override these headers for specific purposes (see the "API Specifications" tab for more information). You can get full details by visiting the header field definitions page at the [World Wide Web Consortium](https://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html) site.

- Authentication
- Format the response
- Request new features

### Authentication

A User Agent is required to identify your application. This string can be anything, and the more unique to your application the less likely it will be affected by a security event. If you include contact information (website or email), we can contact you if your string is associated to a security event. This will be replaced with an API key in the future.

```
User-Agent: (myweatherapp.com, contact@myweatherapp.com)
```

### Formats

Endpoints typically have a GeoJSON default format, given the inclusion of geometry data. See the Specification tab for details on each endpoint. Below are common formats available by the API.

- **GeoJSON:** application/geo+json
- **JSON-LD:** application/ld+json
- **DWML:** application/vnd.noaa.dwml+xml
- **OXML:** application/vnd.noaa.obs+xml
- **CAP:** application/cap+xml
- **ATOM:** application/atom+xml

```
Accept: application/cap+xml
```

### Features

The API will use feature flags to make new features available to consumers. The available feature flags will be noted on the "Updates" and "Specification" tabs on this page. The feature flag will be communicated through a Service Change Notice (SCN) allowing developers a period to adopt the flag if the change impacts their applications. Once the adoption window expires, the feature will be made default. Developers can then remove the flag at their convenience.

```
Feature-Flags: forecast_temperature_qv
```

### Outage Information

Information on outages is generally [communicated through Administrative messages sent by National Center of Environmental Prediction's (NCEP's) Senior Duty Meteorologist (SDM)](https://www.nco.ncep.noaa.gov/status/messages/). These are sent via WMO id NOUS42 KWNO and product identifier ADASDM.

## Questions & Examples

The API uses linked data to allow applications to discover content. Similar to a web site that provides HTML links to help users navigate to each page, linked data helps applications navigate to each endpoint. You may also review the OPEN API specification on the "Specification" tab on this page, or directly using the specification endpoint (that is also used to create the tab presentation): [https://api.weather.gov/openapi.json](https://api.weather.gov/openapi.json).

### How do I get the point forecast?

Forecasts are created at each [NWS Weather Forecast Office (WFO)](https://www.weather.gov/srh/nwsoffices) on their own grid definition, at a resolution of about 2.5km x 2.5km. The API endpoint for the 12h forecast periods at a specific grid location is formatted as:

```
	https://api.weather.gov/gridpoints/{office}/{gridX},{gridY}/forecast
```

For example: https://api.weather.gov/gridpoints/TOP/31,80/forecast

To obtain the grid forecast for a point location, use the /points endpoint to retrieve the current grid forecast endpoint by coordinates:

```
	https://api.weather.gov/points/{latitude},{longitude}
```

For example: https://api.weather.gov/points/39.7456,-97.0892

This will provide the grid forecast endpoints for three format options in these properties:

- forecast \- forecast for 12h periods over the next seven days
- forecastHourly \- forecast for hourly periods over the next seven days
- forecastGridData \- raw forecast data over the next seven days

Note: at this time coastal marine grid forecasts are only available from the forecastGridData property.

Applications may cache the grid for a location to improve latency and reduce the additional lookup request; however, it is important to note that while it generally does not occur often, the gridX and gridY values (and even the office) for a given coordinate may occasionally change. For this reason, it is necessary to check back to the /points endpoint periodically for the latest office/grid mapping.

The /points endpoint also contains information about the issuing office, observation stations, and zones for a given point location.

### How do I get the point forecast as DWML?

The forecast can be formatted as DWML for the /forecast and /forecast/hourly endpoints. There is no DWML specification for point lookups, so you first need to use the JSON-only /point endpoint described in the previous question to convert the location to a grid. Once you know the full gridpoint url for the forecast or hourly forecast, you can set the Accept header described in the overview to request the DWML format.

- application/vnd.noaa.dwml+xml

For example: https://api.weather.gov/gridpoints/TOP/31,80/forecast

### How do I get alerts?

The API has a robust selection of filters for alerts. A common request is all active alerts for a state:

```
	https://api.weather.gov/alerts/active?area={state}
```

For example: https://api.weather.gov/alerts/active?area=KS

The /alerts/active endpoint redirects internally to the root /alerts endpoint with the "active=true" parameter. Please review the "Specification" tab above for all the filter options. For important details about filtered alerts requests according to county or zone UGC, please review our [Alerts Geolocation Guide](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf).

For additional details on the format of an alert's content, please see the [CAP documentation](https://vlab.noaa.gov/web/nws-common-alerting-protocol/cap-documentation).

The /alerts endpoint contains alerts issued over the past seven days. For an official archive of NWS CAP alerts, please reach out to the [National Centers for Environmental Information (NCEI)](https://www.ncei.noaa.gov/).

Note: The `/alerts` and `/alerts/active` endpoints _do NOT_ contain [SPC's SEL product](https://api.weather.gov/products/types/SEL) language for Tornado Watches. Tornado Watch alerts are derived directly from the [local WFO's WCN product](https://api.weather.gov/products/types/WCN).

### How do I get current weather station observations?

Observations are recorded at specific weather stations. To retrieve observations, you need the station ID (e.g., KTOP).

You can find the observation stations for a given area using the /points endpoint. The response will include an `observationStations` property with a URL to a list of nearby stations:

```
	https://api.weather.gov/points/{latitude},{longitude}
```

The observationStations endpoint is sorted by distance from the WFO forecast gridpoint, closest to farthest. Data quality can vary by provider. Most stations are not maintained by the NWS, except the ASOS stations. Once you have a specific station ID, you can retrieve its recent observations using the /stations endpoint:

```
	https://api.weather.gov/stations/{stationId}/observations
```

For example: https://api.weather.gov/stations/KTOP/observations

To retrieve only the single most recent observation for a station, append `/latest` to the request:

```
	https://api.weather.gov/stations/{stationId}/observations/latest
```

For example: https://api.weather.gov/stations/KTOP/observations/latest

Note: since this service is designed for realtime data, only 7 days of observations are retained for weather stations.

### Can I retrieve radar display data?

No. The radar endpoints in api.weather.gov are used for radar status data and do not contain the radar data used for display. For radar display data, consider these options:

- [RIDGE2 NWS Radar Display](https://radar.weather.gov/)
- [RIDGE2 NWS Radar Data as OGC Web Services](https://opengeo.ncep.noaa.gov/)
- [Other NWS OGC Web Services](https://www.weather.gov/gis/cloudgiswebservices)
- [MRMS Data](https://mrms.ncep.noaa.gov/)
- [NODD MRMS Archive Data](https://registry.opendata.aws/noaa-mrms-pds)

## Updates

The information on this page is updated regularly. All official NWS Service Change Notices, including an email subscription option, can be found at [weather.gov/notification](https://www.weather.gov/notification).

### Feature Flags

Feature flags are endpoint specific. See Specification tab for details.

#### /gridpoints/{wfo}/{x},{y}/forecast and /gridpoints/{wfo}/{x},{y}/forecast/hourly

- forecast\_temperature\_qv: Represent temperature as QuantitativeValue
- forecast\_wind\_speed\_qv: Represent wind speed as QuantitativeValue

#### /stations, /stations/{stationId}, and /gridpoints/{wfo}/{x},{y}/stations

- obs\_station\_provider: Show provider and subProvider MADIS details

### Known Issues

Before contacting us, please review the following list of issues that have been identified for a future update.

- No significant known issues.

Updated 3/24/2026

### Upstream Issues/Changes

The following issues are related to upstream sources of the API, and are not an API bug.

- Station observations endpoints always show missing (null) 24h max/min temperatures for stations outside the central time zone due to MADIS ingest bug.
- **Delayed observations**
Observations may be delayed up to 20 minutes from [MADIS](https://madis-data.ncep.noaa.gov/), the upstream source, due to QC processing.


### Resolutions

The following issues have been recently resolved:

- 17 Mar 2026: The /radar/queues/rds and /radar/queues/tds endpoints are limited by default so that they no longer return a 503 error from too many results.
- 7 Jan 2026: The /forecast and /forecast/hourly endpoints no longer contain data that has past (ex. previous hours in an hourly forecast or the words "Overnight" during the early part of the day).
- 15 Dec 2025: Precipitation values in the observations endpoints are rounded down to the nearest centimeter (less than 0.4" may be improperly rounded down to 0).
- 2 Oct 2025: Upstream MADIS bug resolved so that station observations endpoints no longer always show missing (null) wind gust values.
- 4 Aug 2025:
  - Station observations should no longer be routinely delayed more than about the 20 minutes it takes the upstream MADIS source to QC and ingest for API.
  - Station observations should no longer have missing (null) values for weather properties (temperature, wind, precipitation, etc.) when the MADIS source has data and [passed all QC levels](https://madis.ncep.noaa.gov/madis_sfc_qc_notes.shtml).
- 22 May 2025:
  - XML data requests to the stations/<station id>/observations/latest endpoint no longer fail when observation site reports variable (VRB) winds.
  - [/alerts/types](https://api.weather.gov/alerts/types) have been updated to correct "Evacuation Immediate" and add/remove types to align with what appears in the [Hazards Map](https://www.weather.gov/help-map).
  - PoP values less than 20% in the 12h forecast endpoints (/gridpoints/{office}/{gridX},{gridY}/forecast) no longer display as null values.
  - Periods with extra ellipses (...) in the WFO's forecast zone text product (ZFP) are now properly displayed in the /zones/{type}/{zoneId}/forecast endpoint.
  - For more details on other changes with this upgrade, please see [SCN 25-44](https://www.weather.gov/media/notification/pdf_2025/scn25-44_API_latest_changesmay22_2025.pdf).

## Specification

**Note:** All times generated by the API are in [ISO-8601 format](https://www.w3.org/TR/NOTE-datetime).

![Swagger UI](<Base64-Image-Removed>)Explore

## weather.gov API  ```  3.12.2  ```    ``` OAS 3.1 ```

[https://api.weather.gov/openapi.json](https://api.weather.gov/openapi.json)

weather.gov API

[Full API documentation](https://www.weather.gov/documentation/services-web-api)

Servers

https://api.weather.gov - Production server

Authorize

### [default](https://www.weather.gov/documentation/services-web-api\#/default)

GET[/alerts](https://www.weather.gov/documentation/services-web-api#/default/alerts_query)

GET[/alerts/active](https://www.weather.gov/documentation/services-web-api#/default/alerts_active)

GET[/alerts/active/count](https://www.weather.gov/documentation/services-web-api#/default/alerts_active_count)

GET[/alerts/active/zone/{zoneId}](https://www.weather.gov/documentation/services-web-api#/default/alerts_active_zone)

GET[/alerts/active/area/{area}](https://www.weather.gov/documentation/services-web-api#/default/alerts_active_area)

GET[/alerts/active/region/{region}](https://www.weather.gov/documentation/services-web-api#/default/alerts_active_region)

GET[/alerts/types](https://www.weather.gov/documentation/services-web-api#/default/alerts_types)

GET[/alerts/{id}](https://www.weather.gov/documentation/services-web-api#/default/alerts_single)

GET[/aviation/cwsus/{cwsuId}](https://www.weather.gov/documentation/services-web-api#/default/cwsu)

GET[/aviation/cwsus/{cwsuId}/cwas](https://www.weather.gov/documentation/services-web-api#/default/cwas)

GET[/aviation/cwsus/{cwsuId}/cwas/{date}/{sequence}](https://www.weather.gov/documentation/services-web-api#/default/cwa)

GET[/aviation/sigmets](https://www.weather.gov/documentation/services-web-api#/default/sigmetQuery)

GET[/aviation/sigmets/{atsu}](https://www.weather.gov/documentation/services-web-api#/default/sigmetsByATSU)

GET[/aviation/sigmets/{atsu}/{date}](https://www.weather.gov/documentation/services-web-api#/default/sigmetsByATSUByDate)

GET[/aviation/sigmets/{atsu}/{date}/{time}](https://www.weather.gov/documentation/services-web-api#/default/sigmet)

GET[/glossary](https://www.weather.gov/documentation/services-web-api#/default/glossary)

GET[/gridpoints/{wfo}/{x},{y}](https://www.weather.gov/documentation/services-web-api#/default/gridpoint)

GET[/gridpoints/{wfo}/{x},{y}/forecast](https://www.weather.gov/documentation/services-web-api#/default/gridpoint_forecast)

GET[/gridpoints/{wfo}/{x},{y}/forecast/hourly](https://www.weather.gov/documentation/services-web-api#/default/gridpoint_forecast_hourly)

GET[/gridpoints/{wfo}/{x},{y}/stations](https://www.weather.gov/documentation/services-web-api#/default/gridpoint_stations)

GET[/icons/{set}/{timeOfDay}/{first}](https://www.weather.gov/documentation/services-web-api#/default/icons)

GET[/icons/{set}/{timeOfDay}/{first}/{second}](https://www.weather.gov/documentation/services-web-api#/default/iconsDualCondition)

GET[/icons](https://www.weather.gov/documentation/services-web-api#/default/icons_summary)

GET[/thumbnails/satellite/{area}](https://www.weather.gov/documentation/services-web-api#/default/satellite_thumbnails)

GET[/stations/{stationId}/observations](https://www.weather.gov/documentation/services-web-api#/default/station_observation_list)

GET[/stations/{stationId}/observations/latest](https://www.weather.gov/documentation/services-web-api#/default/station_observation_latest)

GET[/stations/{stationId}/observations/{time}](https://www.weather.gov/documentation/services-web-api#/default/station_observation_time)

GET[/stations/{stationId}/tafs](https://www.weather.gov/documentation/services-web-api#/default/tafs)

GET[/stations/{stationId}/tafs/{date}/{time}](https://www.weather.gov/documentation/services-web-api#/default/taf)

GET[/stations](https://www.weather.gov/documentation/services-web-api#/default/obs_stations)

GET[/stations/{stationId}](https://www.weather.gov/documentation/services-web-api#/default/obs_station)

GET[/offices/{officeId}](https://www.weather.gov/documentation/services-web-api#/default/office)

GET[/offices/{officeId}/briefing](https://www.weather.gov/documentation/services-web-api#/default/office_briefing)

GET[/offices/{officeId}/briefing/download/latest](https://www.weather.gov/documentation/services-web-api#/default/office_briefing_download_latest)

GET[/offices/{officeId}/briefing/download/{briefingId}](https://www.weather.gov/documentation/services-web-api#/default/office_briefing_download)

GET[/offices/{officeId}/headlines/{headlineId}](https://www.weather.gov/documentation/services-web-api#/default/office_headline)

GET[/offices/{officeId}/headlines](https://www.weather.gov/documentation/services-web-api#/default/office_headlines)

GET[/offices/{officeId}/weatherstories](https://www.weather.gov/documentation/services-web-api#/default/office_weatherstory)

GET[/offices/{officeId}/weatherstories/download/{imageId}](https://www.weather.gov/documentation/services-web-api#/default/office_weatherstory_image)

GET[/points/{latitude},{longitude}](https://www.weather.gov/documentation/services-web-api#/default/point)

GET[/points/{latitude},{longitude}/radio](https://www.weather.gov/documentation/services-web-api#/default/point_radio)

GET[/points/{latitude},{longitude}/stations](https://www.weather.gov/documentation/services-web-api#/default/point_stations)

GET[/radar/servers](https://www.weather.gov/documentation/services-web-api#/default/radar_servers)

GET[/radar/servers/{id}](https://www.weather.gov/documentation/services-web-api#/default/radar_server)

GET[/radar/spgds](https://www.weather.gov/documentation/services-web-api#/default/radar_spgds)

GET[/radar/stations](https://www.weather.gov/documentation/services-web-api#/default/radar_stations)

GET[/radar/stations/{stationId}](https://www.weather.gov/documentation/services-web-api#/default/radar_station)

GET[/radar/stations/{stationId}/alarms](https://www.weather.gov/documentation/services-web-api#/default/radar_station_alarms)

GET[/radar/queues/{host}](https://www.weather.gov/documentation/services-web-api#/default/radar_queue)

GET[/radar/profilers/{stationId}](https://www.weather.gov/documentation/services-web-api#/default/radar_profiler)

GET[/radio](https://www.weather.gov/documentation/services-web-api#/default/transmitters)

GET[/radio/{callSign}](https://www.weather.gov/documentation/services-web-api#/default/transmitter)

GET[/radio/{callSign}/broadcast](https://www.weather.gov/documentation/services-web-api#/default/area_radio)

GET[/products](https://www.weather.gov/documentation/services-web-api#/default/products_query)

GET[/products/locations](https://www.weather.gov/documentation/services-web-api#/default/product_locations)

GET[/products/types](https://www.weather.gov/documentation/services-web-api#/default/product_types)

GET[/products/{productId}](https://www.weather.gov/documentation/services-web-api#/default/product)

GET[/products/types/{typeId}](https://www.weather.gov/documentation/services-web-api#/default/products_type)

GET[/products/types/{typeId}/locations](https://www.weather.gov/documentation/services-web-api#/default/products_type_locations)

GET[/products/locations/{locationId}/types](https://www.weather.gov/documentation/services-web-api#/default/location_products)

GET[/products/types/{typeId}/locations/{locationId}](https://www.weather.gov/documentation/services-web-api#/default/products_type_location)

GET[/products/types/{typeId}/locations/{locationId}/latest](https://www.weather.gov/documentation/services-web-api#/default/latest_product_type_location)

GET[/zones](https://www.weather.gov/documentation/services-web-api#/default/zone_list)

GET[/zones/{type}](https://www.weather.gov/documentation/services-web-api#/default/zone_list_type)

GET[/zones/{type}/{zoneId}](https://www.weather.gov/documentation/services-web-api#/default/zone)

GET[/zones/{type}/{zoneId}/forecast](https://www.weather.gov/documentation/services-web-api#/default/zone_forecast)

GET[/zones/{type}/{zoneId}/radio](https://www.weather.gov/documentation/services-web-api#/default/transmitter_zone)

GET[/zones/forecast/{zoneId}/observations](https://www.weather.gov/documentation/services-web-api#/default/zone_obs)

GET[/zones/forecast/{zoneId}/stations](https://www.weather.gov/documentation/services-web-api#/default/zone_stations)

#### Schemas

Alert

Expand all **object**

ActiveAlertCollection

Expand all **object**

AlertCollection

Expand all **object**

ActiveAlertCollectionGeoJson

Expand all **(any & object & any)**

AlertCollectionGeoJson

Expand all **(any & object & any)**

ActiveAlertCollectionJsonLd

Expand all **(any & object)**

AlertCollectionJsonLd

Expand all **(any & object)**

AlertCap

**object**

AlertGeoJson

Expand all **(any & object)**

AlertJsonLd

Expand all **object**

AlertId

Expand all **string**

AlertCertainty

Expand all **string**

AlertMessageType

Expand all **string**

AlertSeverity

Expand all **string**

AlertStatus

Expand all **string**

AlertUrgency

Expand all **string**

AlertAtomEntry

Expand all **object**

AlertXMLParameter

Expand all **object**

AlertAtomFeed

Expand all **object**

AreaCode

Expand all **(any \| any)**

AstronomicalData

Expand all **object**

ATSUIdentifier

Expand all **string** matches ^\[A-Z\]{3,4}$

BinaryFile

**string** binary

CenterWeatherAdvisoryCollectionGeoJson

Expand all **(any & object)**

CenterWeatherAdvisoryGeoJson

Expand all **(any & object)**

CenterWeatherAdvisory

Expand all **object**

CenterWeatherServiceUnitJsonLd

Expand all **any**

Date

Expand all **string** date

GeometryString

Expand all **string \| null** wkt

GeoJsonBoundingBox

Expand all **array<number>** >= 4 items

GeoJsonCoordinate

Expand all **array<number>** >= 2 items

GeoJsonGeometry

Expand all **(object \| object \| object \| object \| object \| object \| null)**

GeoJsonFeature

Expand all **object**

GeoJsonFeatureCollection

Expand all **object**

GeoJsonLineString

Expand all **array<any>** >= 2 items

GeoJsonPolygon

Expand all **array<array<any>>**

Gridpoint

Expand all **object**

GridpointQuantitativeValueLayer

Expand all **object**

GridpointGeoJson

Expand all **(any & object)**

GridpointJsonLd

Expand all **any**

Gridpoint12hForecast

Expand all **object**

GridpointHourlyForecast

Expand all **object**

GridpointHourlyForecastPeriod

Expand all **object**

Gridpoint12hForecastPeriod

Expand all **object**

GridpointForecastUnits

Expand all **string**

Gridpoint12hForecastGeoJson

Expand all **(any & object)**

GridpointHourlyForecastGeoJson

Expand all **(any & object)**

Gridpoint12hForecastJsonLd

Expand all **(any & object)**

GridpointHourlyForecastJsonLd

Expand all **(any & object)**

ISO8601Duration

Expand all **string** matches ^P(\\d+Y)?(\\d+M)?(\\d+D)?(T(\\d+H)?(\\d+M)?(\\d+S)?)?$

ISO8601Interval

Expand all **(string \| string \| string)**

JsonLdContext

Expand all **(array<any> \| object)**

LandRegionCode

Expand all **string**

MarineAreaCode

Expand all **string**

MarineRegionCode

Expand all **string**

MetarPhenomenon

Expand all **object**

MetarSkyCoverage

Expand all **string**

NWSCenterWeatherServiceUnitId

Expand all **string**

NWSConnectDocumentMetadata

Expand all **object**

NWSForecastOfficeId

Expand all **string**

NWSNationalHQId

Expand all **string**

NWSOfficeId

Expand all **(any \| any \| any)**

NWSRegionalHQId

Expand all **string**

NWSZoneID

Expand all **string** matches ^(A\[KLMNRSZ\]\|C\[AOT\]\|D\[CE\]\|F\[LM\]\|G\[AMU\]\|I\[ADLN\]\|K\[SY\]\|L\[ACEHMOS\]\|M\[ADEHINOPST\]\|N\[CDEHJMVY\]\|O\[HKR\]\|P\[AHKMRSWZ\]\|S\[CDL\]\|T\[NX\]\|UT\|V\[AIT\]\|W\[AIVY\]\|\[HR\]I)\[CZ\]\\d{3}$

NWSZoneType

Expand all **string**

Observation

Expand all **object**

ObservationGeoJson

Expand all **(any & object)**

ObservationJsonLd

Expand all **any**

ObservationCollectionGeoJson

Expand all **(any & object)**

ObservationCollectionJsonLd

Expand all **object**

ObservationStation

Expand all **object**

ObservationStationGeoJson

Expand all **(any & object)**

ObservationStationJsonLd

Expand all **(any & object)**

ObservationStationCollectionGeoJson

Expand all **(any & object)**

ObservationStationCollectionJsonLd

Expand all **object**

Office

Expand all **object**

OfficeBriefing

Expand all **any**

OfficeHeadline

Expand all **object**

OfficeHeadlineCollection

Expand all **object**

OfficeWeatherStory

Expand all **(any & object)**

OfficeWeatherStoryCollection

Expand all **array<any>**

PaginationInfo

Expand all **object**

Point

Expand all **object**

PointGeoJson

Expand all **(any & object)**

PointJsonLd

Expand all **(any & object)**

PointString

**string** matches ^(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)$

ProblemDetail

Expand all **object**

QuantitativeValue

Expand all **object**

RegionCode

Expand all **(any \| any)**

RelativeLocation

Expand all **object**

RelativeLocationGeoJson

Expand all **(any & object)**

RelativeLocationJsonLd

Expand all **(any & object)**

Sigmet

Expand all **object**

SigmetCollectionGeoJson

Expand all **(any & object)**

SigmetGeoJson

Expand all **(any & object)**

SigmetSequenceNumber

**string**

StateTerritoryCode

Expand all **string**

TextProduct

Expand all **object**

TextProductCollection

Expand all **object**

TextProductTypeCollection

Expand all **object**

TextProductLocationCollection

Expand all **object**

Time

Expand all **string** matches ^(\[01\]\[0-9\]\|2\[0-3\])\[0-5\]\[0-9\]$

UnitOfMeasure

Expand all **string** matches ^((wmo\|uc\|wmoUnit\|nwsUnit):)?.\*$

Zone

Expand all **object**

ZoneGeoJson

Expand all **(any & object)**

ZoneJsonLd

Expand all **any**

ZoneCollectionGeoJson

Expand all **(any & object)**

ZoneCollectionJsonLd

Expand all **object**

ZoneForecast

Expand all **object**

ZoneForecastGeoJson

Expand all **(any & object)**

ZoneForecastJsonLd

Expand all **any**

[![usa.gov](https://www.weather.gov/bundles/templating/images/footer/usa_gov.png)](http://www.usa.gov/)

[US Dept of Commerce](http://www.commerce.gov/)

[National Oceanic and Atmospheric Administration](http://www.noaa.gov/)

[National Weather Service](https://www.weather.gov/)

Documentation

,


[Comments? Questions? Please Contact Us.](mailto:idp-support@noaa.gov)

[Disclaimer](https://www.weather.gov/disclaimer)

[Information Quality](http://www.cio.noaa.gov/services_programs/info_quality.html)

[Help](https://www.weather.gov/help)

[Glossary](https://www.weather.gov/glossary)

[Privacy Policy](https://www.weather.gov/privacy)

[Freedom of Information Act (FOIA)](https://www.noaa.gov/foia-freedom-of-information-act)

[About Us](https://www.weather.gov/about)

[Career Opportunities](https://www.weather.gov/careers)

Thank you for visiting a National Oceanic and Atmospheric Administration (NOAA) website. The link you have selected will take you to a non-U.S. Government website for additional information.

NOAA is not responsible for the content of any linked website not operated by NOAA. This link is provided solely for your information and convenience, and does not imply any endorsement by NOAA or the U.S. Department of Commerce of the linked website or any information, products, or services contained therein.

You will be redirected to:

[Continue](https://www.weather.gov/documentation/services-web-api#) [New Window](https://www.weather.gov/documentation/services-web-api#) [Cancel](https://www.weather.gov/documentation/services-web-api#)