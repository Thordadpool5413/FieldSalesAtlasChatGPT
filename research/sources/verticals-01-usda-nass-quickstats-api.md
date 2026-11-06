Source: https://quickstats.nass.usda.gov/api
Title: USDA/NASS QuickStats Ad-hoc Query Tool
Fetched: 2026-11-06T05:52:46.080Z

/\\* The following is used for dendancies in build
"dojox.grid.DataGrid",
"dijit.layout.ContentPane",
"dijit.form.MultiSelect",
"dijit.form.ComboBox",
"dijit.form.Form",
"dojo.data.ItemFileReadStore",
"dijit.ProgressBar",
"dijit.layout.BorderContainer",
"dijit.\_Widget",
"dijit.Tree",
"dijit.form.TextBox",
"dijit.form.ValidationTextBox",
"dojox.validate.web",
"dojo.fx",
"dijit.Editor",
"dijit.\_editor.plugins.AlwaysShowToolbar",
"dijit.\_editor.plugins.EnterKeyHandling",
"dijit.\_editor.plugins.FontChoice", // 'fontName','fontSize','formatBlock'
"dijit.\_editor.plugins.TextColor",
"dijit.\_editor.plugins.LinkDialog",
"dojo.dnd.Container",
"dojo.dnd.Manager",
"dojo.dnd.Source",
"dijit.Menu",
"dojox.widget.PlaceholderMenuItem",
"dojo.parser"
 \*/




Quick Stats

# QuickStats API

The National Agricultural Statistics Service (NASS) offers Quick Stats, an on-line database containing official published aggregate estimates related to U.S. agricultural production. NASS develops these estimates from data collected through:

1. 1) hundreds of sample surveys conducted each year covering virtually every aspect of U.S. agriculture

2. 2) the Census of Agriculture conducted every five years providing state- and county-level aggregates


The Quick Stats application programming interface (API) provides direct access to the statistical information in the Quick Stats database. We invite developers to use this API and to give us feedback so we can continue to improve it.

#### About the Quick Stats API

To use the Quick Stats API, you must first agree to the and In registering for the key, you must provide a valid email address. You will have the option to request future email updates about the Quick Stats API.

Once you request the API key, we will email it and you can proceed immediately. Use the key in all future data requests as well.

To call the Quick Stats API, you may use either of the following:

- any language that supports HTTP GET request such as PHP, PERL, etc...

- JSON with padding or JSONP


Your request will return a maximum of 50,000 data records. You can determine the returned record account before you execute the Quick Stats API call using the GET /api/get\_counts function. If your request will return more than the maximum limit of 50,000 data records, you can do either of the following:

- Change the filtering criteria (the API input parameters and their values) to generate a smaller number of responses

