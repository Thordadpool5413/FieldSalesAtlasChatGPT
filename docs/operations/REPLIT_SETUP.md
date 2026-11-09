# Replit setup and verified cutover

The official weather adapters already work without API keys. Git synchronization
does not provision a database, object bucket, routing account or airline access.
Do not publish while carrying out these development steps.

## 1. Preserve and identify the existing data

Stop Replit Agent edits and **Run**, and use Ctrl+C in any Shell running the app.
Pull the reviewed source and install its pinned dependencies:

```bash
git pull --ff-only origin main
git status -sb
pnpm install --frozen-lockfile
```

Continue only if the pull succeeds and the working tree is clean. A diverged
branch needs reconciliation; do not reset, force-push, or discard local commits.

The active app previously saved private records in
`artifacts/field-sales-atlas/data/atlas.sqlite` (or `ATLAS_DATA_DIR`). Preserve a
consistent copy before migration:

```bash
pnpm run data:backup /tmp/atlas-before-postgres
```

Download that private backup directory to your own secure storage. `/tmp` and the
Replit workspace are **not** independent durable backup destinations. It contains
workspace access keys and private records; never commit or publicly share it.

**Preview and the published site may contain different SQLite files.** Compare the
saved trainers, visits and trips using the same workspace links in each. The Shell
migration below reads the workspace file only. If the published app has additional
records, export and reconcile them before cutover. Do not infer that a workspace
migration includes published-only records, or create a blank workspace as a repair.

## 2. Connect PostgreSQL and migrate before selecting it

Open **Tools → Database → Development Database**. Replit normally includes this
database and supplies `DATABASE_URL` automatically. Confirm presence without
printing its value:

```bash
node -e 'console.log(process.env.DATABASE_URL ? "DATABASE_URL is available" : "DATABASE_URL is missing")'
```

Do not replace Replit's managed `DATABASE_URL` with a development connection in
production. If it is missing, finish creating/selecting the development database
in the Database tool; never paste its connection string into chat.

With the app stopped, run:

```bash
pnpm run data:migrate-records
pnpm run data:migrate-records -- --apply
```

The first command is a read-only preview. Apply locks the SQLite source against
writers, copies records and collection revision counters into an empty PostgreSQL
target, and compares canonical content checksums before committing. The original
SQLite records remain intact. A target containing different Atlas data is refused.
Check for `migrated-and-verified` (or `already-migrated`) and matching record count
and digest. Do not switch stores after a failed migration.

Then add **`ATLAS_DATABASE_ENGINE=postgres`** in Replit Secrets/settings and restart
once. The default stays SQLite until this explicit selection. Startup refuses a
target missing workspaces present in the local SQLite source. Confirm your existing
workspace link opens the same trainers, visits, trips and booked flights.

## 3. Create private off-host backups and retain BTS history

Open **Tools → App Storage**, create a **private** bucket, and obtain its **Bucket
ID** from Settings. Add these server settings:

| Setting | Development value |
| --- | --- |
| `ATLAS_BACKUP_BUCKET_ID` | Your private bucket ID |
| `ATLAS_BACKUP_SCOPE` | `development` |

The official Replit SDK authenticates within the app; a Google service-account key
is not required. Do not make the bucket public. The same app can share a bucket
between development and publication, so production uses scope **`production`**.

Archive the installed BTS reference cache, then back up the durable records:

```bash
pnpm run data:archive-bts
pnpm run data:backup-records
```

Expected results are `archived-and-read-back-verified` and
`private-round-trip-and-record-restore-verified`. A `not-archived` result means no
configured private bucket, no PostgreSQL store, or no installed BTS file; it is not
a successful archive. If BTS is missing, run `pnpm run data:sync-bts`, then archive.

Record backup uses a consistent PostgreSQL snapshot, a unique private compressed
object, upload/download checksum comparison, and restoration into temporary tables.
The readiness report requires a receipt from the selected bucket and scope within
36 hours; an old receipt or changed destination does not count as current coverage.
It does not overwrite live records. The receipt records its scope and time; it is
**not a full host disaster-recovery certification**. The BTS archive is separately
read back and checked; a missing local cache is restored from its database pointer
at startup. A corrupt object is refused. Existing local files are not overwritten.

Daily maintenance runs private record backups once configured. BTS auto-sync also
archives its completed import. Copies are retained; no automatic deletion/lifecycle
policy is installed. Review storage usage and retention in Replit. Test recovery
into a separate empty database and verify the real workspace links before relying
on backups for production. Replit-managed database recovery is an additional layer,
not established by an application backup receipt.

## 4. Enable real road routes without Docker

