Source: https://www.census.gov/data/developers/data-sets/acs-5year.2022.html
Title: American Community Survey 5-Year Data (2009-2024)
Fetched: 2026-11-06T05:53:04.546Z

# American Community Survey 5-Year Data (2009-2024)

[Skip Navigation](https://www.census.gov/data/developers/data-sets/acs-5year.2022.html#content)

[Within Developers](https://www.census.gov/data/developers.html)

[![Form to request a key](https://www.census.gov/data/developers/_jcr_content/root/responsivegrid/responsivegrid/inheritedreference/inheritRefWrap/teasercore.coreimg.png/1706824126682/request-a-key.png)](https://www.census.gov/data/developers/api-key.html)

# American Community Survey 5-Year Data (2009-2024)

January 29, 2026


The American Community Survey (ACS) is an ongoing survey that provides data every year—giving communities the current information they need to make important decisions. The ACS covers a broad range of topics about social, economic, housing, and demographic characteristics of the U.S. population.

The ACS 5-year estimates are available for the nation, all states, the District of Columbia, Puerto Rico, all congressional districts and metropolitan statistical areas, counties, places (i.e., towns or cities), ZIP Code Tabulation Areas, census tracts, and block groups.

- **Detailed Tables** contain the most detailed estimates on all topics for all geographies. The data are presented as estimates. Detailed Tables are available down to the block group level.

- **Subject Tables** provide a span of information on a particular ACS subject presented in the format of both estimates and percentages. Subject Tables are available down to the census tract level.

- **Data Profiles** contain broad social, economic, housing, and demographic information. The data are presented as estimates and percentages. Data Profiles are available down to the census tract level.

- **Comparison Profiles** are similar to Data Profiles but also include comparisons with past-year data. The current 5-year data are compared with the preceding non-overlapping 5-year data (e.g. 2020-2024 ACS 5-year estimates compared to 2015-2019 ACS 5-year estimates) and include statistical significance testing. Comparison Profiles are available down to the places/county subdivisions level.


To create an API call, you must enter a specific URL into the address bar of a web browser. The call will vary depending on the following factors:

- Year of data release

- Dataset (ACS 1-year or 5-year)

- Table ID

- Geography level


Please review the example API calls for each of the table types listed below and use those examples to build your API calls. Visit the [API Resources page](https://www.census.gov/data/developers.html) for tutorial videos, workshops and other tools.

The API is one of several ways to access ACS data. Visit the [ACS Data page](https://www.census.gov/programs-surveys/acs/data.html) to find all the ways to access ACS data.

All data queries to the Census Data API now require an API key. Please cut and paste the Example Calls below into your web browser and replace YOUR\_KEY\_GOES\_HERE with your personal API Key.

If you do not have an API Key, request one [here](https://api.census.gov/data/key_signup.html). For more information: [Watch Video](https://www.census.gov/library/video/2026/adrm/requesting-a-census-data-api-key.html).

- [2024](https://www.census.gov/data/developers/data-sets/acs-5year.2024.html#list-tab-1806015614)
- [2023](https://www.census.gov/data/developers/data-sets/acs-5year.2023.html#list-tab-1806015614)
- [2022](https://www.census.gov/data/developers/data-sets/acs-5year.2022.html#list-tab-1806015614)
- [2021](https://www.census.gov/data/developers/data-sets/acs-5year.2021.html#list-tab-1806015614)
- [2020](https://www.census.gov/data/developers/data-sets/acs-5year.2020.html#list-tab-1806015614)
- More
![](https://www.census.gov/etc.clientlibs/census/clientlibs/census-pattern-library/resources/images/downward-chevron.svg)  - [2019](https://www.census.gov/data/developers/data-sets/acs-5year.2019.html#list-tab-1806015614)
  - [2018](https://www.census.gov/data/developers/data-sets/acs-5year.2018.html#list-tab-1806015614)
  - [2017](https://www.census.gov/data/developers/data-sets/acs-5year.2017.html#list-tab-1806015614)
  - [2016](https://www.census.gov/data/developers/data-sets/acs-5year.2016.html#list-tab-1806015614)
  - [2015](https://www.census.gov/data/developers/data-sets/acs-5year.2015.html#list-tab-1806015614)
  - [2014](https://www.census.gov/data/developers/data-sets/acs-5year.2014.html#list-tab-1806015614)
  - [2013](https://www.census.gov/data/developers/data-sets/acs-5year.2013.html#list-tab-1806015614)
  - [2012](https://www.census.gov/data/developers/data-sets/acs-5year.2012.html#list-tab-1806015614)
  - [2011](https://www.census.gov/data/developers/data-sets/acs-5year.2011.html#list-tab-1806015614)
  - [2010](https://www.census.gov/data/developers/data-sets/acs-5year.2010.html#list-tab-1806015614)
  - [2009](https://www.census.gov/data/developers/data-sets/acs-5year.2009.html#list-tab-1806015614)

2022


- 2024
- 2023
- 2022
- 2021
- 2020
- 2019
- 2018
- 2017
- 2016
- 2015
- 2014
- 2013
- 2012
- 2011
- 2010
- 2009

## 2022

### Variable Changes

Variables, and the values they represent, may change over time. Use this [2022 5YR API Changes document](https://www2.census.gov/data/api-documentation/2022-5yr-api-changes.csv) as a guide for which variables have changed from the prior year for 2022 ACS 5-Year Detailed Tables, Data Profiles and Subject Tables. See below for a description of each change type.

- No Change - The variable has not changed from the prior year (most variables).
- Updated - That variable has changed from the prior year and a matching variable for the current year has been found.
- No Match - The variable has changed from the prior year and no matching or comparable variable has been found.

For table changes, check the ACS product changes webpage for source table changes.

- * * *

[2022 Table & Geography Changes\\
\\
Learn more about changes to tables and geography for each American Community Survey data release.](https://www.census.gov/programs-surveys/acs/technical-documentation/table-and-geography-changes.html)

* * *


### Geography Note

The 2018-2022 ACS 5-year data products that report data related to Congressional Districts are based on the 118th Congress. The Census Bureau does not collect congressional district boundaries from the states during the congressional session that aligns with the decennial census. Additional explanation can be found in our [geographic user note](https://www.census.gov/programs-surveys/geography/technical-documentation/user-note/cd-sld-note.html).

### Annotation Variables

In September 2016, ACS released annotation variables that return character representations of each estimate. Many annotations return as null. However, if an annotation variable returns a value, it provides important information about the estimate or margin of error. For example, if an estimate variable (variable ending in “E”) returns “-888888888”, the annotation variable will return “(X)”. Looking at the [Notes on ACS Estimates and Annotation Values](https://census.gov/data/developers/data-sets/acs-1year/notes-on-acs-estimate-and-annotation-values.html), this means the estimate is not applicable or not available. For a complete list of return values and their annotations, see [Notes on ACS Estimates and Annotation Values](https://census.gov/data/developers/data-sets/acs-1year/notes-on-acs-estimate-and-annotation-values.html).

### Detailed Tables

- **Example Call:** api.census.gov/data/2022/acs/acs5?get=NAME,group(B01001)&for=us:1&key=YOUR\_KEY\_GOES\_HERE
- 2022 ACS Detailed Tables Variables \[ [html](https://api.census.gov/data/2022/acs/acs5/variables.html) \| [xml](https://api.census.gov/data/2022/acs/acs5/variables.xml "2022 ACS Detailed Tables Variables in xml") \| [json](https://api.census.gov/data/2022/acs/acs5/variables.json "2022 ACS Detailed Tables Variables in json") \]
- [ACS Technical Documentation](https://www.census.gov/programs-surveys/acs/technical-documentation.html)
- [Examples](https://api.census.gov/data/2022/acs/acs5/examples.html)
- [Supported Geography](https://api.census.gov/data/2022/acs/acs5/geography.html)

### Subject Tables

- **Example Call:** api.census.gov/data/2022/acs/acs5/subject?get=NAME,group(S0101)&for=us:1&key=YOUR\_KEY\_GOES\_HERE
- 2022 ACS Subject Tables Variables \[ [html](https://api.census.gov/data/2022/acs/acs5/subject/variables.html "2022 ACS Subject Tables Variables in html") \| [xml](https://api.census.gov/data/2022/acs/acs5/subject/variables.xml "2022 ACS Subject Tables Variables in xml") \| [json](https://api.census.gov/data/2022/acs/acs5/subject/variables.json "2022 ACS Subject Tables Variables in json") \]
- [ACS Technical Documentation](https://www.census.gov/programs-surveys/acs/technical-documentation.html)
- [Examples](https://api.census.gov/data/2022/acs/acs5/subject/examples.html)
- [Supported Geography](https://api.census.gov/data/2022/acs/acs5/subject/geography.html)

### Data Profiles

- **Example Call:** api.census.gov/data/2022/acs/acs5/profile?get=group(DP02)&for=us:1&key=YOUR\_KEY\_GOES\_HERE
- 2022 ACS Data Profiles Variables \[ [html](https://api.census.gov/data/2022/acs/acs5/profile/variables.html) \| [xml](https://api.census.gov/data/2022/acs/acs5/profile/variables.xml "2022 ACS Data Profiles Variables in xml") \| [json](https://api.census.gov/data/2022/acs/acs5/profile/variables.json "2022 ACS Data Profiles Variables in json") \]
- [ACS Technical Documentation](https://www.census.gov/programs-surveys/acs/technical-documentation.html)
- [Examples](https://api.census.gov/data/2022/acs/acs5/profile/examples.html)
- [Supported Geography](https://api.census.gov/data/2022/acs/acs5/profile/geography.html)

### Comparison Profiles

- **Example Call:** api.census.gov/data/2022/acs/acs5/cprofile?get=group(CP05)&for=us:1&key=YOUR\_KEY\_GOES\_HERE
- 2022 ACS Comparison Profiles Variables \[ [html](https://api.census.gov/data/2022/acs/acs5/cprofile/variables.html "2022 ACS Comparison Profile Variables in html") \| [xml](https://api.census.gov/data/2022/acs/acs5/cprofile/variables.xml "2022 ACS Comparison Profile Variables in xml") \| [json](https://api.census.gov/data/2022/acs/acs5/cprofile/variables.json "2022 ACS Comparison Profile Variables in json") \]
- [ACS Technical Documentation](https://www.census.gov/programs-surveys/acs/technical-documentation.html)
- [Examples](https://api.census.gov/data/2022/acs/acs5/cprofile/examples.html)
- [Supported Geography](https://api.census.gov/data/2022/acs/acs5/cprofile/geography.html)

### Related Information

- * * *

[Notes on ACS API Variable Formats](https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-api-variable-formats.html "Notes on ACS API Variable Formats")

* * *

- * * *

[Notes on ACS API Variable Types](https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-api-variable-types.html "Notes on ACS API Variable Types")

* * *

- * * *

[Notes on ACS Estimate and Annotation Values](https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-estimate-and-annotation-values.html "Notes on ACS Estimate and Annotation Values")

* * *

- * * *

[American Community Survey (ACS)\\
\\
The American Community Survey is the premier source for information about America's changing population, housing and workforce.](https://www.census.gov/programs-surveys/acs.html "American Community Survey (ACS)")

* * *

- * * *

[Developers' Forum\\
\\
Need help? Check out our Developer Forum to submit questions, share your apps, and provide feedback.](https://www.census.gov/data/developers/api-forum.html "Developers' Forum")

* * *

- * * *

[FTP Server\\
\\
To download full datasets, visit our FTP Server.](https://www.census.gov/data/developers/ftp-server.html "FTP Server")

* * *


Page Last Revised - May 20, 2026

loading