- Download [the files](https://www.nass.usda.gov/datasets/) containing larger amounts of data extracted from the Quick Stats database.


**Using QuickStats API**

QuickStats API requests utilize input parameters based on the concept of What, Where and When.


- What parameters refer to a commodity, data item or subject area.

- Where parameters refer to a location or geographic level such as the entire United States, state, county, district, or ZIP code.

- When parameters refer to a time such as year and frequency such as monthly.


**QuickStats API Input**

The QuickStats API has three resources you can use to retrieve NASS published estimate data and properties, in combination with the "WHAT" and/or "WHERE" and/or "WHEN" parameters you specify. See [Parameter Definitions and Operators](https://quickstats.nass.usda.gov/api#param_define) for definitions and types. If you have not already
do so now before proceeding.

Here are the resources, their URIs and examples:

1. 1) GET  /api/api\_GET: accepts a combination of "WHAT" and/or "WHERE and/or "WHEN" parameters and return maximum of 50K records


``https://quickstats.nass.usda.gov/api/api\_GET/?key=api key&{parameter ... parameter}&format={json \| csv \| xml}&callback={function name}``

**_Note:_** _callback parameter needs only for using JSONP_





Example  of /api/api\_GET request and its output.







Close(X)



**Example of GET request corn of VA since 2012**







GET

`
https://quickstats.nass.usda.gov/api/api_GET/?key=api key&commodity_desc=CORN&year__GE=2012&state_alpha=VA&format=JSON

https://quickstats.nass.usda.gov/api/api_GET/?key=api key&commodity_desc=CORN&year__GE=2012&state_alpha=VA&format=XML

https://quickstats.nass.usda.gov/api/api_GET/?key=api key&commodity_desc=CORN&year__GE=2012&state_alpha=VA&format=CSV
`



**Example Output:**







JSON


{data:\[{"week\_ending":"","state\_name":"VIRGINIA","country\_code":"9000","begin\_code":"00", "sector\_desc":"CROPS","zip\_5":"","county\_ansi":"","state\_alpha":"VA","util\_practice\_desc":"ALL UTILIZATION PRACTICES","domain\_desc":"TOTAL","asd\_desc":"","freq\_desc":"ANNUAL","prodn\_practice\_desc":"ALL PRODUCTION PRACTICES","end\_code":"00","short\_desc":"CORN - ACRES PLANTED","country\_name":"UNITED STATES","Value":"510,000","reference\_period\_desc":"YEAR","source\_desc":"SURVEY","group\_desc":"FIELD CROPS","asd\_code":"","agg\_level\_desc":"STATE","Class\_desc":"ALL CLASSES","county\_name":"","region\_desc":"","watershed\_desc":"","state\_ansi":"51","congr\_district\_code":"","domaincat\_desc":"NOT SPECIFIED","watershed\_code":"00000000","commodity\_desc":"CORN","unit\_desc":"ACRES","load\_time":"2012-10-11 11:26:13","statisticcat\_desc":"AREA PLANTED","year":"2012"}\]}






CSV


"source\_desc","sector\_desc","group\_desc","commodity\_desc","class\_desc","util\_practice\_desc","prodn\_practice\_desc","statisticcat\_desc","unit\_desc","short\_desc","domain\_desc","domaincat\_desc","agg\_level\_desc","state\_ansi","state\_alpha","state\_name","asd\_code","asd\_desc","county\_ansi","county\_name","region\_desc","zip\_5","watershed\_code","watershed\_desc","congr\_district\_code","country\_code","country\_name","year","freq\_desc","begin\_code","end\_code","reference\_period\_desc","week\_ending","load\_time","Value"
"SURVEY","CROPS","FIELD CROPS","CORN","ALL CLASSES","ALL UTILIZATION PRACTICES","ALL PRODUCTION PRACTICES","AREA PLANTED","ACRES","CORN - ACRES PLANTED","TOTAL","NOT SPECIFIED","STATE","51","VA","VIRGINIA","","","","","","","00000000","","","9000","UNITED STATES","2012","ANNUAL","00","00","YEAR","","2012-10-11 11:26:13","510,000"
"SURVEY","CROPS","FIELD CROPS","CORN","ALL CLASSES","ALL UTILIZATION PRACTICES","ALL PRODUCTION PRACTICES","AREA PLANTED","ACRES","CORN - ACRES PLANTED","TOTAL","NOT SPECIFIED","STATE","51","VA","VIRGINIA","","","","","","","00000000","","","9000","UNITED STATES","2012","ANNUAL","00","00","YEAR - MAR FORECAST","","2012-04-24 12:56:11","500,000"






XML

`
<arrayref memory_address="0x6b53698">

<item key="0">

<hashref memory_address="0x70ee778">

<item key="class_desc">ALL CLASSES</item>

<item key="commodity_desc">CORN</item>

<item key="group_desc">FIELD CROPS</item>

<item key="source_desc">SURVEY</item>

<item key="sector_desc">CROPS</item>

<item key="Value">510,000</item>

<item key="agg_level_desc">STATE</item>

<item key="asd_code"/>

<item key="asd_desc"/>

<item key="begin_code">00</item>

<item key="congr_district_code"/>

<item key="country_code">9000</item>

<item key="country_name">UNITED STATES</item>

<item key="county_ansi"/>

<item key="county_name"/>

<item key="domain_desc">TOTAL</item>

<item key="domaincat_desc">NOT SPECIFIED</item>

<item key="end_code">00</item>

<item key="freq_desc">ANNUAL</item>

<item key="load_time">2012-10-11 11:26:13</item>

<item key="prodn_practice_desc">ALL PRODUCTION PRACTICES</item>

<item key="reference_period_desc">YEAR</item>

<item key="region_desc"/>

<item key="short_desc">CORN - ACRES PLANTED</item>

<item key="state_alpha">VA</item>

<item key="state_ansi">51</item>

<item key="state_name">VIRGINIA</item>

<item key="statisticcat_desc">AREA PLANTED</item>

<item key="unit_desc">ACRES</item>

<item key="util_practice_desc">ALL UTILIZATION PRACTICES</item>

<item key="watershed_code">00000000</item>

<item key="watershed_desc"/>

<item key="week_ending"/>

<item key="year">2012</item>

<item key="zip_5"/>

</hashref>

</item>

</arrayref>
`

2. 2) GET  /api/get\_param\_values: accepts a parameter name and return all possible values of the parameter.


