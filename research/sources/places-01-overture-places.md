Source: https://docs.overturemaps.org/guides/places
Title: Overview | Overture Documentation
Fetched: 2026-11-06T05:52:54.009Z

[Skip to main content](https://docs.overturemaps.org/guides/places/#__docusaurus_skipToContent_fallback)

On this page

The Overture places theme contains tens of millions of point representations of real-world entities: schools, businesses, hospitals, religious organizations, landmarks, mountain peaks, and much more. The theme is published under the [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/) and [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) licenses. It contains no OpenStreetMap data and carries none of the share-alike obligations of the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).

| ![Overture places theme coverage](https://docs.overturemaps.org/assets/images/places-oct-coverage-32b78ab2912b5e8cdde98816c16952b7.png) |
| --- |
| _Overture places data, October 2026_ |

| Sources | License | feature count, October 2026 |
| --- | --- | --- |
| AllThePlaces, Overture | CC0-1.0 | 1,930,432 |
| Birdeye, Overture | CDLA-Permissive-2.0 | 11,855 |
| BrightQuery, Overture | CDLA-Permissive-2.0 | 15,771,907 |
| DAC, Overture | CDLA-Permissive-2.0 | 148,771 |
| Foursquare, Overture | Apache-2.0 | 3,757,439 |
| Krick, Overture | CDLA-Permissive-2.0 | 13,576 |
| Microsoft, Overture | CDLA-Permissive-2.0 | 5,883,421 |
| OpenTravel, Overture | CDLA-Permissive-2.0 | 2,698 |
| PinMeTo, Overture | CDLA-Permissive-2.0 | 170,156 |
| RenderSEO, Overture | CDLA-Permissive-2.0 | 3,695 |
| Uberall, Overture | CDLA-Permissive-2.0 | 424,600 |
| meta, Overture | CDLA-Permissive-2.0 | 60,299,571 |

Overture defines a place as a _concrete, physically identifiable, stationary destination in a publicly observable space_. The [next section](https://docs.overturemaps.org/guides/places/#what-is-a-place) unpacks that definition and how it draws the line between places and Overture's other themes.

## In this guide [​](https://docs.overturemaps.org/guides/places/\#in-this-guide "Direct link to In this guide")

- **[What is a place?](https://docs.overturemaps.org/guides/places/#what-is-a-place)**: How Overture defines a place, and what belongs in other themes instead.
- **[Dataset description](https://docs.overturemaps.org/guides/places/#dataset-description)**: The place feature type, its core properties, and column definitions.
- **[Category taxonomy](https://docs.overturemaps.org/guides/places/#category-taxonomy)**: The new `taxonomy` and `basic_category` properties, the removal of `categories`, and how to migrate.
- **[Sources and licensing](https://docs.overturemaps.org/guides/places/#sources-and-licensing)**: Where the data comes from and the licenses it carries.
- **[How we build the dataset](https://docs.overturemaps.org/guides/places/#how-we-build-the-dataset)**: The conflation pipeline, how matching quality is measured, and the confidence score.
- **[Coverage and data quality](https://docs.overturemaps.org/guides/places/#coverage-and-data-quality)**: What the theme covers and its known quality issues.
- **[Release artifacts and updates](https://docs.overturemaps.org/guides/places/#release-artifacts-and-updates)**: Monthly cadence, GERS registry, bridge files, and the changelog.
- **[Data access and retrieval](https://docs.overturemaps.org/guides/places/#data-access-and-retrieval)**: Cloud locations and options for downloading just the data you need.
- **[Querying and analysis](https://docs.overturemaps.org/guides/places/#querying-and-analysis)**: Example queries by property, plus advanced examples combining places with other datasets.
- **[Tools and libraries](https://docs.overturemaps.org/guides/places/#tools-and-libraries)**: Tools from Overture and the wider ecosystem, including the interactive [Taxonomy Explorer](https://docs.overturemaps.org/guides/places/taxonomy-explorer/).

## What is a place? [​](https://docs.overturemaps.org/guides/places/\#what-is-a-place "Direct link to What is a place?")

Each part of Overture's definition of a place, a _concrete, physically identifiable, stationary destination in a publicly observable space_, does deliberate work:

- **Concrete and physically identifiable** excludes abstract entities such as administrative areas (countries, states, cities, and neighborhoods, covered by the [divisions theme](https://docs.overturemaps.org/guides/divisions/)) and standalone address points, covered by the [addresses theme](https://docs.overturemaps.org/guides/addresses/).
- **Stationary** excludes movable things such as food carts, vehicles, boats, and aircraft that often appear in user-generated content datasets.
- **Destination** excludes bus stops, train platforms, and other intermediate waypoints, most of which live in the base theme's [infrastructure feature type](https://docs.overturemaps.org/guides/base/infrastructure/) under the `transit` subtype.
- **Publicly observable** excludes non-public spaces such as private residences, even when they are otherwise identifiable destinations.

Finally, only places that do not include personally identifiable information (PII) are included in the theme.

The public observability requirement reflects a principle that applies across all of Overture's data:

> Overture Maps Foundation focuses on map data about physical objects that can be publicly observed and are relevant to map applications. Our goal is to collect high quality data that reflects the physical world as it changes. We do not collect or publish data about non-public spaces or objects. If something is not observable from a publicly accessible area, it does not fit in Overture's datasets.

Places is not the only Overture theme with point data. Addresses are published as point features, divisions include point representations of populated places, and the base theme contains points for natural and infrastructure features. Some real-world entities appear in more than one theme by design: a mountain peak, for example, is in places as a destination and in the base theme's land type as a physical feature. What distinguishes a places record is what it carries (a name, taxonomy, an existence confidence score, and a GERS-matched identity) rather than the kind of point it marks.

## Dataset description [​](https://docs.overturemaps.org/guides/places/\#dataset-description "Direct link to Dataset description")

### Feature type descriptions [​](https://docs.overturemaps.org/guides/places/\#feature-type-descriptions "Direct link to Feature type descriptions")

The places theme defines a single feature type, **place**, a point representation of a real-world entity carrying attributes such as name, categories, address, and an existence confidence score along with a point geometry.

#### Core properties [​](https://docs.overturemaps.org/guides/places/\#core-properties "Direct link to Core properties")

While the schema defines many properties, a small set is core to how the dataset is built and used:

- **Matching**: the matcher relies on `names`, `addresses`, `websites`, `phones`, the category (`taxonomy`), and the point geometry itself to decide whether two provider records describe the same real-world place. Completeness of these properties directly affects data quality. Records missing them are harder to deduplicate and more likely to persist as duplicates.
- **Identity**: `id` carries the place's GERS ID, which anchors its identity across releases and is the join key for bridge files and the changelog.
- **Filtering**: `confidence` is the primary tool for separating reliable records from suspect ones (see [Confidence score](https://docs.overturemaps.org/guides/places/#confidence-score)).

The remaining properties are descriptive enrichment. They are useful where present, but not load-bearing for dataset construction.

### Column definitions [​](https://docs.overturemaps.org/guides/places/\#column-definitions "Direct link to Column definitions")

Column definitions for the `place` type are generated from the schema and live in the [schema reference](https://docs.overturemaps.org/schema/reference/places/place/).

## Category taxonomy [​](https://docs.overturemaps.org/guides/places/\#category-taxonomy "Direct link to Category taxonomy")

The Overture Place Categories (OPC) taxonomy is a hierarchical system of roughly 2,300 categories, with broader/narrower relationships, for organizing points of interest: businesses, landmarks, attractions, and so on. It is expressed in the places schema through the `taxonomy` and `basic_category` properties, which were introduced to better categorize location entities and to facilitate search, display, and navigation in map applications.

These properties are the product of a taxonomy redesign architected by Ron Rice, the taxonomist at Meta who leads the OPC work. The redesign addresses known issues with the original `categories` property, including structural inconsistencies, naming ambiguity, and coverage gaps, and applies taxonomy design best practices to improve structure for generalization (rolling up) and specialization (drilling down), compatibility across Overture themes, support for user discovery and visualization, and interoperability with other industry taxonomies.

Removed

The `categories` property has been removed from the places schema as of the **September 2026 release**, replaced by the `basic_category` and `taxonomy` properties. Users still reading `categories` should migrate to `taxonomy` (and `basic_category` where a simpler label suffices); see the mapping and migration notes below. You can explore the old-to-new category mappings [here](https://docs.google.com/spreadsheets/d/1_i2S48zTDoHff0uX-d8Nes3bR-Xee8drx27Gyi80CQ0/edit?usp=sharing0). We'd love your [feedback](https://github.com/orgs/OvertureMaps/discussions) on the new structure and suggestions for further improvement.

### Taxonomy change summary [​](https://docs.overturemaps.org/guides/places/\#taxonomy-change-summary "Direct link to Taxonomy change summary")

Users should be aware of the following key updates when evaluating and integrating the new places taxonomy.

| Change area | Details | Impact on Data Use |
| --- | --- | --- |
| Top-Level Overhaul (L0) | Reduced top-level categories from 22 to 13. | Requires updating logic dependent on L0 categories. Consolidation reduces ambiguity. |
| New Categories | 209 new categories added (e.g., artist\_studio, pickleball\_court). | New, more granular POI types are available for filtering and display. |
| Removed Categories | 80 categories removed (resolved duplicates, merged obscure types). | Users must use the provided "redirect" rules to map old category IDs to active categories for backfill/historical data continuity. |
| Renamed Categories | 407 categories renamed (primarily plural-to-singular conversion, e.g., banks to bank). | Update category-based lookups and display logic to use singular forms for better mapping interface labeling. |
| Reparented Categories | 482 categories moved under a different direct parent. | The immediate parent-child relationship has changed for nearly 500 categories. |
| Repathed Categories (Hierarchy) | 2,108 categories have a different hierarchical structure or "path". | Critical: Hierarchy-dependent processing (e.g., aggregation) must be updated to reflect the new paths, especially in areas like food\_and\_drink and arts\_and\_entertainment. |
| Basic Category Mapping | All place categories are now mapped to a "Basic Level Category" (approx. 280 labels like restaurant, museum). | Facilitates simplified map iconography, high-level filtering, and cross-taxonomy mapping. |

### Comparing the original and new properties [​](https://docs.overturemaps.org/guides/places/\#comparing-the-original-and-new-properties "Direct link to Comparing the original and new properties")

#### Original categories system [​](https://docs.overturemaps.org/guides/places/\#original-categories-system "Direct link to Original categories system")

Prior to the September 2026 release, the schema included a `categories` property, shown below, to allow users to compare the old system to the new taxonomy and facilitate migration. It has since been removed.

```text
properties:

    categories:

        primary: greasy_diner
```

#### New basic level category [​](https://docs.overturemaps.org/guides/places/\#new-basic-level-category "Direct link to New basic level category")

The new `basic_category`, introduced in the October release, provides a single, high-level, "cognitively basic" label.

```text
properties:

    basic_category: casual_eatery
```

#### New taxonomy structure [​](https://docs.overturemaps.org/guides/places/\#new-taxonomy-structure "Direct link to New taxonomy structure")

The new `taxonomy` property, introduced in the December 2025 release, contains a new hierarchy and category labels.

```text
properties:

    basic_category: casual_eatery

    taxonomy:

        hierarchy: [food_and_drink, restaurant, casual_eatery, gas_station_sushi]

        primary: gas_station_sushi

        alternates:

            - gas_station

            - sushi_restaurant
```

### Key taxonomy fields [​](https://docs.overturemaps.org/guides/places/\#key-taxonomy-fields "Direct link to Key taxonomy fields")

- `hierarchy`: An ordered list representing the full path from the top-level (L0) category down to the primary category. This array is essential for aggregating POIs based on subtype/supertype relationships (e.g., for aggregating all cantonese\_restaurant POIs up to chinese\_restaurant).
- `primary`: The most specific and appropriate category label for the POI, consistent with the lowest level of the hierarchy.
- `basic_category`: Identifies a "cognitively basic" category, as a supplement to the primary place category. This is recommended for use in map applications for high-level filtering and defining map iconography, and for LLMs, as it offers a streamlined set of labels (approx. 280) that are less specific than the full 2.1k taxonomy.
- `alternates`: Other relevant category labels for the POI.

### What are basic-level categories? [​](https://docs.overturemaps.org/guides/places/\#what-are-basic-level-categories "Direct link to What are basic-level categories?")

The `basic_category` property draws on basic-level categorization, a model from cognitive science which asserts that some categories are more _cognitively basic_ than others, requiring the least mental processing. Asked "what are you sitting on," most people say _chair_ rather than a narrower term like _kitchen chair_ or a broader term like _furniture_. The same principle applies to places: asked "where are you going," a term like _restaurant_ comes more easily than a narrow term like _sushi restaurant_ or a broad term like _food and beverage establishment_. Basic place categories are often (but not always) one-word terms like _hotel_, _farm_, _bar_, _cafe_, _park_, _hospital_, and _museum_.

Every basic category is also a category in the full OPC taxonomy: about 300 of the roughly 2,300 OPC categories (13%) are basic-level, and they sit in the middle of the hierarchy, not too broad and not too narrow, typically one or two levels below the top level. Examples include casual\_eatery > cafe, historic\_site > castle, market > farmers\_market, park > playground, and lodging > hotel. Every OPC category can therefore be described as superordinate (more general than basic), basic, or subordinate (more specific than basic). For example: arts\_and\_entertainment (superordinate) > museum (basic) > art\_museum (subordinate).

### Aggregation and generalization [​](https://docs.overturemaps.org/guides/places/\#aggregation-and-generalization "Direct link to Aggregation and generalization")

The structured `hierarchy` property is designed to support robust aggregation logic. Users can reliably generalize specialized POIs by traversing the path. For example, you can find all Asian restaurants by traversing the `hierarchy` property of POIs and checking for `asian_restaurant`.

| Hierarchy Path | Aggregation Level |
| --- | --- |
| \[food\_and\_drink, ...\] | Food and Drink POIs |
| \[..., restaurant, ...\] | All Restaurants |
| \[..., asian\_restaurant, ...\] | All Asian Restaurants |
| \[..., chinese\_restaurant, ...\] | All Chinese Restaurants |
| \[..., cantonese\_restaurant\] | Specific Cantonese Restaurants |

### Top-level category counts [​](https://docs.overturemaps.org/guides/places/\#top-level-category-counts "Direct link to Top-level category counts")

| Top Level Taxonomy | feature count, October 2026 |
| --- | --- |
| Services and Business | 23,685,854 |
| Shopping | 15,290,245 |
| Food and Drink | 10,991,382 |
| Health Care | 5,951,686 |
| Lifestyle Services | 5,538,364 |
| Travel and Transportation | 4,570,596 |
| Education | 3,772,770 |
| Cultural and Historic | 3,286,267 |
| Sports and Recreation | 3,249,641 |
| Lodging | 3,063,219 |
| Community and Government | 2,966,696 |
| Arts and Entertainment | 1,773,417 |
| Geographic Entities | 1,028,881 |

### Provider category mappings [​](https://docs.overturemaps.org/guides/places/\#provider-category-mappings "Direct link to Provider category mappings")

Each data provider describes places using its own category system, so during ingest every provider's raw categories are mapped into the Overture taxonomy. Most of these mappings are exact or previously reviewed matches; the remainder are model-derived semantic matches that are held to a confidence floor and reviewed before becoming permanent lookups.

Beginning with the July 2026 release, Overture also captures these provider category mappings in the pipeline, making it possible to trace how a source provider's original category was translated into the Overture taxonomy.

### Taxonomy roadmap [​](https://docs.overturemaps.org/guides/places/\#taxonomy-roadmap "Direct link to Taxonomy roadmap")

The taxonomy is maintained on a quarterly release cycle, with updates in March, June, September, and December of each year. The emphasis going forward is on expansion for interoperability and on adding definitions that clarify each category's scope and meaning. Planned infrastructure work includes migrating taxonomy management from spreadsheets to GitHub with semi-automated integration into the schema and documentation, a governance framework covering how stakeholders give feedback and how changes are submitted, evaluated, approved, and communicated, and a taxonomy reconciliation hub: a single source of record for industry taxonomies and their mappings, with hybrid curated and AI-assisted alignment.

## Sources and licensing [​](https://docs.overturemaps.org/guides/places/\#sources-and-licensing "Direct link to Sources and licensing")

The places theme is built from a variety of data providers. Its primary source is Meta, which contributes the large majority of place records (roughly 60 million of the ~88 million total), followed by BrightQuery (roughly 16 million), alongside Microsoft, Foursquare, and PinMeTo, together with a number of smaller aggregators and providers such as AllThePlaces, Uberall, DAC, Krick, Birdeye, RenderSEO, and OpenTravel. The theme does not include OpenStreetMap data.

Places is published under the [CDLA Permissive 2.0](https://cdla.dev/permissive-2-0/) and [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) licenses, depending on the source. For full per-source licensing information, see the [licensing and attribution page](https://docs.overturemaps.org/attribution/).

Note: Joining CDLA Permissive 2.0 data to OpenStreetMap is permitted, but the resulting data may need to carry the Open Database License (ODbL) if it is a derivative database. See the [OSM Collective Database Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline) for more information.

## How we build the dataset [​](https://docs.overturemaps.org/guides/places/\#how-we-build-the-dataset "Direct link to How we build the dataset")

Because multiple providers contribute records describing overlapping sets of real-world places, the central problem in building the dataset is **conflation**: determining which records refer to the same real-world entity. Conflation quality matters beyond deduplication. It is key to GERS stability, because a place whose records are conflated consistently keeps the same GERS ID from release to release, while inconsistent conflation causes identities to split or merge as source data shifts.

**Matching.** Places use **ML-based matching with clustering** to identify records from different providers that describe the same real-world place. The full conflation pipeline is described in the next section.

**Merging.** For matched places, a single source is promoted rather than combining attributes. Matched places are clustered, the place from the source with the highest match count is promoted, and no attributes are merged between matches.

### The conflation pipeline [​](https://docs.overturemaps.org/guides/places/\#the-conflation-pipeline "Direct link to The conflation pipeline")

Each provider feed passes through a four-stage pipeline on its way into the corpus:

1. **History matches.** Incoming records are first checked for exact matches with places already in the corpus. For a provider that is already in the corpus, roughly 90% of feed records are history matches; only the remaining ~10% of new records continue through the stages below.
2. **Blocking.** A pre-filter narrows down the number of possible pairs. Comparing every place to every other place is computationally irresponsible , so the matcher first narrows the search to a set of candidate pairs. Candidates are identified spatially, then filtered by a trained blocking model that uses embedding representations of each place's name, category (taxonomy), and address, together with distance thresholds. The blocking stage is tuned for high recall: it aims to keep every plausible duplicate pair in play for the pairwise stage, including pairs at longer distances that earlier versions of the matcher missed.
3. **Pairwise matching.**Each candidate pair is then scored by a gradient-boosted decision tree (XGBoost) classifier that predicts whether the two records represent the same place. The model combines attribute-similarity features, including:
   - name similarity, using both string comparison (with common "core words" like _shop_ or _restaurant_ handled separately) and text-embedding similarity;
   - address similarity;
   - website features, comparing domains and paths;
   - phone number;
   - category similarity, using embeddings of each record's primary taxonomy category;
   - spatial distance and spatial context (how distinctive a name is within its local area).
4. **Clustering and promotion.** Pairs the model scores as matches are grouped into clusters, resolving chains of matches into a single entity (if record _a_ matches record _b_ and record _c_ matches record _b_, all three form one cluster). Each cluster becomes a single place in the released dataset, following the merging rule above: the record from the source with the highest match count in the cluster is promoted, and its GERS ID carries the cluster's identity forward across releases.

### How matching quality is measured and improved [​](https://docs.overturemaps.org/guides/places/\#how-matching-quality-is-measured-and-improved "Direct link to How matching quality is measured and improved")

The matching model is trained and evaluated on a large set of human- and LLM-generated match labels sampled across providers, countries, and categories. Human labels come from an in-house Overture labeling team working with purpose-built pairwise labeling and QA tools. Because human labeling is slow and costly, Overture also generates labels at scale with LLMs, using an iteratively optimized prompt built around an evidence hierarchy (functional identity, phone, name uniqueness and distance, and supporting signals such as website, category, and brand). In production, two independent models label each pair; agreements are accepted automatically and disagreements go to human review, which keeps accuracy high while automating the large majority of labeling work.

These labels make conflation quality measurable, turning matching from an ambiguous production problem into a tractable optimization task. Mapping the true distribution of matches by name similarity and pair distance showed that the previous pipeline suffered from _undermatching_, cases where two records for the same place were not recognized as duplicates, especially when records are more than 100 meters apart or have only moderately similar names, and that the blocking stage was the largest bottleneck.

The matching pipeline was substantially upgraded in the July 2026 release to address these gaps. Better matching also improves GERS ID consistency over time, because a place is less likely to split into (or merge from) multiple identities as source data shifts. Note that the July 2026 release itself re-matches the corpus with the new pipeline, so users should expect a one-time elevated level of GERS ID churn in that release; subsequent releases benefit from the more stable matching.

### Confidence score [​](https://docs.overturemaps.org/guides/places/\#confidence-score "Direct link to Confidence score")

The places theme includes an existence confidence score for each feature, a value between 0 and 1 representing the likelihood that the place exists. Confidence measures existence only, whether the record describes a real place rather than junk, and is independent of other attributes such as `operating_status`. A score of 0 means we are certain the place does not exist; a missing value means no confidence information is available.

Confidence values derive from a mix of provider-supplied signals and internal scoring, and are not calibrated to be strictly comparable across providers. Treat the score as a relative filtering tool rather than a precise probability: raising the threshold trades coverage for precision. You can use `confidence` to filter out data below whatever threshold suits your use case.

## Coverage and data quality [​](https://docs.overturemaps.org/guides/places/\#coverage-and-data-quality "Direct link to Coverage and data quality")

**Coverage.** The places theme provides **global** coverage. Ongoing coverage measurements are in progress, and updated country-level figures will be published here as they are confirmed.

**Known quality issues.** Places is known to contain duplicates, a high junk rate, and low property completeness. The confidence score (above) is the primary tool for filtering potential junk data; it does not address duplicates or property completeness.

## Release artifacts and updates [​](https://docs.overturemaps.org/guides/places/\#release-artifacts-and-updates "Direct link to Release artifacts and updates")

The places theme is released on a **monthly** cadence. Alongside the data, the following release artifacts are provided:

- **[GERS registry](https://docs.overturemaps.org/gers/registry/)**: Place features are included in the GERS registry.
- **[GERS IDs](https://docs.overturemaps.org/gers/)**: Assigned to place features.
- **[Bridge files](https://docs.overturemaps.org/gers/bridge-files/)**: Provided.
- **[Data changelog](https://docs.overturemaps.org/gers/changelog/)**: A changelog accompanies each release.

## Data access and retrieval [​](https://docs.overturemaps.org/guides/places/\#data-access-and-retrieval "Direct link to Data access and retrieval")

Overture's places theme data is freely available on both Amazon S3 and Microsoft Azure Blob Storage at these locations:

| provider | location |
| --- | --- |
| Amazon S3 | ```text<br>s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*<br>``` |
| Azure Blob Storage | ```text<br>https://overturemapswestus2.blob.core.windows.net/release/2026-10-21.0/theme=places/type=place/*<br>``` |

Releases are published under dated paths. Rather than hard-coding a specific release date, you can use [Overture's STAC catalog](https://stac.overturemaps.org/) to discover the latest release and its assets programmatically.

More information can be found in the [Getting Overture Data](https://docs.overturemaps.org/getting-data/cloud-sources/) section of this documentation. You can download the entire dataset directly from the S3 or Azure locations above. Warning: the output will be a very large file.

We recommend downloading only the Overture data you need. If you have a particular geographic area of interest, there are several options for using a simple bounding box to extract places data and output a GeoJSON file.

- Overture Maps Explorer
- Python Client
- DuckDB

To quickly view and download modest amounts of data, you can use the [Overture Maps Explorer website](https://explore.overturemaps.org/#15.07/41.89731/12.47626).

To download data: Pan to the area you are interested in, turn off the other layers, then click `Download Visible`.

This will download the area visible on your screen.

First, follow the [setup guide for the Python Client](https://docs.overturemaps.org/getting-data/overturemaps-py/).

Simply alter the `bbox` value to download a particular area.

```text
overturemaps download --bbox=12.46,41.89,12.48,41.91 -f geojson --type=place -o rome.geojson
```

First, follow the [setup guide for DuckDB](https://docs.overturemaps.org/getting-data/duckdb/).

Replace the `bbox.xmin` and `bbox.ymin` values with a new bounding box to run the query for a different area.

```sql
LOAD spatial; -- noqa

LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';

COPY (

    SELECT

       id,

       version,

    -- We are casting these columns to JSON in order to ensure compatibility with our GeoJSON output.

    -- These conversions may be not necessary for other output formats.

       CAST(names AS JSON) AS names,

       basic_category,

       CAST(taxonomy AS JSON) AS taxonomy,

       confidence,

       CAST(websites AS JSON) AS websites,

       CAST(socials AS JSON) AS socials,

       CAST(emails AS JSON) AS emails,

       CAST(phones AS JSON) AS phones,

       CAST(brand AS JSON) AS brand,

       CAST(addresses AS JSON) AS addresses,

       CAST(sources AS JSON) AS sources,

       geometry AS geometry -- DuckDB v.1.1.0 will autoload this as a `geometry` type

FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/*/*')

WHERE

    -- Point geometry doesn't require looking at both min and max:

      bbox.xmin BETWEEN 12.46 AND 12.48 AND

      bbox.ymin BETWEEN 41.89 AND 41.91

) TO 'rome_places.geojson' WITH (FORMAT GDAL, DRIVER 'GeoJSON', SRS 'EPSG:4326');
```

## Querying and analysis [​](https://docs.overturemaps.org/guides/places/\#querying-and-analysis "Direct link to Querying and analysis")

### Querying by properties [​](https://docs.overturemaps.org/guides/places/\#querying-by-properties "Direct link to Querying by properties")

These examples use data properties in the address, category, and confidence scores columns to filter the data in useful ways using DuckDB.

- Query by address
- Query by category
- Query by confidence score

The `address` column can be used to quickly filter data down to a particular political unit. This example uses the country key to get all the data with addresses in Lithuania. Region can be likewise used to extract data from smaller units such as US states.

```sql
LOAD spatial; -- noqa

LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';

COPY (

    SELECT

-- we can parse addresses into columns to make further filtering of the data simpler

    addresses[1].freeform as street,

    addresses[1].locality as locality,

    addresses[1].postcode as postcode,

    addresses[1].region as region,

    addresses[1].country as country,

    *

FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/*/*')

WHERE

    addresses[1].country = 'LT'

) TO 'lithuania_places.parquet';
```

For filtering data by a particular type of place we can use the `taxonomy` column. In this example we'll extract all the places with a primary taxonomy category of `rice_mill` or `flour_mill`

Note: prior to the September 2026 release, this example used the now-removed `categories` property instead (see [Category taxonomy](https://docs.overturemaps.org/guides/places/#category-taxonomy)).

```sql
LOAD spatial; -- noqa

LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';

COPY (

    SELECT

    names.primary as primary_name,

    confidence,

    addresses,

    websites,

    geometry -- DuckDB v.1.1.0 will autoload this as a `geometry` type

FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/*/*')

WHERE

    taxonomy.primary IN ('flour_mill', 'rice_mill')

) TO 'mills.parquet';
```

Suppose you only want data that definitely exists and is accurate. We can use the `confidence` score to filter out data below a certain threshold to remove any suspect data.

```sql
LOAD spatial; -- noqa

LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';

COPY (

    SELECT

    *

FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/*/*')

WHERE

-- Only select data with a confidence score above .95

    confidence > .95

-- Further filtering for data within Massachusetts to limit the size of this query

    AND addresses[1].region = 'MA'

) TO 'MA_high_confidence_places.parquet';
```

### Advanced examples [​](https://docs.overturemaps.org/guides/places/\#advanced-examples "Direct link to Advanced examples")

These examples present some use cases that combine places data with other datasets.

- Conflate with OpenStreetMap
- Find building addresses
- Compare with the base theme

Overture Places can be a valuable source for conflating with or enhancing your own existing dataset.

In this example, suppose we want to use OpenStreetMap POIs for a project but would like to fill in any missing attributes such as addresses or phone numbers with Overture Place data.

Using some basic matching logic, we can join these two datasets together to create a more robust final product. By also joining the GERS ID to our output dataset we could easily keep our now conflated dataset synced with future Overture releases with a simple join.

To run this example yourself, an Oregon PBF can be obtained from [Geofabrik](https://download.geofabrik.de/north-america/us/oregon.html).

Note: Joining data with a CDLA Permissive 2.0 license to OSM is permitted but the resulting data may need to carry the Open Database License (ODbL) if it is a derivative database. Please see the [OSM Collective Database Guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline) for information on this topic.

```sql
LOAD spatial; -- noqa

LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';

COPY (

-- We'll first select OSM data from Oregon with amenity = restaurant

    WITH osm AS (

        SELECT kind,

            id,

            tags->>'name' AS name,

            tags->>'addr:housenumber' AS housenumber,

            tags->>'addr:street' AS street,

            tags->>'addr:postcode' AS postcode,

            tags->>'addr:city' AS city,

            tags->>'website' AS website,

            tags->>'phone' AS phone,

            lat,

            lon,

            tags

        FROM st_readosm(

                'oregon-latest.osm.pbf'

            )

        WHERE tags->>'amenity' = 'restaurant'

    ),

-- Then select Overture data with any category containing the word restauarant in Oregon.

    overture AS (

        SELECT id,

            names.primary AS "names.primary",

            websites[1] AS website,

            socials[1] AS social,

            emails[1] AS email,

            phones[1] AS phone,

            addresses[1].freeform AS freeform,

            addresses[1].locality AS locality,

            addresses[1].postcode AS postcode,

            addresses[1].region AS region,

            addresses[1].country AS country,

            geometry AS geometry  -- DuckDB v.1.1.0 will autoload this as a `geometry` type

        FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/*/*')

        WHERE region = 'OR'

            AND country = 'US'

            AND taxonomy.primary ilike '%restaurant%'

    )

-- Now that we have our input data we will join them together.

    SELECT

        -- With the GERS ID joined to the final result this dataset can be quickly synced to future Overture releases

        overture.id AS GERS_ID,

        osm.name,

        -- Using CASE statements, we'll favor OSM data when it is present but use Overture data wherever there are gaps

        CASE

            WHEN osm.housenumber IS NOT NULL

            OR osm.street IS NOT NULL THEN concat(osm.housenumber, ' ', osm.street)

            ELSE overture.freeform

        END AS address,

        CASE

            WHEN osm.city IS NOT NULL THEN osm.city

            ELSE overture.locality

        END AS city,

        CASE

            WHEN osm.postcode IS NOT NULL THEN osm.postcode

            ELSE overture.postcode

        END AS postcode,

        CASE

            WHEN osm.website IS NOT NULL THEN osm.website

            ELSE overture.website

        END AS website,

        CASE

            WHEN osm.phone IS NOT NULL THEN osm.phone

            ELSE overture.phone

        END AS phone,

        overture.social,

        overture.email,

        st_point(osm.lon, osm.lat) AS geometry

    FROM osm

-- To join the data, we'll first match features that have the same OR similar names

        LEFT JOIN overture ON (

            osm.name = overture."names.primary"

            OR osm.name ilike concat('%', overture."names.primary", '%')

            OR overture."names.primary" ilike concat('%', osm.name, '%')

            OR damerau_levenshtein(osm.name, overture."names.primary") < 3

        )

-- Then use a small buffer to match features that are nearby to each other

        AND st_intersects(

            st_buffer(overture.geometry::geometry, 0.003),

            st_point(osm.lon, osm.lat)

        )

) TO 'oregon_restaurants_combined.parquet';
```

Suppose you are interested in having address data attached to buildings. The [Overture addresses](https://docs.overturemaps.org/schema/reference/addresses/address/) theme might be a good place to check, but let's assume it does not cover the area you are interested in.

The places theme has wide coverage and many of the place point features have addresses associated with them. Using an intersect we can find places that fall inside buildings and then join the place's address to the building polygon.

```sql
LOAD spatial; -- noqa

LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';

COPY (

    -- First query places with address data in the area we are interested in

    WITH places AS

        (

        SELECT *

        FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/*/*')

        WHERE bbox.xmin BETWEEN 14.38 AND 14.44

        AND bbox.ymin BETWEEN 50.07 AND 50.11

        AND addresses[1].freeform IS NOT NULL

        ),

    -- Then get buildings in the same area

    buildings as

        (

        SELECT *

        FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=buildings/type=building/*')

        WHERE bbox.xmin > 14.38 AND bbox.xmax < 14.44

        AND bbox.ymin > 50.07 AND bbox.ymax < 50.11

        )

    -- Join the data using an intersect and select distinct to avoid duplicates

    SELECT distinct(buildings.id), buildings.*, places.addresses

    FROM buildings

    LEFT JOIN places on st_intersects(places.geometry, buildings.geometry)

    ORDER BY buildings.id

) TO 'prague_places_in_buildings.parquet';
```

Some real-world entities appear in more than one Overture theme. Mountains are a good example: the places theme carries them as destinations with names, categories, and GERS IDs, while the base theme's land type carries them as OSM-derived physical features.

Count mountains in places (137,150 in the October 2026 release):

```sql
LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';

-- Count places with a primary taxonomy category of 'mountain'.

-- On releases before December 2025, use categories.primary instead of taxonomy.primary.

SELECT count(*) AS places_mountains

FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*')

WHERE taxonomy.primary = 'mountain';
```

Count mountain landforms in the base theme (over 1 million peaks alone):

```sql
LOAD httpfs;  -- noqa

-- Access the data on AWS in this example

SET s3_region='us-west-2';



-- Count mountain landforms in the base theme's land type by class

SELECT

    class,

    count(*) AS base_land_features

FROM read_parquet('s3://overturemaps-us-west-2/release/2026-10-21.0/theme=base/type=land/*')

WHERE class IN ('peak', 'mountain_range', 'ridge', 'saddle', 'volcano')

GROUP BY class

ORDER BY base_land_features DESC;
```

For transit features such as bus stops and platforms, which are excluded from places by definition, see the base theme's [infrastructure type](https://docs.overturemaps.org/guides/base/infrastructure/).

## Tools and libraries [​](https://docs.overturemaps.org/guides/places/\#tools-and-libraries "Direct link to Tools and libraries")

Tools from Overture and the wider ecosystem can help you explore, visualize, and work with places data:

- **[Taxonomy Explorer](https://docs.overturemaps.org/guides/places/taxonomy-explorer/)**: An interactive tool for exploring and comparing releases of the Overture Places category taxonomy hierarchy.
- **Taxonomy visualizations**: Interactive visual maps of the OPC and basic-category taxonomies, including views of how many places fall within each category.
- **[Overture Maps Explorer](https://explore.overturemaps.org/)**: A browser-based tool for viewing and downloading modest amounts of Overture data.
- **POI library**: A cross-dataset point-of-interest library, presented at State of the Map, that combines Overture, Foursquare, and OpenStreetMap data for users looking for the most inclusive dataset.
- **Community visualizations**: Visualizations of places data built by the wider ecosystem.

- [In this guide](https://docs.overturemaps.org/guides/places/#in-this-guide)
- [What is a place?](https://docs.overturemaps.org/guides/places/#what-is-a-place)
- [Dataset description](https://docs.overturemaps.org/guides/places/#dataset-description)
  - [Feature type descriptions](https://docs.overturemaps.org/guides/places/#feature-type-descriptions)
  - [Column definitions](https://docs.overturemaps.org/guides/places/#column-definitions)
- [Category taxonomy](https://docs.overturemaps.org/guides/places/#category-taxonomy)
  - [Taxonomy change summary](https://docs.overturemaps.org/guides/places/#taxonomy-change-summary)
  - [Comparing the original and new properties](https://docs.overturemaps.org/guides/places/#comparing-the-original-and-new-properties)
  - [Key taxonomy fields](https://docs.overturemaps.org/guides/places/#key-taxonomy-fields)
  - [What are basic-level categories?](https://docs.overturemaps.org/guides/places/#what-are-basic-level-categories)
  - [Aggregation and generalization](https://docs.overturemaps.org/guides/places/#aggregation-and-generalization)
  - [Top-level category counts](https://docs.overturemaps.org/guides/places/#top-level-category-counts)
  - [Provider category mappings](https://docs.overturemaps.org/guides/places/#provider-category-mappings)
  - [Taxonomy roadmap](https://docs.overturemaps.org/guides/places/#taxonomy-roadmap)
- [Sources and licensing](https://docs.overturemaps.org/guides/places/#sources-and-licensing)
- [How we build the dataset](https://docs.overturemaps.org/guides/places/#how-we-build-the-dataset)
  - [The conflation pipeline](https://docs.overturemaps.org/guides/places/#the-conflation-pipeline)
  - [How matching quality is measured and improved](https://docs.overturemaps.org/guides/places/#how-matching-quality-is-measured-and-improved)
  - [Confidence score](https://docs.overturemaps.org/guides/places/#confidence-score)
- [Coverage and data quality](https://docs.overturemaps.org/guides/places/#coverage-and-data-quality)
- [Release artifacts and updates](https://docs.overturemaps.org/guides/places/#release-artifacts-and-updates)
- [Data access and retrieval](https://docs.overturemaps.org/guides/places/#data-access-and-retrieval)
- [Querying and analysis](https://docs.overturemaps.org/guides/places/#querying-and-analysis)
  - [Querying by properties](https://docs.overturemaps.org/guides/places/#querying-by-properties)
  - [Advanced examples](https://docs.overturemaps.org/guides/places/#advanced-examples)
- [Tools and libraries](https://docs.overturemaps.org/guides/places/#tools-and-libraries)