Create an [openrouteservice](https://openrouteservice.org/) account, obtain an API
key, and review the current free-plan quota, commercial-use terms and
[hosted restrictions](https://giscience.github.io/openrouteservice/hosted-api-restrictions/).
Add:

| Setting | Value |
| --- | --- |
| `ATLAS_ROUTING_PROVIDER` | `openrouteservice` |
| `ATLAS_ORS_API_KEY` | Your server-side API key |

The adapter calls only the official HTTPS driving-car matrix endpoint. Keys travel
in the authorization header and are excluded from evidence, logs and Git. Journey
coordinates are sent to this provider; review that service's terms. Up to 26 input
locations are supported by this app; account quotas may further restrict usage.

Restart the app once, then run `pnpm run replit:check`. Require
`routingProbe.roadBased: true` for the sample. Unreachable pairs stay unavailable;
HTTP failures, quota limits or invalid matrices produce a clearly labeled
geographic estimate, which **cannot establish drivable feasibility**. Durations do
not include live traffic, road closures, border queues, parking or security waits.
Actual routes and graph coverage still need checking for each journey.

Existing maintained OSRM installations remain supported with
`ATLAS_ROUTING_PROVIDER=osrm` and `ATLAS_ROUTING_URL`. Do not use a public demo
server as a dependable production service.

## 5. Start once and inspect the report

Use Replit's **Run** button, or `pnpm run replit` in one Shell. Startup checks ports
before dependency installation. It recognizes a clean, matching development app;
stale, differently configured or unrelated listeners require stopping the existing
workflow/Shell process first. It never kills arbitrary port owners.

In another Shell:

```bash
pnpm run replit:check
```

This compares Git, web, direct API and proxied API revisions; performs a database
query through health; checks backup receipts; and probes MCO/YYZ official weather
and an Orlando road route. Exit 1 means runtime/source attention, exit 2 means setup
is incomplete, and exit 0 means these core samples passed with stated limitations.
FAA omission remains **unknown**, not an all-clear. Individual flight status remains
traveler-supplied until an authorized flight-specific provider is integrated.

Use `pnpm test`, `pnpm run test:api`, and `pnpm run test:runtime` for code checks.
Tests use isolated records; they do not prove production account configuration.

## 6. Review production and scheduling separately

Replit's **published app uses a separate production database**. Its `DATABASE_URL`
is not the development value. Current Replit infrastructure creates the production
database during publication; legacy Neon projects expose an optional initial data
copy setting. Do not assume either path copies the authoritative Atlas records.
Inspect the Database and Publishing settings and plan an explicit, reviewed data
transfer. A changed schema, Git push, or republish alone is not a migration of
published SQLite records. No publishing is performed by these commands.

For now, plan a **single application instance**: live event connections are still
process-local. A Reserved VM keeps timers and connections awake, but it does not
make filesystem data durable. PostgreSQL plus private App Storage handle records
and archives. Review hosting/database/storage charges before provisioning; free
weather APIs and a routing allowance do not make all production hosting free.

The repository already has `.github/workflows/maintenance.yml`. To enable its
external trigger after reviewing the published host:

1. Generate a random token of at least 32 characters locally; keep it private.
2. Add `ATLAS_MAINTENANCE_TOKEN` to the host's Secrets and the matching GitHub
   repository Actions Secret.
3. Add GitHub Actions Secret `ATLAS_MAINTENANCE_URL` as
   `https://YOUR-REVIEWED-HOST/api/maintenance/run` and repository variable
   `ATLAS_MAINTENANCE_ENABLED=true`.
4. Optionally set host `ATLAS_BTS_AUTO_SYNC=1` for monthly catch-up downloads.
5. Run the workflow manually, inspect its outcomes, then confirm a later scheduled
   delivery and the host's job timestamps. GitHub schedules may be delayed; no
   real-time delivery guarantee is inferred from a configured token.

Flight confirmation numbers do not grant a free, universal booking lookup. Keep
airline checks manual until a provider with appropriate access, coverage, permitted
use and pricing is chosen and its adapter is tested. Weather, FAA notices, ADS-B
and historical data cannot verify seats, rebooking availability or an individual
booking's current status.

## Official references checked for this setup

- [Replit publication and filesystem limits](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments)
- [Replit SQL database](https://docs.replit.com/features/data-and-storage/sql-database)
- [Development versus production databases](https://docs.replit.com/features/data-and-storage/development-and-production)
- [Private Replit App Storage](https://docs.replit.com/features/data-and-storage/object-storage)
- [openrouteservice matrix API](https://giscience.github.io/openrouteservice/api-reference/endpoints/matrix/)

Provider plans and Replit interfaces can change; check the linked documentation
when provisioning.