``https://quickstats.nass.usda.gov/api/get\_param\_values/?key=api key&param={parameter}``

Example of get values of sector\_desc parameter:

    GET  https://quickstats.nass.usda.gov/api/get\_param\_values/?key=api key&param=sector\_desc

    Return {"sector\_desc":\["ANIMALS & PRODUCTS","CROPS","DEMOGRAPHICS","ECONOMICS","ENVIRONMENTAL"\]}

3. 3) GET  /api/get\_counts: accepts a combination of "WHAT" and/or "WHERE and/or "WHEN" parameters and return the number of counts


``https://quickstats.nass.usda.gov/api/get\_counts/?key=api key&{parameter ... parameter}``

Example of get number of rows of corn in VA since 2012:

    GET  https://quickstats.nass.usda.gov/api/get\_counts/?key=api key&commodity\_desc=CORN&year\_\_GE=2012&state\_alpha=VA

    Return {"count":"27"}


**QuickStats API Output**

- A request will return the published estimate for a given set of call parameters.

- The api\_GET resource supports three different output formats: JSON(default), XML or CSV.

- The output format is identified by using the format parameter in the API request


**`` Error messages**

Error messages that the API will return:

- "exceeds limit = 50000" - The request would return more than 50,000 records/rows.
- "bad request - invalid query" - There is an error in the query string, such as wrong parameter name or value.
- "bad request - unsupport media type" - The request format parameter is not JSON or CSV or XML.
- "unauthorized" - There is no key or invalid key parameter.

**QuickStats Parameter Definitions and Operators**

Listed below are the

available in QuickStats, along with their definitions, to use in defining your query, as well as the

to use within the parameters in the query string. The parameters correspond to the categories on the QuickStats application(e.g., \[Program\], \[Sector\], etc.)

Close(X)

**Quick Stats Column Definitions**

2/19/2013

The table below lists the columns
found on the Quick Stats search page and in Quick Stats data products.

1)All
columns shown are included in output from:

a)The [search page](https://quickstats.nass.usda.gov/) results "Spreadsheet" option

b)API calls
(also, the same columns are available for API input)

