Source: https://www.census.gov/content/dam/Census/data/developers/api-user-guide/api-user-guide.pdf
Title: Census Data API User Guide
Fetched: 2026-11-06T05:56:50.666Z

# Census Data API User Guide

July 30, 2024

---

## TABLE OF CONTENTS

**Purpose................................................................................................................................... 2**
**What is the Census Data API?.................................................................................................. 2**
**Available Datasets................................................................................................................... 3**
**Core Concepts......................................................................................................................... 4**
Variables.................................................................................................................................... 4
Required Variables.................................................................................................................... 5
Attributes.................................................................................................................................. 6
Get Function.............................................................................................................................. 6
Predicate................................................................................................................................... 6
Response Format –JSON.......................................................................................................... 10
Group Function........................................................................................................................ 11
**Example API Queries............................................................................................................. 11**
Population Estimates Example................................................................................................ 12
American Community Survey (ACS) Example.......................................................................... 14
Group Call Example – Get Results for All Data Variables in a Table......................................... 16
Time Series Dataset Example - International Trade Monthly Exports..................................... 18
**Ucgid Predicate: Alternative Option to Specify Geographies................................................. 20**
Using ucgid for Individual Geographies................................................................................... 21
Geographic Variants................................................................................................................ 24
Geographic Components......................................................................................................... 24
Finding Fully Qualified GEO IDs............................................................................................... 24
Using ucgid for Collections of Geographies (Pseudo Geos)..................................................... 26
**Query Limits.......................................................................................................................... 20**
**API Key.................................................................................................................................. 28**
**Resources for Learning More................................................................................................. 29**
**Contact Us............................................................................................................................. 29**

---

## Purpose

The purpose of this user guide is to instruct developers and researchers on how to use the 
Census Data Application Programming Interface (API) to request data from U.S. Census Bureau 
datasets.

Applications built on Census data typically take advantage of three underlying services: Census 
Data API, TIGERweb REST Services and the Geocoder REST Services:

#### Census Data API

<u>The Census Data Application Programming Interface (API)<sup>1</sup></u> is an API that gives the public access 
to raw statistical data from various Census Bureau data programs. In terms of space, we 
aggregate the data and usually associate them with a certain Census geographic boundary/area 
defined by a FIPS code. In terms of time, we associate the data with a specific vintage 
(reference year).

#### TIGERweb

<u>TIGERweb GeoServices REST API<sup>2</sup></u> provides Census area boundaries/shapes referenced by FIPS 
codes. This service can take two types of parameters to return one or more Census boundaries: 
a FIPS code or a latitude/longitude pair. FIPS codes are 12-digit codes that are hierarchical in 
code so that the higher numbers define higher-level geographies and lower numbers define 
lower-level geographies.

#### Geocoder

Our publicly available <u>Geocoding Services API<sup>3</sup></u> translates addresses and other location formats 
into latitude/longitude parameters, which are then fed into the TIGERweb REST services to 
request a Census boundary.

#### Focus: Census Data API

The primary purpose of this guide is to cover the Census Data API. To learn more about the 
geography APIs, please visit the links included above.

## What is the Census Data API?

<u>The Census Data Application Programming Interface (API)<sup>4</sup></u> is a data service that enables 
software developers to access and use Census Bureau data within their applications.

<u><sup>1</sup>https://www.census.gov/data/developers/updates/new-discovery-tool.html</u>

<u><sup>2</sup>https://www.census.gov/data/developers/data-sets/TIGERweb-map-service.html</u>

<u><sup>3</sup>https://www.census.gov/data/developers/data-sets/Geocoding-services.html</u>

<u><sup>4</sup>https://www.census.gov/data/developers/updates/new-discovery-tool.html</u>

---

Researchers and software developers both inside and outside the Census Bureau use this API. 
Its simple raw format provides greater ease and accessibility for inputting data to whatever 
format you need for presenting and manipulating these data.

The Census Data API is an efficient way to query data directly from Census Bureau servers with 
many advantages:

• No complex interface

• Continual accessibility eliminates need to host data on own server

• Easily downloads target variables and geographies

• Connects to statistical software like R and SAS

• Provides immediate access to most current data

• Facilitates building new mobile and Web applications

• Drives interactive data visualizations

## Available Datasets

Determine the dataset that holds the information for which you are searching. Then decide 
what information you want from this dataset. The Census Bureau has already made available 
many datasets and is adding more almost monthly for querying with the API tool.  Currently, 
the most popular aggregate datasets to query for variables using the API are as follows:

• American Community Survey (ACS): ACS 1-Year, ACS 5-Year, ACS Supplemental, ACS 
Migration Flows

• Economic Indicators Time Series

• Decennial Census

• Economic Census

• County Business Patterns and Nonemployer Statistics

• Population Estimates and Projections

• International Trade

---

You can find a complete list of available datasets in the API Discovery Tool<sup>5</sup>.

Census API: Datasets in iData and its descendants

Title Description Vintage Dataset Name Geography List Variable List Tag List Examples Developer Documentation API Base URL
1990 Population Estimates - 1990-2000 Intercensal Estimates of the Resident Population by Age Groups, Race by Sex, and Hispanic Origin for Counties: July 1, 1990 to July 1, 1999 // Source: U.S. Census Bureau, Population Division // For detailed information about the methods used to create the intercensal population estimates, see https://www.census.gov/popest/methodology/intercensal_nat_meth.pdf // The Census Bureau's Population Estimates Program produces intercensal estimates each decade by adjusting the existing time series of postcensal estimates for a decade to smooth the transition from one decennial census count to the next. They differ from the postcensal estimates that are released annually because they rely on a formula that redistributes the difference between the April 1 postcensal estimate and April 1 census count for the end of the decade across the estimates for that decade. Meanwhile, the postcensal estimates incorporate current data on births, deaths, and migration to produce each new vintage of estimates, and to revise estimates for years back to the last census. The Population Estimates Program provides additional information including historical and postcensal estimates, evaluation estimates, demographic analysis, and research papers on its website: https://www.census.gov/popest/index.html
1990 Population Estimates - 1990-2000 Monthly Intercensal Estimates of the Civilian Population by Single Year of Age and Sex: April 1, 1990 to April 1, 2000 // Source: U.S. Census Bureau, Population Division // For detailed information about the methods used to create the intercensal population estimates, see https://www.census.gov/popest/methodology/intercensal_nat_meth.pdf // The Census Bureau's Population Estimates Program produces intercensal estimates each decade by adjusting the existing time series of postcensal estimates for a decade to smooth the transition from one decennial census count to the next. They differ from the postcensal estimates that are released annually because they rely on a formula that redistributes the difference between the April 1 postcensal estimate and April 1 census count for the end of the decade across the estimates for that decade. Meanwhile, the postcensal estimates incorporate current data on births, deaths, and migration to produce each new vintage of estimates, and to revise estimates for years back to the last census. The Population Estimates Program provides additional information including historical and postcensal estimates, evaluation estimates, demographic analysis, and research papers on its website: https://www.census.gov/popest/index.html
1990 Population Estimates - 1990-2000 Monthly Intercensal Estimates of the Resident plus Armed Forces Overseas Population by Single Year of Age and Sex: April 1, 1990 to April 1, 2000 // Source: U.S. Census Bureau, Population Division // For detailed information about the methods used to create the intercensal population estimates, see https://www.census.gov/popest/methodology/intercensal_nat_meth.pdf // The Census Bureau's Population Estimates Program produces intercensal estimates each decade by adjusting the existing time series of postcensal estimates for a decade to smooth the transition from one decennial census count to the next. They differ from the postcensal estimates that are released annually because they rely on a formula that redistributes the difference between the April 1 postcensal estimate and April 1 census count for the end of the decade across the estimates for that decade. Meanwhile, the postcensal estimates incorporate current data on births, deaths, and migration to produce each new vintage of estimates, and to revise estimates for years back to the last census. The Population Estimates Program provides additional information including historical and postcensal estimates, evaluation estimates, demographic analysis, and research papers on its website: https://www.census.gov/popest/index.html

