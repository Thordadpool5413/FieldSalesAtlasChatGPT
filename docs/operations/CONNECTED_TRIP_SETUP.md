# Connected My Trip setup

My Trip combines saved visits, reviewed flight fields, both trainers’ readiness, resource checks, evidence, recovery review and calendar delivery. The six intelligence tools remain at the top. New workspaces contain no sample trips, bookings or measurements.

## What works without new accounts

- The shared timeline and next-action checklist use saved workspace records and explicit local time zones. Unknown clocks remain unknown.
- Existing reviewed bookings can be attached once and reused by readiness, the assistant and recovery.
- The assistant supports saved-plan readiness, return-home deadlines, modeled airport driving comparisons and a stated delay duration. It is a calculation interface, not a general travel chatbot or an airline prediction model.
- Calendar `.ics` export uses resolved UTC times and stable opaque event IDs. Repeated manual imports depend on the calendar client; this is not a subscription.
- Optional private-device transfer encrypts reviewed flight fields and measured travel records in the browser with AES-256-GCM and PBKDF2-SHA256 (600,000 iterations). The server stores ciphertext. The passphrase is never saved. Each restore requires selection and review; this is not automatic conflict merging. Local browser records remain unencrypted.
- Personal benchmarks require at least five comparable measured records from the same trainer, airport, activity and screening lane in the preceding year. They are observations, not future guarantees. Existing Security & airport measurements can be explicitly imported without deleting their originals.
- Airport/weather monitoring and an in-app update inbox use the existing maintenance job. Opt-in Web Push uses a server-generated persisted VAPID pair, bounded retries, per-trainer read receipts and optional quiet hours. Push payloads exclude workspace access keys and itinerary details. Push acceptance does not prove display or reading. The device needs the current service worker; iOS requires a supported installed web app and notification permission.

## Flight-specific status

