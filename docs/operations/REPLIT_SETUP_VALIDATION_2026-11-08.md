# Replit setup implementation validation

These checks ran in the cloud checkout against disposable local PostgreSQL 17 and
isolated SQLite files. They do not assert that Replit accounts or production
services have been configured. Follow [the cutover guide](REPLIT_SETUP.md).

## Passed

- 66 unit/integration tests, including the normal SQLite API path and five real
  PostgreSQL migration/concurrency/backup tests.
- All 40 API tests against PostgreSQL in a separate temporary schema.
- Web/API builds and workspace TypeScript checks.
- API smoke: workspace separation, owner/trainer access, link revocation and event
  subscription cleanup.
- Four runtime checks: combined web/API startup, SQLite restart persistence,
  companion cleanup on failure, consistent online SQLite backup, and inspection
  of stale revisions/configuration without killing existing listeners.
- The combined runtime persistence check additionally ran against PostgreSQL.
- 58 desktop/mobile/laptop browser checks; one pre-existing mobile map test skipped.
- Drizzle generated the two expected record-store models. Applying the declared
  schema and checking it again against a disposable database reported no changes.

Migration checks cover read-only preview with no target DDL, canonical content and
revision-counter comparison, source-file preservation, Unicode ordering, repeat
application, refusal to overwrite a different target, and rejection of a target
missing an existing SQLite workspace. PostgreSQL concurrency checks allow only one
compare-and-swap claimant and one adoption of a shared calendar revision.

Private-storage tests use a simulated object transport with a real PostgreSQL
restore into temporary tables. They verify byte checksum round trips, rejection of
tampering, backup destination/scope and age checks, and restoration of a missing
BTS cache without overwriting an existing one. Live routing tests simulate the
official matrix response and HTTP 429; they verify authorization headers, units,
null/unreachable paths, caching and exclusion of private coordinates from shared
source diagnostics. No API key is stored in evidence.

## Still requires verification in the user's Replit account

- The authoritative workspace and published datasets have been identified and
  reconciled; their files and development/production databases may differ.
- The managed PostgreSQL database is selected and the migration count, workspace
  count and digest match before opting in.
- A real private App Storage bucket accepts the archive/backup and a host receipt
  is produced. Full disaster recovery into an independent empty database remains
  a separate drill.
- The user's openrouteservice key has permitted use and sufficient quota, and a
  live route returns `roadBased: true`. No real key was available in this session.
- A scheduled external trigger actually reaches the reviewed host. Configuration
  flags alone do not prove scheduled delivery.
- Individual flight/booking status remains manually verified. No authorized
  flight-specific provider was available or claimed connected.

No deployment was published and no paid infrastructure was provisioned.