**Figure 1 Datasets in the Census Data API: https://api.census.gov/data.html**

## Core Concepts

Below are the terms you will need to be familiar with when running an API query, like this one 
for the dataset, *Vintage 2014 Population Estimates: US, State, and PR Total Population and 
Components of Change* (Use Firefox or Chrome):

https://api.census.gov/data/2014/pep/natstprc?get=STNAME,POP&DATE_=7&for=state:*

We recommend that you use Chrome or Firefox when building and running API queries.

### Variables

A variable is each unit of data you are searching for in a dataset.  Each variable that you can 
search for in a dataset has a name, which may be an acronym or meaningful on its own; e.g., 
STNAME, POP, DATE_.

In larger datasets, such as the American Community Survey, many of these names are based on 
an alphanumeric code; e.g., B01003_001E (Total Population).

You can find the list of variables in the dataset by visiting the variables page. For example, the 
<u>variables page for the</u> <u><em>Vintage 2014 Population Estimates: US, State, and PR Total Population</em></u> 
and Components of Change<sup>6</sup>.

<u><sup>5</sup>https://api.census.gov/data.html</u>

<u><sup>6</sup>https://api.census.gov/data/2014/pep/natstprc/variables.html</u>

---

| Name | Label | Concept | Required | Attributes | Limit | Predicate Type | Group |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BIRTHS | Total Births | Estimate Variables | not required |  | 0 | int | N/A |
| DATE_ | Estimate Date | Estimate Variables | required |  | 0 | int | N/A |
| DEATHS | Total Deaths | Estimate Variables | not required |  | 0 | int | N/A |
| DENSITY | Population Density | Estimate Variables | not required |  | 0 | int | N/A |
| DIVISION | Division name | Estimate Variables | not required |  | 0 | (not a predicate) | N/A |
| DOM | Net Domestic Migration of total Pop | Estimate Variables | not required |  | 0 | int | N/A |
| for | Census API FIPS 'for' clause | Census API Geography Specification | predicate-only |  | 0 | lips-for | N/A |
| in | Census API FIPS 'in' clause | Census API Geography Specification | predicate-only |  | 0 | lips-in | N/A |
| NIM | Net International Migration | Estimate Variables | not required |  | 0 | int | N/A |
| POP | Resident population total | Estimate Variables | not required |  | 0 | int | N/A |
| REGION | Region name | Estimate Variables | not required |  | 0 | (not a predicate) | N/A |
| RESIDUAL | Final residual for total pop | Estimate Variables | not required |  | 0 | int | N/A |
| STATE | State FIPS Code | Selectable Geographies | not required |  | 0 | (not a predicate) | N/A |
| STNAME | State name | Selectable Geographies | not required |  | 0 | (not a predicate) | N/A |
| SUMLEV | Geographic Summary Level | Selectable Geographies | not required |  | 0 | (not a predicate) | N/A |

**Figure 2:  Variable Table for 2014 Population Estimates: US, State, and PR Total Population and Components of Change**

You can include up to 50 variables in the same API call, separated by commas.

### Required Variables

Most of the time, you have the option to choose the variables you want to include in your API 
call, but occasionally some datasets have required variables. Required variables are the 
parameters that you need to include in your search; otherwise, your search will produce no 
data and will return an error message. The variable table for each dataset lists which variables 
are required, as shown below in the variables page for the <u>2014 Population Estimates (Total</u> 
and Components of Change) Dataset<sup>7</sup>.

| Name | Label | Concept | Required | Attributes | Limit | Predicate Type | Group |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BIRTHS | Total Births | Estimate Variables | not required |  | 0 | int | N/A |
| DATE_ | Estimate Date | Estimate Variables | required |  | 0 | int | N/A |
| DEATHS | Total Deaths | Estimate Variables | not required |  | 0 | int | N/A |
| DENSITY | Population Density | Estimate Variables | not required |  | 0 | int | N/A |
| DIVISION | Division name | Estimate Variables | not required |  | 0 | (not a predicate) | N/A |
| DOM | Net Domestic Migration of total Pop | Estimate Variables | not required |  | 0 | int | N/A |
| for | Census API FIPS 'for' clause | Census API Geography Specification | predicate-only |  | 0 | fips-for | N/A |
| in | Census API FIPS 'in' clause | Census API Geography Specification | predicate-only |  | 0 | fips-in | N/A |
| NIM | Net International Migration | Estimate Variables | not required |  | 0 | int | N/A |
| POP | Resident population total | Estimate Variables | not required |  | 0 | int | N/A |
| REGION | Region name | Estimate Variables | not required |  | 0 | (not a predicate) | N/A |
| RESIDUAL | Final residual for total pop | Estimate Variables | not required |  | 0 | int | N/A |
| STATE | State FIPS Code | Selectable Geographies | not required |  | 0 | (not a predicate) | N/A |
| STNAME | State name | Selectable Geographies | not required |  | 0 | (not a predicate) | N/A |
| SUMLEV | Geographic Summary Level | Selectable Geographies | not required |  | 0 | (not a predicate) | N/A |

**Figure 3: Variable Table for 2014 Population Estimates: US, State, and PR Total Population and Components of Change**

<u><sup>7</sup>https://api.census.gov/data/2014/pep/natstprc/variables.html</u>

---

### Attributes

Attributes are additional variables you can include in your API call that give more information 
for the primary variable. For instance, they may provide labels, annotations, notes, margins of 
error, statistical significance, or flags that are related to your primary variable.

Attributes are available in many datasets and you can explore them in the discovery tool. For 
example, in the <u>2019 American Community Survey 1-Year dataset<sup>8</sup></u>, you can see variables listed 
in the Attributes column of the discovery tool (shown below).

Census Data API: Variables in /data/2019/acs/acs1/variables

| Name | Label | Concept | Required | Attributes | Limit | Predicate Type | Group |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AIANHH | Geography |  | not required |  | 0 | (not a predicate) | N/A |
| ANRC | Geography |  | not required |  | 0 | (not a predicate) | N/A |
| B01001_001E | Estimate!!Total: | SEX BY AGE | not required | B01001_001EA, B01001_001M, B01001_001MA | 0 | int | B01001 |
| B01001_002E | Estimate!!Total!!!Male: | SEX BY AGE | not required | B01001_002EA, B01001_002M, B01001_002MA | 0 | int | B01001 |
| B01001_003E | Estimate!!Total!!!Male!!!Under 5 years | SEX BY AGE | not required | B01001_003EA, B01001_003M, B01001_003MA | 0 | int | B01001 |
|  |  |  | not | B01001_004EA |  |  |  |

**Figure 4: Attributes for 2019 ACS 1-Year Estimates**

### Get Function

The get function **_(get=)_** specifies the required and selected variables you are requesting the API 
to give you. For example (use Chrome or Firefox):

https://api.census.gov/data/2014/pep/natstprc?get=STNAME,POP&DATE_=7&for=state:*

### Predicate

The predicate specifies how variables should be filtered or limited, and you can create 
predicates of geography, string variables, numeric variables, and time (in time series datasets).

In this example, the predicate limits the search on the July 1, 2014 (&DATE_=7) population or 
housing unit estimate and for all states (&for=state:*):

https://api.census.gov/data/2014/pep/natstprc?get=STNAME,POP&DATE_=7&for=state:*

<u><sup>8</sup>https://api.census.gov/data/2019/acs/acs1/variables.html</u>

---

Please note:

• Predicates always start with an ampersand (&).