Create an authorized [FlightAware AeroAPI account](https://www.flightaware.com/aeroapi/). This is an optional commercial integration; do not assume free production usage. Confirm your account coverage, contractual rights, quotas and charges.

Set in **Replit Secrets**, for the intended runtime:

```dotenv
ATLAS_AEROAPI_KEY=<account key>
ATLAS_AEROAPI_WORKSPACE_IDS=<approved workspace ID, or comma-separated IDs>
# Optional policy: explicitly permits opt-in background provider checks.
ATLAS_FLIGHT_STATUS_POLLING=enabled
```

Copy the non-secret workspace ID from My Trip’s flight-provider setup details. The deployment allowlist restricts use of the paid account: newly created guest workspaces cannot invoke it merely by holding a workspace link.

Leave the polling setting absent unless account usage is intended. A key alone enables manual checks, not automatic polling. My Trip requires a separate trip-level opt-in. Background checks cover up to six saved legs near departure (within two days) per maintenance run. Validated manual snapshots are reused for up to five minutes; failed/ambiguous checks retry no sooner than one minute. The existing host scheduler still determines actual delivery.

My Trip matches the **operating flight identifier**, airport pair and local scheduled departure date. A PNR/confirmation number alone does not grant reservation access and is not sent to this API. Multiple matches and missing records remain unknown. Gate and terminal fields appear only when supplied. The provider response does not supply a general last-status-update time: the app exposes retrieval time and labels that source-time limitation.

A provider snapshot can become a **pending flight-change report only after review**. Recovery then compares saved visits and both trainers’ consequences. There is no automatic airline rebooking or calendar write. Alternative seats, fares, protected connections and ticket rights require airline verification.

Contract references: [FlightAware’s AeroApps example](https://github.com/flightaware/aeroapps/blob/main/backend/python/app.py), [AeroAPI documentation](https://www.flightaware.com/aeroapi/portal/documentation). Adapter contract tests verify exact matching, ambiguous results, source-time gaps, access scope and reviewed recovery. A successful real account request is required to validate the installed provider.

## Google and Outlook calendars

Register **each** provider you want. App credentials do not authorize a person’s calendar; each trainer must sign in and grant access from My Trip.

1. Set `ATLAS_PUBLIC_URL` to the app’s HTTPS origin, without a path (for this deployment, `https://field-sales-atlas.replit.app`). Development and published origins have separate callbacks. The default is the current published origin.
2. Generate a 32-byte encryption key and save its **64 hexadecimal characters** as `ATLAS_CONNECTION_ENCRYPTION_KEY` in Replit Secrets. Use a local password manager or `node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'` in your own Shell. Do not put the key in chat, Git, public files or logs. Retain it securely for encrypted-token restore. Changing it requires reconnecting calendars.
3. Configure the selected provider below.
4. Restart one Atlas app instance after updating Secrets. In My Trip, choose the correct trainer and connect their primary calendar. Use a trainer-specific workspace link on personal devices. An owner link can select either seat; a seat selection is not independent identity verification.
5. Preview the proposed events, review the dates and times, then apply. Each event has its own delivery result. Provider conflicts, expired previews, changed workspace versions and ambiguous clocks require a new review. Existing external events are never deleted. Events with attendees are not updated here; Atlas sends no invitations.
6. Disconnect removes encrypted tokens from Atlas. Also revoke the app grant in the provider account. Previously created calendar events remain in the calendar.

### Google

- Create a project and enable the **Google Calendar API** in [Google Cloud Console](https://console.cloud.google.com/).
- Configure the OAuth consent screen and authorized test users or publish/verify the integration as Google requires. An app left in testing has provider-imposed authorization/refresh limits.
- Create an OAuth **Web application** client. Add this exact authorized redirect URI:
  `https://field-sales-atlas.replit.app/api/travel/calendar/oauth/google/callback`
- Set `ATLAS_GOOGLE_CLIENT_ID` and `ATLAS_GOOGLE_CLIENT_SECRET` in Replit Secrets.
- The requested scope is `https://www.googleapis.com/auth/calendar.events.owned`. Atlas uses the authorizing user’s primary calendar, single-use state, PKCE and offline access. It does not request mail access.
- References: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [create events](https://developers.google.com/calendar/api/v3/reference/events/insert), [conditional modification](https://developers.google.com/calendar/api/guides/version-resources).

### Microsoft Outlook

- Register a web application in [Microsoft Entra](https://entra.microsoft.com/), with supported account types appropriate to the intended users. The adapter uses the `common` delegated v2 endpoint; choose accounts compatible with that configuration.
- Add this exact **Web** redirect URI:
  `https://field-sales-atlas.replit.app/api/travel/calendar/oauth/microsoft/callback`
- Add delegated Microsoft Graph permission **Calendars.ReadWrite** and provide tenant/admin consent when required. Create an application client secret.
- Set `ATLAS_MICROSOFT_CLIENT_ID` and `ATLAS_MICROSOFT_CLIENT_SECRET` in Replit Secrets. The adapter requests `offline_access Calendars.ReadWrite` with PKCE and single-use state.
- References: [authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [create events](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0), [event resource and transaction IDs](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0).

## Scheduling, durability and deployment

- Enable the existing GitHub maintenance workflow using the documented URL/token secrets and `ATLAS_MAINTENANCE_ENABLED`. Inspect a delivered host run; merely checking in a workflow does not activate it. See [BACKEND_RELIABILITY.md](BACKEND_RELIABILITY.md).
- Keep PostgreSQL, private backups and the token-encryption key available to the intended Development/Production runtime. Calendar tokens, Web Push subscriptions/keys and job queues are deployment-private service tables, distinct from a workspace JSON export. Include the complete PostgreSQL service records and required encryption key in your protected disaster-recovery plan; a workspace export alone does not restore integrations.
- The published app changes only after a separate reviewed Replit publish. A Git push updates source; it does not validate or publish the running site.
- Run `pnpm run replit:check` and check My Trip’s actual connection states after restarting. Validate an exact real flight and one disposable calendar event with each authorized provider, then confirm provider-side results and removal. No account credentials are available in this development environment, so automated tests use isolated contract fixtures and do not establish live account success.
