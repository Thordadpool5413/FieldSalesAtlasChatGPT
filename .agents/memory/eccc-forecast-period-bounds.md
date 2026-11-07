---
name: ECCC forecast period bounds
description: Preserve uncertainty when consuming ECCC City Page Weather forecast periods.
---

**Rule:** Use the ECCC City Page Weather forecast-group timestamp as the forecast issue time, but do not invent start/end timestamps for named periods such as “Today” or “Tonight.” Regional forecast periods cannot prove coverage of a selected trip window.

**Why:** The official collection provides localized period labels and summaries without exact validity intervals. Inferring intervals from those labels can misstate the forecast’s coverage, especially across time zones and date boundaries.

**How to apply:** Keep forecast source freshness separate from trip-window coverage. If a future ECCC product adds explicit period bounds, validate those fields before populating forecast validity or using them to satisfy scenario coverage.