• A wildcard **(:*)** can be included to search for all the values of a variable. Wildcards work 
for geographies and string variables only.

• A variable only needs to appear once in a query ̶ either in the get statement or as a 
predicate.  In the example above, DATE_ is a predicate (&DATE_=7), so you do not need 
to include it in the get statement (?get=STATENAME,POP).

Below are some examples of predicates that you can use as a guide when building your queries.

#### Geography

The predicate **_&for_** restricts the variables by geography at various levels, while **_&in_** and **%20**
restricts to geographic areas smaller than state level. You can include wildcards **(*)** along with 
**&for** and **&in.**

Examples to get results for a single geography:

o *&for=state:01* – restricts the result to include only Alabama

o *&for=county:001&in=state:01* – restricts the result to include only Autauga 
County, Alabama

o *&for=county%20(or%20part):073&in=state:01%20place:07000* – restricts the 
result to include the portion of Jefferson County (county:073), Alabama that is 
within Birmingham city (place:07000)

Examples to get results for multiple geographies:

o *&for=state:01,13* – retrieves the result for Alabama and Georgia

o *&for=state:** – retrieves the result for all states

o *&for=county:*&in=state:01* – restricts the result to include all counties in 
Alabama

o *&for=county%20(or%20part):*&in=state:01%20place:62328* – restricts the result 
to include all counties within Prattville city (place: 62328), Alabama

The “Examples” pages in the discovery tool will list the available geographic levels and 
predicates for your dataset so you don’t have to build these from scratch.

---

For more information on Census Bureau geography, visit the <u>Geography webpage<sup>9</sup></u>.

As an alternative, you may instead use **_&ucgid_** to restrict your variables by geography. For more 
details, see the <u>Ucgid Predicate</u> section of this guide.

#### Variables – String

You can create a predicate of string variables with various restrictions and can include wildcards 
**(*)**. Below are several examples across different surveys and programs.

Examples to get results for a single variable value:

o *&AGEGROUP=29* – restricts results to include data for people age 18 years and 
over (example: <u>2019 Population Estimates Program Characteristics of Age</u> 
<u>Groups<sup>10</sup></u>)

o *&POPGROUP=400* – restricts results to include data for POPGROUP code 400, 
which corresponds to the Hispanic or Latino population (example: <u>2019 ACS 1-</u>
<u>Year Selected Population Profiles<sup>11</sup></u>)

o *&GEOCOMP=A0* – restricts results to include data for the portion of your 
geography that is within a metropolitan/micropolitan statistical area (example: 
<u>2018 ACS 5-year Data Profiles<sup>12</sup></u>)

o *&PORT=0101* – restricts the result to include data for PORT code 0101, which 
corresponds to Portland, ME (example: <u>International Trade – U.S. Exports by Port</u> 
<u>and Harmonized System<sup>13</sup></u>)

Examples to get results for multiple variable values:

o *&POPGROUP=400&POPGROUP=451* – restricts results to include data for 
POPGROUP codes 400 and 451, which are the codes for the Hispanic or Latino 
and Non-Hispanic white alone populations (example: <u>2019 ACS 1-Year Selected</u> 
<u>Population Profiles<sup>14</sup></u>)

o *&PORT=0101&PORT=0501* – restricts the result to include only ports with PORT 
codes 0101 and 0501 which correspond to Portland, ME and Newport, RI 
(example: <u>International Trade – U.S. Exports by Port and Harmonized System<sup>15</sup></u>)

<u><sup>9</sup>https://www.census.gov/programs-surveys/geography.html</u>

<u><sup>10</sup>https://api.census.gov/data/2019/pep/charagegroups.html</u>

<u><sup>11</sup>https://api.census.gov/data/2019/acs/acs1/spp.html</u>

<u><sup>12</sup>https://api.census.gov/data/2018/acs/acs5/profile.html</u>

<u><sup>13</sup>https://api.census.gov/data/timeseries/intltrade/exports/porths.html</u>

<u><sup>14</sup>https://api.census.gov/data/2019/acs/acs1/spp.html</u>

<u><sup>15</sup>https://api.census.gov/data/timeseries/intltrade/exports/porths.html</u> o *&PORT=21** – restricts the result to include data for PORT codes starting with 21 
which may include but is not limited to 2101, 2102, 2103, and 2104, etc.
(example: <u>International Trade – U.S. Exports by Port and Harmonized System<sup>16</sup></u>)

o *&NAICS2017=23**-- restricts results to include data for all available NAICS codes 
that begin with 23 in the construction sector (example: <u>2018 County Business</u> 
Patterns<sup>17</sup>)

You can use wildcards (*) in predicates with string variables and geographies only. You 
cannot use wildcards in time predicates or predicates with numeric variables.

#### Variables – Numeric (Integer and Float)

You can create a predicate of a range of values for numeric (integer and float) variables. Please 
note that you *cannot* build a predicate with wildcards for numeric variables.

Examples from County Business Patterns and the American Community Survey:

o *&PAYANN=100000* – restricts the result to include data where annual payroll is 
equal to 100,000

o *&PAYANN=200000&PAYANN=300000* – restricts the result to include data where 
annual payroll is equal to 200,000 or 300,000

o *&PAYANN=0:399999* – restricts the result to include data with annual payroll less 
than 400,000

o *&PAYANN=400000:500000* – restricts the result to include data where annual 
payroll is from 400,000 to 500,000

o *&DP05_0001E=100000:999999* – restricts results to include data where total 
population is from 100,000 to 999,999

o *&DP03_0128PE=0:20* – restricts results to include data where the percent of 
people in poverty is from 0% to 20%

You can use colons (:) to restrict results by a range of variable values for integer and 
float variables only. You cannot use colons with string variables.

<u><sup>16</sup>https://api.census.gov/data/timeseries/intltrade/exports/porths.html</u>

<u><sup>17</sup>https://api.census.gov/data/2018/cbp.html</u>

---

#### Time (Time Series Datasets Only)

For some datasets available on the Census Data API, data are stored for multiple points of time 
in one dataset, rather than across several datasets for individual points of time. When this 
occurs, we refer to the dataset as a time series dataset. You can find the list of time series 
datasets in the time series section of the API Discovery Tool<sup>18</sup>.

You can limit by time in most time series datasets by using the predicate **_&time._** Please note 
that you *cannot* build a predicate with wildcards **(*)** for time in a time series dataset. The plus 
sign (+) is needed for time ranges, such as the time range from 1997 to 2012 (below).

Examples:

o *&time=2015* – restricts the result to include data for 2015

o *&time=from+1997+to+2012* – restricts the result to include data from 1997 to 
2012

o *&time=2015-01* – restricts the result to include data for January, 2015

o *&time=2015-Q1* – restricts the result to include data for the first quarter of 2015

o *&time=from+2015-01* – restricts the result to include data from January, 2015 to 
the present

o *&time=to+2015-01* – restricts the result to include data *up to* January, 2015

o *&time=from+2015-01+to+2015-06* – restricts the result to include data from 
January, 2015 to June, 2015

Some time series datasets do not include the variable “time.” Instead, they use other variables 
such as “Year.” For these time-related variables, check the predicate type in the discovery tool 
to find out whether you can filter it following the guidelines for string or numeric variables 
described earlier in this document.

For more information about time series datasets, see the <u><em>Time Series Dataset Example –</em></u>
<u><em>International Trade Monthly Exports</em></u> section of this user guide.

### Response Format –JSON

The results from your Census Data API data queries will return in JavaScript Object Notation
(JSON) format, and you can easily plug those data into the formatting file or graphic of your 
choice. JSON is an easy format for exchanging data between platforms using human-readable

<u><sup>18</sup>https://api.census.gov/data/timeseries.html</u> language, rivaling the popularity of XML.  The Census uses a nonstandard version of JSON that is 
streamlined:

