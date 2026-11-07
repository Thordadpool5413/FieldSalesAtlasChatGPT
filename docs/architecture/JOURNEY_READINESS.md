# Journey readiness: implemented connections and limits

Implemented November 6, 2026. This describes working code, not activation of every provider in the [aviation blueprint](AVIATION_DATA_CONNECTIONS.md).

## Working flow

~~~mermaid
flowchart TD
  Import["Local confirmation text, EML, PDF or manual fields"]
  Review["Review sanitized legs, ticket checks and connection requirements"]
  Local["Versioned device booking and field-change review"]
  Attach["Select one reviewed booking per trainer; attach with version guard"]
  Shared["Authorized shared journey and saved appointments"]
  Resources["Reviewed transport, equipment and optional pickup cutoff"]
  Calculate["One readiness calculation: connections, visits, return and home deadline"]
  Surface["Booked flights, current journey, assistant and recovery"]
  Approval["Reviewed recovery approval with fresh revision and feasibility checks"]
  Import --> Review --> Local --> Attach --> Shared
  Shared --> Calculate
  Resources --> Calculate
  Calculate --> Surface --> Approval
~~~

Raw confirmations, PNRs, passenger names, full ticket numbers and payment data remain outside booking storage and exports. Timezone resolution sends only sanitized flight fields to the authorized workspace API. The existing service worker keeps private APIs network-only.

## Shared contract and calculations

Canonical travel types, clocks, evidence display, deadline parsing and readiness live under **artifacts/api-server/src/field-atlas/shared/travel/**. The UI shared/travel files re-export them, eliminating two independently maintained copies and competing generic connection thresholds.

User-reviewed fields, traveler-reported ticket issuance checks and traveler-reported airline checks have separate dates. Legacy verified records mean field review only; migration never invents an airline check time. Editing flight fields resets related review claims. A revised confirmation can replace a selected booking, show changed fields, increment its local revision and retain a bounded change log.

IANA zones and elapsed instants support overnight/date-line travel. Ambiguous or nonexistent daylight-saving clocks are rejected for explicit correction. Missing time/airport mappings remain unresolved.

## API connections

All new routes require a valid workspace capability:

| Route | Purpose |
| --- | --- |
| POST /api/travel/itinerary/readiness | Resolve supplied/reference airport zones and assess sanitized flight fields. No booking/calendar write. |
| GET /api/travel/journeys/:id/readiness | Assess pending appointments and the saved itinerary, including a pending reported change. Return evidence and version/revision guards. |
| PUT /api/travel/journeys/:id/requirements | Save transport/equipment and optional dated pickup cutoff. Require the itinerary version and workspace revision read by the form. |

The existing itinerary attachment supports an expected itinerary version. Current UI callers send it; older callers retain compatibility. Requirements writes add an audit receipt, advance the workspace revision and notify authorized subscribers. Stale forms/previews cannot overwrite newer requirements. Appointment changes remain behind explicit approval.

Attachment selects one reviewed booking per trainer, preserves unselected trainers' legs and identifies trainers by stable IDs.

## Timing and resource model

- **Connection:** departure minus inbound arrival, supplied gate-to-gate processing and boarding cutoff. Different-airport transfers remain unresolved. Same-ticket reports do not establish protection.
- **First visit:** arrival plus processing and airport-to-visit transfer, compared with the pending appointment.
- **Return flight:** last visit end plus return transfer, rental return and departure allowance.
- **Rental pickup:** arrival plus reviewed gate-to-counter allowance, compared with an explicitly zoned pickup cutoff.
- **Home deadline:** the assistant adds arrival processing and saved home drive to the supplied home-airport arrival.

Each trainer receives a smallest measured margin and independent 30/60/120-minute comparisons. These hold other supplied times fixed: **they are not probabilities, flight-delay forecasts or rebooking simulations**. Missing facts do not become success. Geographic road substitutes remain explicit evidence gaps and cannot establish road feasibility. Latest-action times identify the relevant step and time zone.

Current saved appointments, proposed assistant scenarios and recovery alternatives have distinct headings. Recovery changes mark shared car/equipment arrangements for renewed review. Known negative timing/pickup margins block recovery approval.

## Provider repairs and cleanup

GeoMet now reads obs_date_tm, date_tm-value and stn_nam-value, bounds queries to recent data, rejects old/excessively future observations and uses the oldest included timestamp for conservative expiry. Explicit country controls Canadian coverage.

Provider evidence distinguishes access denial, rate limiting, HTTP errors, timeouts, network failures and invalid data. Failed refreshes preserve original observation age and last-valid limitations.

The unused LiveFlightSearch component/styles were removed after confirming no consumers; its commercial backend remains disabled. The dedicated readiness panel replaces duplicate connection warnings in coaching exposure.

## Limits and verification

This release does not provide reservation lookup, authoritative ticket status, airline minimum connection times, gate assignments, live traffic or bookable alternatives. Pickup/resource arrangements are traveler-reported. Shared-car routes and equipment custody are not automatically optimized. Local bookings reach other devices only after explicit attachment; shared requirements then persist.

Aircraft registries, hazard overlays, live aircraft, photos and new statistical imports retain the separate implementation and permission conditions in the aviation blueprint. Notifications, general aviation chat, statistical predictions and automatic rebooking are not claimed.

Checks cover elapsed-time/connection behavior, local schema/privacy and replacement, API isolation/stale writes, optimizer/calendar behavior, browser booking/resource flows and the existing build/API/runtime suites. Live samples establish access at sampling time, not future uptime.
