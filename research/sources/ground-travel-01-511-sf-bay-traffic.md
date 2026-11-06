Source: https://511.org/open-data/traffic
Title: Traffic Data | 511.org
Fetched: 2026-11-06T05:52:58.009Z

[Skip to main content](https://511.org/open-data/traffic#main-content)

# Traffic Data

Welcome to 511 SF Bay’s Portal for Open Traffic Data. This free resource offers comprehensive, real-time traffic data via APIs, enabling you to power innovative applications and services.

![top view of a large city with two streets full of cars](https://511.org/sites/default/files/styles/wide/public/2025-05/AdobeStock_696510235.jpeg.webp?h=3e67d2e8&itok=nL5B1z9Z)

Start exploring our traffic data APIs and discover how to bring real-time Bay Area information into your products and tools. Once you have [obtained your API token](https://511.org/open-data/token "Request or Retrieve a Token"), you can use the data endpoints below to obtain traffic incident events and express lanes toll data from major highways in the San Francisco Bay Area. The traffic event API has been updated to include enhanced content. In addition to road closure geometries, this API now provides additional data to help end users with more precise information.

The default rate limit per API token is 60 requests per 3600 seconds. If you need an increased rate limit for your purpose, please send your request to [511sfbaydeveloperresources@googlegroups.com](mailto:511sfbaydeveloperresources@googlegroups.com) **without including your API Key**. For more details on these data endpoints, [download the technical specification](https://511.org/media/6444/show).

## Traffic Events API

Provides all active and planned incidents and events on all major highways in the nine-county San Francisco Bay Area

- **Endpoint:** http://api.511.org/traffic/events?api\_key=\[your\_key\]
- **Allowable parameters:** please consult the technical document

## Toll Data API

Provides tolls for all bridges and express lanes on highways in the nine-county San Francisco Bay Area

- **Endpoint**: http://api.511.org/toll/programs?api\_key=\[your\_key\]
- **Allowable parameters:** please consult the technical document

## Work Zones Data Exchange (WZDx) API

Provides planned and active road closures and detours throughout the San Francisco Bay Area.

By default, the API converts events with the non-standard directional value ‘both’ to the allowed WZDx value ‘undefined’. When the optional filter ‘includeAllDefinedEnums’ is set to ‘true’, the directional value ‘both’ will be included.

- **Endpoint**: http://api.511.org/traffic/wzdx?api\_key=\[your\_key\]
- **Allowable parameters**: includeAllDefinedEnums=true

Want to use 511 Open Data APIs?

Here's a short guide to the process. Don't forget to check the [Terms & Conditions of usage](https://511.org/media/6658/show).

[Get Started by Requesting a Token](https://511.org/open-data/token "Request or Retrieve a Token")

## API Documentation

Document

[511\_Data\_Agreement\_Final\_2026.pdf](https://511.org/sites/default/files/2026-04/511_Data_Agreement_Final_2026.pdf)

[Document](https://511.org/media/6443)

[511 SF Bay Open Data Specification - Toll Data\_2026.pdf](https://511.org/sites/default/files/2026-04/511%20SF%20Bay%20Open%20Data%20Specification%20-%20Toll%20Data_2026.pdf)

Document

[511 SF Bay Open Data Specification - Overview\_2026.pdf](https://511.org/sites/default/files/2026-04/511%20SF%20Bay%20Open%20Data%20Specification%20-%20Overview_2026.pdf)

[Document](https://511.org/media/6444/show)

[511 SF Bay Open Data Specification - Traffic.pdf](https://511.org/sites/default/files/2026-09/511%20SF%20Bay%20Open%20Data%20Specification%20-%20Traffic.pdf)

Top