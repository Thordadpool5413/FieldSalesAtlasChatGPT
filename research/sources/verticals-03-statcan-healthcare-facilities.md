Source: https://www.statcan.gc.ca/en/lode/databases/odhf
Title: The Open Database of Healthcare Facilities
Fetched: 2026-11-06T05:52:56.595Z

# The Open Database of Healthcare Facilities

**Catalogue number: [13260001](https://www150.statcan.gc.ca/en/catalogue/13260001)**

**Issue number:** 2020001

![The Open Database of Healthcare Facilities ](https://www.statcan.gc.ca/sites/default/files/images/lode-health.jpg)

The Open Database of Healthcare Facilities (ODHF) is a collection of open data containing the names, types, and locations of healthcare facilities across Canada. It is released under the [Open Government License - Canada](https://open.canada.ca/en/open-government-licence-canada).

The ODHF compiles open, publicly available, and directly-provided data on healthcare facilities across Canada. Data sources include regional health authorities, provincial, territorial and municipal governments, and public health and professional healthcare bodies. This database aims to provide enhanced access to a harmonized listing of healthcare facilities across Canada by making them available as open data. This database is a component of the [Linkable Open Data Environment (LODE)](https://www.statcan.gc.ca/en/lode).

## Data sources and methodology

The inputs for the ODHF are datasets whose sources include regional health authorities, provincial, territorial and municipal governments, and public healthcare and professional healthcare bodies. These datasets were available either under one of the various types of open data licences, e.g., in an open government portal, or as publicly available data. In certain cases, data were obtained directly from administrative sources. Details of the sources used are available in the ODHF metadata.

The data sources used do not deploy a uniform classification system. The ODHF harmonizes facility type by assigning one of three types to each healthcare facility. This was done based on the facility type provided in the source data as well as using other research carried out for the purpose. The facility types used in the ODHF are: ambulatory health care services, hospitals, and nursing and residential care facilities. However, alternative medicine (e.g., herbalists) and specialist areas (e.g., chiropractors, dentists, mental health specialists, etc.) are not in scope for the current ODHF version (version 1.1).

The ODHF does not assert having exhaustive coverage and may not contain all facilities in scope for the current version. While efforts have been made to minimize these, facility type classification and geolocation errors are also possible. While all data are released on the same date, the dates as of which data are current depends on the update dates of the sources used.

A subset of geo-coordinates available in the source data were validated using the internet and updated as needed. When latitude and longitude were not available, geocoding was performed for some sources using address data in the source. Some coordinates were also removed from the original sources when it was determined they were derived from postal codes or other aggregate geographic areas as opposed to street address.

Deduplication was done to remove duplicates for cases where sources overlapped in coverage.

This current version of the database (version 1.1) contains approximately 7,000 records. Data were collected by accessing sources between November 2019 and March 2020 for the initial release, with additional data collected or otherwise updated from May to June 2020 for version 1.1.

The variables included in the ODHF are as follows:

- Index
- Facility Name
- Source Facility Type
- ODHF Facility Type
- Provider
- Unit
- Street Number
- Street Name
- Postal Code
- City
- Province or Territory
- Source-Format Street Address
- Census Subdivision Name
- Census Subdivision Unique Identifier
- Province or Territory Unique Identifier
- Latitude
- Longitude

For more information on how the addresses and variables were compiled, see the [metadata](https://www.statcan.gc.ca/en/lode/databases/odhf/metadata) that accompanies the ODHF.

## Downloading the ODHF

For ease of download, the ODHF is provided as a compressed comma-separated values (CSV) file.

- [ODHF](https://www150.statcan.gc.ca/n1/en/pub/13-26-0001/2020001/ODHF_v1.1.zip)

## Visualizing the ODHF

The ODHF content is available for visualization on a map using the [Linkable Open Data Environment viewer](https://www150.statcan.gc.ca/n1/pub/71-607-x/71-607-x2020014-eng.htm).

Date modified:2025-12-22