c)Tab
delimited ASCII text files downloadable from the [Data Set Download](https://www.nass.usda.gov/datasets/)

2)The
column or header names shown below in parentheses (e.g., (Program), (Sector),
etc.) are the corresponding headers found on the [search page](https://quickstats.nass.usda.gov/).

|     |     |     |
| --- | --- | --- |
| **Column or Header Name** | **Max Length** | **Definition** |
| The "WHAT" (or Commodity) dimension |
| source\_desc <br>(Program) | 60 | Source of data (CENSUS or SURVEY). Census program includes the Census<br>of Ag as well as follow up projects. Survey program includes national, state,<br>and county surveys. |
| sector\_desc <br>(Sector) | 60 | Five high<br>level, broad categories useful to narrow down choices (Crops, Animals & Products, Economics,<br>Demographics, and Environmental). |
| group\_desc <br>(Group) | 80 | Subsets within sector (e.g., under sector = Crops, the groups are Field<br>Crops, Fruit & Tree Nuts, Horticulture, and Vegetables). |
| commodity\_desc <br>(Commodity) | 80 | The primary subject of interest (e.g., CORN, CATTLE, LABOR, TRACTORS,<br>OPERATORS). |
| class\_desc | 180 | Generally a physical attribute (e.g., variety, size, color, gender)<br>of the commodity. |
| prodn\_practice\_desc | 180 | A method of production or action taken on the commodity (e.g., IRRIGATED,<br>ORGANIC, ON FEED). |
| util\_practice\_desc | 180 | Utilizations (e.g., GRAIN, FROZEN, SLAUGHTER) or marketing channels<br>(e.g., FRESH MARKET, PROCESSING, RETAIL). |
| statisticcat\_desc <br>(Category) | 80 | The aspect of a commodity being measured (e.g., AREA HARVESTED, PRICE<br>RECEIVED, INVENTORY, SALES). |
| unit\_desc | 60 | The unit associated with the statistic category (e.g., ACRES, $ / LB,<br>HEAD, $, OPERATIONS). |
| short\_desc <br>(Data Item) | 512 | A concatenation of six columns: commodity\_desc, class\_desc,<br>prodn\_practice\_desc, util\_practice\_desc, statisticcat\_desc, and unit\_desc. |
| domain\_desc <br>(Domain) | 256 | Generally another characteristic of operations that produce a<br>particular commodity (e.g., ECONOMIC CLASS, AREA OPERATED, NAICS<br>CLASSIFICATION, SALES). For chemical usage data, the domain describes the<br>type of chemical applied to the commodity. The domain = TOTAL will have no<br>further breakouts; i.e., the data value pertains completely to the<br>short\_desc. |
| domaincat\_desc (Domain Category) | 512 | Categories or partitions within a domain (e.g., under domain = Sales, domain categories include<br>$1,000 TO $9,999, $10,000 TO $19,999, etc). |
| The "WHERE" (or Location) dimension |
| agg\_level\_desc <br>(Geographic Level) | 40 | Aggregation level or geographic granularity of the data (e.g., State, Ag District, County, Region, Zip Code). |
| state\_ansi | 2 | American National Standards Institute (ANSI) standard 2-digit state<br>codes. |
| state\_fips\_code | 2 | NASS 2-digit state codes; include 99 and 98 for US TOTAL and OTHER<br>STATES, respectively; otherwise match ANSI codes. |
| state\_alpha | 2 | State abbreviation, 2-character alpha code. |
| state\_name <br>(State) | 30 | State full name. |
| asd\_code | 2 | NASS defined county groups, unique within a state, 2-digit ag<br>statistics district code. |
| asd\_desc <br>(Ag District) | 60 | Ag statistics district name. |
| county\_ansi | 3 | ANSI standard 3-digit county codes. |
| county\_code | 3 | NASS 3-digit county codes; includes 998 for OTHER (COMBINED) COUNTIES<br>and Alaska county codes; otherwise match ANSI codes. |
| county\_name <br>(County) | 30 | County name. |
| region\_desc <br>(Region) | 80 | NASS defined geographic entities not readily defined by other<br>standard geographic levels. A region can be a less than a state (Sub-State) or a group of states (Multi-State), and may be specific to<br>a commodity. |
| zip\_5 <br>(Zip Code) | 5 | US Postal Service 5-digit zip code. |
| watershed\_code | 8 | US Geological Survey (USGS) 8-digit Hydrologic Unit Code (HUC) for<br>watersheds. |
| watershed\_desc <br>(Watershed) | 120 | Name assigned to the HUC. |
| congr\_district\_code | 2 | US Congressional District 2-digit code. |
| country\_code | 4 | US Census Bureau, Foreign Trade Division 4-digit country code, as of<br>April, 2007. |
| country\_name | 60 | Country name. |
| location\_desc | 120 | Full description for the location dimension. |
| The "WHEN" (or Time) dimension |
| year <br>(Year) | 4 | The numeric year of the data. |
| freq\_desc <br>(Period Type) | 30 | Length of time covered (Annual,<br>Season, Monthly, Weekly, Point in Time). Monthly often covers more than one month. Point in Time is as of a particular<br>day. |
| begin\_code | 2 | If applicable, a 2-digit code corresponding to the beginning of the<br>reference period (e.g., for freq\_desc = Monthly,<br>begin\_code ranges from 01 (January) to 12 (December)). |
| end\_code | 2 | If applicable, a 2-digit code corresponding to the end of the<br>reference period (e.g., the reference period of Jan thru Mar will have begin\_code = 01 and end\_code = 03). |
| reference\_period\_<br>desc (Period) | 40 | The specific time frame, within a freq\_desc. |
| week\_ending | 10 | Week ending date, used when freq\_desc = Weekly. |
| load\_time | 19 | Date and time indicating when record was inserted into Quick Stats<br>database. |
| The Data Value |
| value | 24 | Published data value or suppression reason code. |
| CV % | 7 | Coefficient of variation. Available for the 2012 Census of Agriculture only. County-level CVs are generalized. |

Close(X)

### Operators

These operators can be used within parameters in the query string:

\_\_LE = <=

\_\_LT = <

\_\_GT = >

\_\_GE = >=

\_\_LIKE = like

\_\_NOT\_LIKE = not like

\_\_NE = not equal

Example of URI of get published statistics for corn in Virginia for years **greater than or equal** to 2010

``https://quickstats.nass.usda.gov/api/api\_GET/?key=api key&commodity\_desc=CORN& **year\_\_GE=2010**&state\_alpha=VA ``

To obtain an API key, please submit the form below then you will receive the key in your email.

|     |     |
| --- | --- |
| Name/Organization: | _(optional)_ |
| Email Address: | _(required)_ |
| Close(X)<br>**NASS API Terms of Service**<br>The National Agricultural Statistics Service (NASS), a sub-agency of the United States Department of Agriculture (USDA), collectively called "our" or "we," offers the general public, collectively referred to as "you," some of our public data in machine readable format via an Application Programming Interface (API). This service is offered subject to your acceptance of the terms and conditions contained herein as well as any relevant sections of the [USDA Web Privacy Policy](https://www.usda.gov/wps/portal/usda/usdahome?navtype=FT&navid=PRIVACY_POLICY) (collectively, the Agreement)<br>**Scope**<br>All of the content, documentation, code and related materials made available to you through the NASS API are subject to these terms. Access to or use of the NASS API or its content constitutes acceptance of this Agreement.<br>**Use**<br>You may use the NASS API to develop a service to search, display, analyze, retrieve, view and otherwise 'get' information from NASS data<br>**Attribution**<br>All services which utilize or access the API should display the following notice prominently within the application: "This product uses the NASS API but is not endorsed or certified by NASS." You may use the NASS name in order to identify the source of API content, subject to these rules. You may not use the NASS name to imply endorsement of any product, service, or entity (not-for-profit, commercial or otherwise).<br>**Modification or False Representation of Content**<br>You may not modify or falsely represent content accessed through the NASS API and still claim the source is NASS.<br>**Right to Limit**<br>Your use of the NASS API may be subject to certain limitations on access, calls, or use as set forth within this Agreement or otherwise provided by NASS. If we reasonably believe that you have attempted to exceed or circumvent these limits, your ability to use the NASS API may be permanently or temporarily blocked. We may monitor your use of the API to improve the service or to insure compliance with this Agreement.<br>**Service Termination**<br>If you wish to terminate this Agreement, you may do so by not using the NASS API. We reserve the right (though not the obligation) to (1) refuse to provide the NASS API to you, if it is our opinion that your use violates any of our policies, or (2) terminate or deny you access to and use of all or part of the NASS API at any time for any other reason at our sole discretion. All provisions of this Agreement which by their nature should survive termination shall survive termination including, without limitation, warranty disclaimers, indemnity, and limitations of liability.<br>**Changes**<br>We reserve the right, at our sole discretion, to modify or replace this Agreement, in whole or in part. Your continued use of or access to the NASS API following posting of any changes to this Agreement constitutes acceptance of those modified terms. We may, in the future, modify or offer new services and/or features through the NASS API. Such new features and/or services shall be subject to the terms and conditions of this Agreement.<br>**Disclaimer of Warranties**<br>The NASS API is provided âas isâ and on an "as-available" basis. We hereby disclaim all warranties of any kind, express or implied, including without limitation the warranties of merchantability, fitness for a particular purpose, and non-infringement. We make no warranty that the NASS API will be error-free, that the underlying data will be error-free, or that access thereto will be continuous or uninterrupted.<br>**Limitations on Liability**<br>In no event will we be liable with respect to any subject matter of this Agreement under any contract, negligence, strict liability or other legal or equitable theory for (1) any special, incidental, or consequential damages; (2) the cost of procurement of substitute products or services; or (3) interruption of use or loss or corruption of data.<br>**General Representations**<br>You hereby warrant that (1) your use of the NASS API will be in strict accordance with the USDA Privacy Policy, this Agreement, and all applicable laws and regulations, and (2) your use of the NASS API will not infringe or misappropriate the intellectual property rights of any third party. <br>**Indemnification**<br>You agree to indemnify and hold harmless NASS, its contractors, employees, agents, and the like from and against any and all claims and expenses, including attorney's fees, arising out of your use of the NASS API, including but not limited to violation of this Agreement.<br>**Miscellaneous**<br>This Agreement constitutes the entire Agreement between NASS and you concerning the subject matter hereof, and may only be modified by the posting of a revised version on this page by NASS.<br>**Disputes**<br>Any disputes arising out of this Agreement and access to or use of the NASS API shall be governed by federal law.<br>**No Waiver of rights**<br>Our failure to exercise or enforce any right or provision of this Agreement shall not constitute waiver of such right or provision.<br> Do you agree with Terms of Service? | YesNo |
| Check if you want to receive updates via email |  |
| ●Submit |

**NASS API Terms of Service**

The National Agricultural Statistics Service (NASS), a sub-agency of the United States Department of Agriculture (USDA), collectively called "our" or "we," offers the general public, collectively referred to as "you," some of our public data in machine readable format via an Application Programming Interface (API). This service is offered subject to your acceptance of the terms and conditions contained herein as well as any relevant sections of the [USDA Web Privacy Policy](https://www.usda.gov/wps/portal/usda/usdahome?navtype=FT&navid=PRIVACY_POLICY) (collectively, the Agreement)

**Scope**

All of the content, documentation, code and related materials made available to you through the NASS API are subject to these terms. Access to or use of the NASS API or its content constitutes acceptance of this Agreement.

**Use**

You may use the NASS API to develop a service to search, display, analyze, retrieve, view and otherwise 'get' information from NASS data

**Attribution**

All services which utilize or access the API should display the following notice prominently within the application: "This product uses the NASS API but is not endorsed or certified by NASS." You may use the NASS name in order to identify the source of API content, subject to these rules. You may not use the NASS name to imply endorsement of any product, service, or entity (not-for-profit, commercial or otherwise).

**Modification or False Representation of Content**

You may not modify or falsely represent content accessed through the NASS API and still claim the source is NASS.

**Right to Limit**

Your use of the NASS API may be subject to certain limitations on access, calls, or use as set forth within this Agreement or otherwise provided by NASS. If we reasonably believe that you have attempted to exceed or circumvent these limits, your ability to use the NASS API may be permanently or temporarily blocked. We may monitor your use of the API to improve the service or to insure compliance with this Agreement.

**Service Termination**

If you wish to terminate this Agreement, you may do so by not using the NASS API. We reserve the right (though not the obligation) to (1) refuse to provide the NASS API to you, if it is our opinion that your use violates any of our policies, or (2) terminate or deny you access to and use of all or part of the NASS API at any time for any other reason at our sole discretion. All provisions of this Agreement which by their nature should survive termination shall survive termination including, without limitation, warranty disclaimers, indemnity, and limitations of liability.

**Changes**

We reserve the right, at our sole discretion, to modify or replace this Agreement, in whole or in part. Your continued use of or access to the NASS API following posting of any changes to this Agreement constitutes acceptance of those modified terms. We may, in the future, modify or offer new services and/or features through the NASS API. Such new features and/or services shall be subject to the terms and conditions of this Agreement.

**Disclaimer of Warranties**

The NASS API is provided âas isâ and on an "as-available" basis. We hereby disclaim all warranties of any kind, express or implied, including without limitation the warranties of merchantability, fitness for a particular purpose, and non-infringement. We make no warranty that the NASS API will be error-free, that the underlying data will be error-free, or that access thereto will be continuous or uninterrupted.

**Limitations on Liability**

In no event will we be liable with respect to any subject matter of this Agreement under any contract, negligence, strict liability or other legal or equitable theory for (1) any special, incidental, or consequential damages; (2) the cost of procurement of substitute products or services; or (3) interruption of use or loss or corruption of data.

**General Representations**

You hereby warrant that (1) your use of the NASS API will be in strict accordance with the USDA Privacy Policy, this Agreement, and all applicable laws and regulations, and (2) your use of the NASS API will not infringe or misappropriate the intellectual property rights of any third party.

**Indemnification**

You agree to indemnify and hold harmless NASS, its contractors, employees, agents, and the like from and against any and all claims and expenses, including attorney's fees, arising out of your use of the NASS API, including but not limited to violation of this Agreement.

**Miscellaneous**

This Agreement constitutes the entire Agreement between NASS and you concerning the subject matter hereof, and may only be modified by the posting of a revised version on this page by NASS.

**Disputes**

Any disputes arising out of this Agreement and access to or use of the NASS API shall be governed by federal law.

**No Waiver of rights**

Our failure to exercise or enforce any right or provision of this Agreement shall not constitute waiver of such right or provision.