• Data are represented in a two-dimensional array

• Square brackets **[ ]** hold arrays

• Values are separated by a **,** (comma).

[["STNAME","POP","DATE_","state"],
["Alabama","4849377","7","01"],
["Alaska","736732","7","02"],
["Arizona","6731484","7","04"],
["Arkansas","2966369","7","05"],
["California","38802500","7","06"],
…..

### Group Function

The group function **group([insert table ID])** allows you to get results for an entire table in one 
easy command; e.g. **group(S0101).** It provides results for all variables without having to 
individually include them in the API call. Even if the table has more than 50 variables, the group 
call will provide results for all variables in that table.

For example, this API query provides results for all 912 variables for table S0101 from the 
American Community Survey

https://api.census.gov/data/2019/acs/acs1/subject?get=group(S0101)&for=state:*

## Example API Queries

Following are some examples that give a detailed breakdown of the components of the URL 
needed for building a query in a dataset. These examples will introduce you to some of the 
most popular datasets in the API: Population Estimates, the American Community Survey, and 
International Trade. Many aspects of these examples apply across datasets, such as the use of 
categorical variables or group calls.

---

Census Data API User Guide

### Population Estimates Example

Let’s begin with a query for the Hispanic population by state in the dataset, *Population 
Estimates: Estimates by Age Group, Sex, Race, and Hispanic Origin.*  You will find this dataset 
listed on the Census Data API <u>Datasets page<sup>19</sup></u> of the Discovery Tool:

Format queries as a URL, as follows (use Chrome or Firefox):  
https://api.census.gov/data/2019/pep/charagegroups?get=NAME,POP&HISP=2&for=state:*

Assemble components of this query by following these steps:

1. <u>Start your query with the host name:</u>
**https://api.census.gov/data**

2. <u>Add the data year to the URL:</u>
https://api.census.gov/data/2019

This is the year that the data were estimated.

3. <u>Add the dataset name acronym:</u>
https://api.census.gov/data/2019/pep/charagegroups

This is the base URL for this dataset. You can find dataset names by browsing the 
discovery tool: https://api.census.gov/data.html

#### 4. <u>Add</u> <u>?get=</u> <u>to the query</u>

https://api.census.gov/data/2019/pep/charagegroups?get=

#### 5. Add your variables:

https://api.census.gov/data/2019/pep/charagegroups?get=NAME,POP

In this dataset, **NAME** will provide the geography name and **POP** will provide the total 
population. Use a comma to separate each variable; e.g., **NAME,POP.** You can find the 
full list of available variables in the variables page for the dataset:
https://api.census.gov/data/2019/pep/charagegroups/variables.html.

#### 6. Add variable predicates (if applicable):

https://api.census.gov/data/2019/pep/charagegroups?get=NAME,POP&HISP=2

In this dataset, the variable HISP provides data for three categories:

• 2 = Hispanic

• 1 = Non Hispanic

<u><sup>19</sup>https://api.census.gov/data.html</u>

---

#### • 0 = Total Population

You can find this by clicking the link for the <u>HISP variable<sup>20</sup></u> in the discovery tool, or by 
visiting the <u>documentation page for categorical variables in the Population Estimates</u> 
<u>datasets<sup>21</sup></u>.

#### 7. Add your geographies:

https://api.census.gov/data/2019/pep/charagegroups?get=NAME,POP&HISP=2
**&for=state:***

Use a predicate clause starting with an ampersand (&) to separate it from your get 
clause and then a *for* followed by an *in* clause, if needed; e.g., **&for=state:.** Because we 
are looking for information in all the states, add a wildcard **(*)** to indicate all values; e.g.,  
**state:***. You can find the full list of available geographies in the examples page for the 
dataset: https://api.census.gov/data/2019/pep/charagegroups/examples.html

As you can see, you can only search on the state, county, or national level for this 
dataset. Other datasets provide results for more types of geographic areas. Sometimes 
datasets change the number of geographies they publish from year to year.

You can copy your query results into a spreadsheet to clean it up and analyze it, or you can 
save it as a file and consume it as JSON. The response for all queries is formatted as a two 
dimensional JSON array where the first row provides column names and the subsequent 
rows provide data values. The first rows of output of the query are configured as follows:

[["NAME","POP","HISP","state"],
["Mississippi","100110","2","28"],
["Missouri","268708","2","29"],
["Montana","43289","2","30"],
["Nebraska","219645","2","31"],
["Nevada","900600","2","32"],
["New Hampshire","54589","2","33"],
["New Jersey","1856844","2","34"],
["New Mexico","1032942","2","35"],
["New York","3751058","2","36"],
…..

You can find examples of other queries for this dataset by clicking the link in the Examples 
column on the API datasets page, which takes you to this Example page: 
https://api.census.gov/data/2019/pep/charagegroups/examples.html

<u><sup>20</sup>https://api.census.gov/data/2019/pep/charagegroups/variables/HISP.json</u>

<u><sup>21</sup>https://www.census.gov/data/developers/data-sets/popest-popproj/popest/popest-vars.Vintage&#95;2019.html</u>

---

As you begin to build queries, start with examples and expand upon them. 
This is a great way to learn how to use the Census Data API.

### American Community Survey (ACS) Example

The ACS has many datasets in the Census Data API with a large number of variables and special 
naming conventions. In our example, we will focus on the American Community Survey 1-Year 
Data.

#### E and M

At the end of a variable’s name in ACS datasets, E and M are characters for estimates and 
margins of error. E indicates the estimated value, based on the sample surveyed, while M at the 
end of a variable number indicates the margin of error.  The smaller the sample size the greater 
the margin of error.

#### PE and PM

At the end of a variable’s name in some ACS datasets, **PE** stands for percentage estimate, and 
**PM** stands for percentage margin of error.

More details are available on the <u>ACS Variable Types page<sup>22</sup></u>.

In our example, we will build an API call that provides data for the total number of Hmong 
people living in each U.S. state as determined by the 2019 American Community Survey 1-Year 
data. Format the search query URL as follows:

https://api.census.gov/data/2019/acs/acs1?get=NAME,B02015_009E,B02015_009M
<u>&#38;for=state:&#42;</u>

Assemble components of this query by following these steps:

1. <u>Start your query with the host name:</u>
**https://api.census.gov/data**

2. <u>Add the data year to the query:</u> 
https://api.census.gov/data/2019

3. <u>Add the dataset name acronym:</u>
https://api.census.gov/data/2019/acs/acs1

<u><sup>22</sup>https://www.census.gov/data/developers/data-sets/acs-1year/notes-on-acs-api-variable-types.html</u>

---

This is the base URL for this dataset. You can find dataset names by browsing the 
discovery tool: https://api.census.gov/data.html

4. <u>Add</u> <u><strong>?get=</strong></u> <u>to the query:</u>
https://api.census.gov/data/2019/acs/acs1?get=

#### 5. Add your variables:

https://api.census.gov/data/2019/acs/acs1?get=NAME,B02015_009E,B02015_009M

In this dataset, the variable called **NAME** provides the geographic name you are using to 
limit your search. The variable **B02015_009E** provides the total number of Hmong 
people, and the variable **B02015_009M** is an attribute that will provide the 
corresponding margin of error. Use a comma to separate each variable; e.g., 
**?get=NAME,B02015_009E,B02015_009M.** You can find the full list of available variables 
in the variables page for the dataset: 
https://api.census.gov/data/2019/acs/acs1/variables.html.

6. <u>Add your geographies:</u>
https://api.census.gov/data/2019/acs/acs1?get=NAME,B02015_009E,B02015_009M

Use a predicate clause starting with an ampersand (&) to separate it from your get 
clause and then a *for* followed by an *in* clause, if needed; e.g., **&for=state:.** Because we 
are looking for information in all the states, add a wildcard **(*)** to indicate all values; e.g.,  
**state:***. You can find the full list of available geographies in the examples page for the 
dataset: https://api.census.gov/data/2019/acs/acs1/examples.html

The query configures the first rows of output as follows:

[["NAME","B02015_009E","B02015_009M","state"],
["Illinois","655","511","17"],
["Georgia","3162","1336","13"],
["Idaho",null,null,"16"],
["Hawaii","56","92","15"],
["Indiana","1344","1198","18"],
["Iowa","685","705","19"],
["Kansas","2189","1177","20"],
["Kentucky","530","503","21"],
["Louisiana","0","224","22"],
["Maine",null,null,"23"],
…..

“Null” occurs as a result when there is no data entered for that answer. You can find other 
examples of searches in this dataset by clicking the link in the “Examples” column on the API datasets page, which will take you to the examples page here: 
https://api.census.gov/data/2019/acs/acs1/examples.html

If your query returns an error message with no data, check your spelling, 
capitalization, and spacing. Correct it, and run it again.

### Group Call Example – Get Results for All Data Variables in a Table

If you want data for all variables in a table, use the group functionality. This will give you results 
for all variables in one easy command, even if the table contains more than 50 variables. For 
example, this API query provides results for all variables in table B02015 in each state from the 
2019 American Community Survey 1-Year Estimates

https://api.census.gov/data/2019/acs/acs1?get=group(B02015)&for=state:*

Assemble components of this query by following these steps:

1. <u>Start your query with the host name:</u> 
**https://api.census.gov/data**

2. <u>Add the data year to the query:</u> 
https://api.census.gov/data/2019

3. <u>Add the dataset name acronym:</u>
https://api.census.gov/data/2019/acs/acs1

This is the base URL for this dataset. You can find dataset names by browsing the 
discovery tool: https://api.census.gov/data.html

4. <u>Add</u> <u><strong>?get=</strong></u> <u>to the query:</u>
https://api.census.gov/data/2019/acs/acs1?get=

5. <u>Add</u> <u><strong>group</strong></u> <u>and your desired table ID in parenthesis.</u> 
https://api.census.gov/data/2019/acs/acs1?get=group(B02015)

6. <u>Add your geographies:</u>
https://api.census.gov/data/2019/acs/acs1?get=group(B02015)&for=state:*

Use a predicate clause starting with an ampersand (&) to separate it from your get 
clause and then a *for* followed by an *in* clause, if needed; e.g., **&for=state:.** Because we are looking for information in all the states, add a wildcard **(*)** to indicate all values; e.g.,  
**state:***. You can find the full list of available geographies in the examples page for the 
dataset: https://api.census.gov/data/2019/acs/acs1/examples.html

The query provides the first rows of output as follows:

[["B02015_001E","B02015_001EA","B02015_001M","B02015_001MA","B02015_002E",
"B02015_002EA","B02015_002M","B02015_002MA","B02015_003E","B02015_003EA",
"B02015_003M","B02015_003MA","B02015_004E","B02015_004EA","B02015_004M","
B02015_004MA","B02015_005E","B02015_005EA","B02015_005M","B02015_005MA",
"B02015_006E","B02015_006EA","B02015_006M","B02015_006MA","B02015_007E","
B02015_007EA","B02015_007M","B02015_007MA","B02015_008E","B02015_008EA","
B02015_008M","B02015_008MA","B02015_009E","B02015_009EA","B02015_009M","B
02015_009MA","B02015_010E","B02015_010EA","B02015_010M","B02015_010MA","
B02015_011E","B02015_011EA","B02015_011M","B02015_011MA","B02015_012E","B
02015_012EA","B02015_012M","B02015_012MA","B02015_013E","B02015_013EA","B
02015_013M","B02015_013MA","B02015_014E","B02015_014EA","B02015_014M","B0
2015_014MA","B02015_015E","B02015_015EA","B02015_015M","B02015_015MA","B
02015_016E","B02015_016EA","B02015_016M","B02015_016MA","B02015_017E","B0
2015_017EA","B02015_017M","B02015_017MA","B02015_018E","B02015_018EA","B0
2015_018M","B02015_018MA","B02015_019E","B02015_019EA","B02015_019M","B02
015_019MA","B02015_020E","B02015_020EA","B02015_020M","B02015_020MA","B0
2015_021E","B02015_021EA","B02015_021M","B02015_021MA","B02015_022E","B02
015_022EA","B02015_022M","B02015_022MA","B02015_023E","B02015_023EA","B02
015_023M","B02015_023MA","B02015_024E","B02015_024EA","B02015_024M","B020
15_024MA","B02015_025E","B02015_025EA","B02015_025M","B02015_025MA","GEO
_ID","NAME","state"],
["717992",null,"5911",null,"242823",null,"12230",null,"2062",null,"1211",null,"23",null,
"41",null,"7001",null,"3663",null,"3627",null,"1798",null,"135795",null,"8745",null,"126
628",null,"10428",null,"655",null,"511",null,"1867",null,"1105",null,"21568",null,"3365"
,null,"58037",null,"5955",null,"3572",null,"1770",null,"667",null,"409",null,"3579",null,"
2581",null,"3567",null,"1759",null,"0",null,"195",null,"39777",null,"7043",null,"1209",n
ull,"739",null,"5564",null,"1467",null,"11820",null,"3313",null,"29296",null,"5888",null,
"314",null,"311",null,"5226",null,"2848",null,"13315",null,"2555",null,"0400000US17","I
llinois","17"],
…..

In order to get the data in a viewable format, you can save the results as a .csv file by following 
the steps in the short videos and PDFs at the <u>How-To Materials for Using the Census API<sup>23</sup></u> page.

<u><sup>23</sup>https://www.census.gov/data/what-is-data-census-gov/guidance-for-data-users/how-to-materials-for-using-</u>
<u>the-census-api.html</u>

---

### Time Series Dataset Example - International Trade Monthly Exports

For some datasets available on the Census Data API, data are stored for multiple points of time 
in one dataset, rather than across several datasets for individual points of time. When this 
occurs, we refer to the dataset as a time series dataset.  For more information on time series 
datasets, see the time series section for <u><em>Predicate</em></u> in this user guide. You can find the list of time 
series datasets on the Census Data API at: https://api.census.gov/data/timeseries.html

In this example, we will build a query for one of the time series datasets in the API, 
*International Trade: Monthly U.S. Exports by End-Use Code* for the total export value (monthly 
and year-to-date) for all Customs districts for June 2016:

https://api.census.gov/data/timeseries/intltrade/exports/enduse?get=DISTRICT,
<u>DIST&#95;NAME,ALL&#95;VAL&#95;MO,ALL&#95;VAL&#95;YR&#38;YEAR=2016&#38;MONTH=06</u>

Assemble components of this query by following these steps:

1. <u>Start your query with the host name:</u>
**https://api.census.gov/data**

2. <u>Add</u> <u><strong>timeseries</strong></u> <u>to the query:</u>
https://api.census.gov/data/timeseries

#### 3. Add the dataset name acronym:

https://api.census.gov/data/timeseries/intltrade/exports/enduse

This is the base URL for this dataset. You can find dataset names by browsing the 
discovery tool: https://api.census.gov/data.html

#### 4. <u>Add</u> <u>?get=</u> <u>to the query:</u>

https://api.census.gov/data/timeseries/intltrade/exports/enduse?get=

#### Add your variables:

https://api.census.gov/data/timeseries/intltrade/exports/enduse?get=DISTRICT,
**DIST_NAME, ALL_VAL_MO,ALL_VAL_YR**

In this dataset, **ALL_VAL_MO** provides the total exports of goods in the month, and 
variable **ALL_VAL_YR** provides total exports of goods year to date. The variable 
**DISTRICT** provides the two-digit district code, and **DIST_NAME** provides the district 
name. You can find the full list of available variables in the variables page for the 
dataset:

https://api.census.gov/data/timeseries/intltrade/exports/enduse/variables.html

In the discovery tool, you will notice that the variable for DISTRICT has text that says
“Default Displayed” in the required column. This indicates that the variable provides data for several categories. The default for this variable is to provide data for each 
available district code. If you are not sure what the default is for a variable, include it in 
an API call and view the results. This will help you decide if you want to keep the 
variable in your query as is or if you may want to limit the results by adding a variable 
predicate in your query. In this case, we will continue with the default to get data for all 
districts.

#### 5. Add the time period:

https://api.census.gov/data/timeseries/intltrade/exports/enduse?get=DISTRICT,
DIST_NAME,ALL_VAL_MO,ALL_VAL_**YR&YEAR=2016&MONTH=06**

Adding the time period using the related predicate is required for this dataset. This will 
be in the format of a four digit year and two digit month.

You can also specify this required time range as **&time=2016-06.** See <u>Section</u> 
<u>5.1.5 Predicate</u> in this user guide for building predicates for time series.

#### 6. Use the default geography:

https://api.census.gov/data/timeseries/intltrade/exports/enduse?get=DISTRICT,DIST_N
AME,ALL_VAL_MO,ALL_VAL_YR&YEAR=2016&MONTH=06

This dataset does not have any geography predicates we can add to further refine our 
results, as shown on the examples page.

https://api.census.gov/data/timeseries/intltrade/exports/enduse/examples.html. By 
default, we will get data for all exports in the United States.

The query configures the first rows of output of the query as follows:

["DISTRICT","DIST_NAME","ALL_VAL_MO","ALL_VAL_YR","YEAR","MONTH"],
["","TOTAL FOR ALL DISTRICTS","125024387876","711355944093","2016","06"],
["01","PORTLAND, ME","331269702","2082731222","2016","06"],
["02","ST. ALBANS, VT","184995129","1144444553","2016","06"],
["04","BOSTON, MA","727085911","3808920861","2016","06"],
["05","PROVIDENCE, RI","16926100","77856036","2016","06"],
["07","OGDENSBURG, NY","1440920883","8137120100","2016","06"],
["09","BUFFALO, NY","4343113148","23189188640","2016","06"],
["10","NEW YORK CITY, NY","11703487744","67797106022","2016","06"],

---

["11","PHILADELPHIA, PA","1401964078","7895311695","2016","06"],
["13","BALTIMORE, MD","1218070977","7354545603","2016","06"],
["14","NORFOLK, VA","1999192268","13011038202","2016","06"],
["15","WILMINGTON, NC","452856985","2828815661","2016","06"],
["16","CHARLESTON, SC","2950121172","16716095334","2016","06"],
["17","SAVANNAH, GA","4150832886","22986303931","2016","06"],
…..

$$
[17,\mathsf{S A V A N N A H},\mathsf{G A},\mathsf{4150832886},\mathsf{22986303931},\mathsf{2016},\mathsf{06}],
$$

Now you are ready to write your API queries for a dataset. You can open and save your search 
to a text-editing program as a JSON file. You can save your search directly in Chrome and 
Firefox, but in Internet Explorer and Safari, you need to save your search to a text file program.
You can only search for variables that the variable table specifically lists with the API.

When using Chrome and Firefox, you can save your results as a .csv file. Instructions for this are 
provided in the short videos and PDF walkthroughs on the <u>How-To Materials for Using the</u> 
<u>Census API<sup>24</sup></u> page.

## Ucgid Predicate: Alternative Option to Specify Geographies

Rather than using the standard geography predicates, many datasets in the Census API also 
allow you to use the Uniform Census Geography Identifier (ucgid) predicate **_&ucgid_** to specify 
your desired geographies.

Benefits of using **_&ucgid_** to select your geography:

• It allows you to get data for multiple levels of geography in the same API query 
<u>Example:</u> *&ucgid=0400000US24,0500000US24017* provides results for Maryland and 
Charles County, MD

• It allows you to access data for collections of geographies that are not accessible using 
the standard geography predicates

<u>Example:</u> *&ucgid=pseudo(0400000US24$8600000)* provides results for all ZIP Code 
Tabulation Areas fully/partially within Maryland

Drawbacks of using **_&ucgid_** to specify your geography:

• You must specify the fully qualified GEOID of the area(s) you want to include in your 
query.

• The ucgid predicate is not available for every dataset in the API. If available, ucgid will 
appear in the list of variables on the dataset page.

<u><sup>24</sup>https://www.census.gov/data/what-is-data-census-gov/guidance-for-data-users/how-to-materials-for-using-</u>
<u>the-cenus-api.html</u>

---

#### Census Data API User Guide

Using ucgid for Individual Geographies

Use the ucgid predicate: **_&ucgid=_** and then type the fully qualified GEO ID. In the below 
example, the ucgid predicate provides results for New York city, NY
*&ucgid=1600000US3651000*

https://api.census.gov/data/2022/acs/acs1/profile?get=NAME,DP05_0001E&ucgid=160
<u><strong>0000US3651000</strong></u>

To specify individual geographies using ucgid, you will need to know the fully qualified GEO ID 
for that geography.

<u>Fully qualified</u> GEO IDs consist of:

• 3-character summary level

• 2-character geographic variant

• 2-character geographic component

• US

• Numeric codes that uniquely identify the geographic area. These may include:

o InterNational Committee for Information Technology Standards (INCITS) 
codes, formerly Federal Information Process Standards (FIPS) codes.

o Other codes assigned by the Census Bureau, U.S. Department of Education, 
and individual states for geographic areas not covered by INCITS.

As an example, consider the fully qualified GEO ID for New York City, NY: 
1600000US3651000

• 160 = 3-character summary level for place

• 00 = 2-character geographic variant, indicating that a geographic variant does not apply

• 00 = 2-character geographic component, indicating this is not a geographic component

• US = United States

• 36 = 2-digit state code for New York

• 51000 = 5-digit place code for New York city

**Table 1: Ucgid Examples for Individual Geographies**

| Geography Name | Fully Qualified GEO ID | Ucgid Predicate |
| --- | --- | --- |
| Mohave County, Arizona | 0500000US04015 | &amp;ucgid=0500000US04015 |
|  | 050 = Summary level for county 00 = No geographic variant 00 = Not a geographic component US = United States 04 = Arizona 015 = Mohave County |  |

---

Census Data API User Guide

| Geography Name | Fully Qualified GEO ID | Ucgid Predicate |
| --- | --- | --- |
| Houston-Pasadena-The Woodlands, Texas Metro Area | 310M600US26420 | &amp;ucgid=310M600US26420 |
| Houston-Pasadena-The Woodlands, Texas Metro Area | 310 = Summary level for metro/micro area M6 = Variant for 2020 vintage of metro/micro areas 00 = Not a geographic component US = United States 26420 = Houston-Pasadena-The Woodlands, TX Metro Area | &amp;ucgid=310M600US26420 |

| Fern Forest CDP, Hawaii | 1600000US1507675 | &amp;ucgid=1600000US1507675 |
| --- | --- | --- |
| Fern Forest CDP, Hawaii | 160 = Summary level for place 00 = No geographic variant 00 = Not a geographic component US = United States 15 = Hawaii 07675 = Fern Forest CDP |  |

| ZIP Code Tabulation Area (ZCTA) 15007 | 860Z200US15007 | &amp;ucgid=860Z200US15007 |
| --- | --- | --- |
| ZIP Code Tabulation Area (ZCTA) 15007 | 860 = Summary level for ZCTA Z2 = Variant for 2020 vintage of ZCTAs 00 = Not a geographic component US = United States 15007 = ZCTA 15007 |  |

| Congressional District 3, Indiana | 5001800US1803 | &amp;ucgid=5001800US1803 |
| --- | --- | --- |
| Congressional District 3, Indiana | 500 = Summary level for congressional district 18 = Variant for 118th Congressional District boundaries 00 = Not a geographic component US = United States 18 = Indiana 03 = Congressional District 3 |  |

$$
118^{\mathrm{th}}
$$

| Census Tract 206, DeKalb County, Georgia | 1400000US13089020600 | &amp;ucgid=1400000US13089020600 |
| --- | --- | --- |
| Census Tract 206, DeKalb County, Georgia | 140 = Summary level for census tract00 = No geographic variant00 = Not a geographic componentUS = United States13 = Georgia089 = DeKalb County020600 = Census tract 206 | &amp;ucgid=1400000US13089020600 |
| Block Group 2, Census Tract 104.01, Jersey County, Illinois | 1500000US170830104012 | &amp;ucgid=1500000US170830104012 |
| Block Group 2, Census Tract 104.01, Jersey County, Illinois | 150 = Summary level for census tract00 = No geographic variant00 = Not a geographic componentUS = United States17 = Illinois083 = Jersey County010401 = Census Tract 104.012 = Block Group 2 |  |

| Block 1004, Block Group 1, Census Tract 6, Benton County, Oregon | 1000000US410030006001004 100 = Summary level for block 00 = No geographic variant 00 = Not a geographic component US = United States 41 = Oregon 003 = Benton County 00600 = Census Tract 6 1004 = Block 1004 | &amp;ucgid=1000000US410030006001004 |
| --- | --- | --- |

| United States - Rural | 0400043US51 | &amp;ucgid=0400043US51 |
| --- | --- | --- |
| United States - Rural | 040 = Summary level for state 00 = No geographic variant 43 = Rural geographic component US = United States 51 = Virginia | &amp;ucgid=0400043US51 |

The ucgid predicate allows you to specify multiple geographies in the same API query by listing 
each desired fully qualified GEO ID separated by a comma. For example:

• *&ucgid=0400000US06,0400000US41* – Provides results for California and Oregon

• *&ucgid=0400000US06,0500000US06059,1600000US0602000* – Provides results 
for California, Orange County CA, and Anaheim city CA

Remember, &ucgid is an *alternative* option instead of using the standard geography predicates 
(&for and &in). An example query below shows how to use &ucgid to get total population for 
California and Oregon from the 2022 ACS 1-Year Data Profiles:

https://api.census.gov/data/2022/acs/acs1/profile?get=NAME,DP05_0001E&ucgid=0400
<u><strong>000US06,0400000US41</strong></u>

---

### Geographic Variants

A geographic variant is a version of a geographic area based on the date its boundaries are 
intended to represent. Geographic variants only apply to specific types of geographic areas that 
need to be added or replaced by a more recent version, for example, congressional districts 
when a state redraws its congressional district boundaries.

Geographies that commonly use geographic variants include: Congressional 
districts, state legislative districts, metropolitan/micropolitan statistical areas, ZIP Code 
tabulation areas (ZCTAs), urban areas, public use microdata areas (PUMAs), New England 
city and town areas (NECTAs).

You must specify the correct geographic variant when using the ucgid predicate for these 
types of geographies. If you are unsure which variant applies to a dataset, reference the 
section below: <u>Finding Fully Qualified GEO IDs</u>.

### Geographic Components

A geographic component is a subset of a given type of geographic area based on a certain 
geographic or population characteristic. For example, the geographic component “United 
States – Rural” is a geography selection representing the portion of the United States that falls 
within a rural area. Some common types of geographic components include: Urban, rural, in 
metropolitan/micropolitan statistical area, and not in metropolitan/micropolitan statistical 
area.

In most cases, the geographic component in the GEO ID will be 00, as they do not 
apply to data analyses for most data users.

### Finding Fully Qualified GEO IDs

The Census Bureau offers several options to find fully qualified GEO IDs for a particular 
geography:

1. TIGER/Line Shapefiles<sup>25</sup>: Reference the GEOIDFQ field

2. <u><strong>TIGER/Line Geodatabases<sup>26</sup>:</strong></u> Reference the GEOIDFQ field

<u><sup>25</sup>https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html</u>

<u><sup>26</sup>https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-geodatabase-file.html</u>

---

3. **API:** Include the **GEO_ID** variable in your API query. Example:
https://api.census.gov/data/2022/acs/acs5/profile?get=GEO_ID,NAME&for=congressio
<u>nal%20district:&#42;&#38;in=state:01</u>

```
api.census.gov/data/2022/acs/

api.census.gov/data/2022/acs/acs5/profile?get=GEO_ID,NAME&for=congressional%20district:*&in=state:01

Pretty-print

[["GEO ID","NAME","state","congressional district"],
["5001800US0101", "Congressional District 1 (118th Congress), Alabama","01","01"],
["5001800US0102", "Congressional District 2 (118th Congress), Alabama","01","02"],
["5001800US0103", "Congressional District 3 (118th Congress), Alabama","01","03"],
["5001800US0104", "Congressional District 4 (118th Congress), Alabama","01","04"],
["5001800US0105", "Congressional District 5 (118th Congress), Alabama","01","05"],
["5001800US0106", "Congressional District 6 (118th Congress), Alabama","01","06"],
["5001800US0107", "Congressional District 7 (118th Congress), Alabama","01","07"]]
```

**Figure 5: Example API Query and Output with GEO_ID Variable - All Congressional Districts in Alabama from 2022** 
**ACS 1-Year Data Profiles**

4. **data.census.gov:** Download the ZIP file for a table that includes your desired 
geographies. The GEO_ID column of the file will show the fully qualified GEO ID.

|  | A | B | C | D | E | F | G | H | I | J |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | GEO_ID | NAME | DP05_000: | DP05_000: | DP05_000: | DP05_000: | DP05_000: | DP05_000: | DP05_000: | DP05_000: |
| 2 | Geography | Geographic Area Name | Estimate!! | Margin of ! | Estimate!! | Margin of ! | Estimate!! | Margin of ! | Estimate!! | Margin |
| 3 | 5001800US0101 | Congressional District 1 (118th Congress), Alabama | 730935 | 3563 | 354674 | 2803 | 376261 | 2706 | 94.3 |  |
| 4 | 5001800US0102 | Congressional District 2 (118th Congress), Alabama | 723094 | 6735 | 350505 | 4263 | 372589 | 4996 | 94.1 |  |
| 5 | 5001800US0103 | Congressional District 3 (118th Congress), Alabama | 723164 | 3599 | 351194 | 2730 | 371970 | 3594 | 94.4 |  |
| 6 | 5001800US0104 | Congressional District 4 (118th Congress), Alabama | 727607 | 6177 | 354826 | 3920 | 372781 | 4037 | 95.2 |  |
| 7 | 5001800US0105 | Congressional District 5 (118th Congress), Alabama | 743238 | 3292 | 367176 | 2647 | 376062 | 3003 | 97.6 |  |
| 8 | 5001800US0106 | Congressional District 6 (118th Congress), Alabama | 710137 | 9406 | 343923 | 5893 | 366214 | 6157 | 93.9 |  |
| 9 | 5001800US0107 | Congressional District 7 (118th Congress), Alabama | 716121 | 12831 | 338950 | 7586 | 377171 | 7641 | 89.9 |  |
| 10 |  |  |  |  |  |  |  |  |  |  |
| 11 |  |  |  |  |  |  |  |  |  |  |

**Figure 6: Example ZIP Download Output from data.census.gov - All Congressional Districts in Alabama from 2022** 
**ACS 1-Year Data Profiles**

You may also find it helpful to review additional reference materials to understand GEO IDs:

• <u>Understanding Geographic Identifiers (GEOIDs)<sup>27</sup></u> geography webpage

• <u>American National Standards Institute (ANSI), Federal Information Process Series (FIPS),</u> 
<u>and Other Standardized Geographic Codes<sup>28</sup></u> geography webpage

<u><sup>27</sup>https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html</u>

<u><sup>28</sup>https://www.census.gov/library/reference/code-lists/ansi.html</u>

---

### Using ucgid for Collections of Geographies (Pseudo Geos)

The ucgid predicate also allows you to retrieve data for collections of geographies, such as All 
Counties within Maryland or All Census Tracts within Jessamine County, Kentucky. This 
functions similarly to using the wildcard functionality (*) when using the standard geography 
predicates (&for and &in) – except the ucgid predicate provides access to even more options to 
request data for collections of geographies. “All Census Tracts in the U.S.” or “All ZIP Code 
Tabulation Areas fully/partially within Maryland” are some examples of collections of 
geographies that are exclusively available by using ucgid.

Use the ucgid predicate: **_&ucgid=pseudo_** and in parentheses, enter the joined parent/child GEO 
IDs. In the below example, the ucgid predicate provides results for All Counties within 
Maryland:

*&ucgid=pseudo(0400000US24$0500000)*

https://api.census.gov/data/2022/acs/acs1/profile?get=NAME,DP05_0001E&ucgid=pse
<u><strong>udo(0400000US24$0500000)</strong></u>

GEO IDs for collections of geographies (pseudo geos), consist of:

• The fully qualified GEO ID of the parent geography. The parent geography is a single 
reference geography when considering whether other geographies intersect with it.

• A dollar sign ($) to represent the joining of two geographies.

• The 7-character ID representing the type of geographic area for the child geographies. 
Child geographies are the collection of geographic areas that intersect with the parent 
geography, meaning they are fully and/or partially contained within the parent 
geography.

As an example, consider the ucgid predicate for All Counties within Maryland:

*&ucgid=pseudo(0400000US24$0500000)*

• 0400000US24 = Fully qualified GEO ID for Maryland (parent geography)

• $ = Symbol that represents the joining of two geographies

• 0500000 = All Counties (child geography)*

*The first 3 characters always indicate the child geography’s summary level, in this case,
050 for counties. This is typically followed by four zeros, with a few exceptions noted in 
column B of the List of Available Collections of Geographies<sup>29</sup>.

The <u>List of Available Collections of Geographies<sup>30</sup></u> also provides documentation of each possible 
geography collection that can be used in the API. Please be aware that not every collection of

<u><sup>29</sup>https://www2.census.gov/data/api-documentation/list-of-available-collections-of-geographies.xlsx</u>

<u><sup>30</sup>https://www2.census.gov/data/api-documentation/list-of-available-collections-of-geographies.xlsx</u> geography is available for every dataset. In <u><em>most</em></u> cases, collections of geographies are 
supported when a dataset provides data for the both the parent and child summary levels.

**Table 2: Ucgid Examples for Collections of Geographies**

| Geography Collection Name | GEO ID for Geography Collection | Ucgid Predicate |
| --- | --- | --- |
| All Counties within Arkansas | 0400000US05$0500000 0400000US05 = Arkansas (parent geo) $0500000 = All counties (child geo) | &amp;ucgid=pseudo(0400000US05$0500000) |

| All Places within Louisiana | 0400000US22$1600000 0400000US22 = Louisiana (parent geo) $1600000 = All places (child geo) | &amp;ucgid=pseudo(0400000US22$1600000) |
| --- | --- | --- |

| All ZIP Code Tabulation Areas (ZCTAs) fully/partially within New Hampshire | 0400000US33$8600000 0400000US33 = New Hampshire (parent geo) $ 8600000 = All ZCTAs (child geo) | &amp;ucgid=pseudo(0400000US33$8600000) |
| --- | --- | --- |
| All Metropolitan and Micropolitan Statistical Areas fully/partially within Nebraska | 0400000US31$3100000 0400000US31= Nebraska (parent geo) $ 3100000 = All metro/micro areas (child geo) | &amp;ucgid=pseudo(0400000US31$3100000) |
| All Census Tracts within Jessamine County, Kentucky | 0500000US21113$1400000 0500000US21113 = Jessamine County (parent geo) $ 1400000 = All census tracts (child geo) | &amp;ucgid=pseudo(0500000US21113$1400000) |
| All Census Tracts fully/partially within Congressional District 1, Iowa | 5001800US1901$1400000 5001800US1901 = Congressional District 1, IA (parent geo) $ 1400000 = All census tracts (child geo) | &amp;ucgid=pseudo(5001800US1901$1400000) |
| All Block Groups within Census Tract 19, Fairbanks North Star Borough, Alaska | 1400000US02090001900$1500000 1400000US02090001900 = Census Tract 19, Fairbanks North Star Borough, AK (parent geo) | &amp;ucgid=pseudo(1400000US02090001900$1500000) |

---

Census Data API User Guide

| Geography Collection Name | GEO ID for Geography Collection | Ucgid Predicate |
| --- | --- | --- |
|  | $1500000 = All block groups (child geo) |  |
| All Blocks within Census Tract 9653.02, Somerset County, Maine | 1400000US23025965302$10000001400000US23025965302 = Census Tract 9965.02, Somerset County, ME (parent geo)$1000000 = All blocks (child geo) | &amp;ucgid=pseudo(1400000US23025965302$1000000) |

## Query Limits

You can include up to 50 variables in a single API query and can make up to 500 queries per IP 
address per day. More than 500 queries per IP address per day requires that you register for a 
Census key. That key will be part of your data request URL string.

Please keep in mind that all queries from a business or organization having multiple employees 
might employ a proxy service or firewall. This will make all of the users of that business or 
organization appear to have the same IP address.  If multiple employees were making queries, 
the 500-query limit would be for the proxy server/firewall, not the individual user.

You also need an API key if you create a mobile or web application that makes more than 500 
queries to the API in a day. This cumulative limit is reached by adding up all instances when the 
application queries the Census Data API, even if multiple users access your application through 
different IP addresses.

## API Key

You can register for an API key, free of charge by following these steps:

1. Go to the <u>Developers site<sup>31</sup></u>

2. Click on the **Request a KEY** box on the left side of the page.

3. Fill out the pop-up window form.

4. You will receive an email with your key code in the message and a link to register it.

Once, you have a key, insert **&key=** followed by your key code at the end of your API calls: 
**&key=your key here**

<u><sup>31</sup>http://www.census.gov/developers/</u>

---

## Resources for Learning More

#### How-To Materials for Using the Census API

▪ https://www.census.gov/data/what-is-data-census-gov/guidance-for-data-users/how-
<u>to-materials-for-using-the-census-api.html</u> Recorded webinars, short videos, and stepby-step PDF walkthroughs with screenshots

#### Dataset Discovery Tool:

▪ https://api.census.gov/data.html List of Census API Datasets

▪ https://api.census.gov/data.xml List of Census API Datasets in XML

▪ https://api.census.gov/data.json List of Census API Datasets in JSON

#### Census Data API Developers Page:

▪ https://www.census.gov/developers/

#### Convert JSON to CSV data:

▪ https://www.convertcsv.com/json-to-csv.htm

#### Guide to Accessing Census Data API via Python

▪ https://pypi.python.org/pypi/census/0.5

#### Census Bureau Geography

▪ https://www.census.gov/programs-surveys/geography.html

## Contact Us

If you have additional questions about the Census Data API, contact us by emailing
<u>census.data@census.gov</u>.