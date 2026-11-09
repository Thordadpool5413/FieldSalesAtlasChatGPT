import { db } from "../../api-server/src/field-atlas/backend/runtime/sdk";
import { validateConnections } from "../../api-server/src/field-atlas/backend/providers/connections";
import { inspectRuntime } from "../../../scripts/runtime-state.mjs";
import { workspaceRoot } from "../../api-server/src/field-atlas/backend/runtime/paths";
try {
  const runtime = await inspectRuntime(workspaceRoot());
  const report = await validateConnections(["MCO", "YYZ"], true);
  const checks = report.results.flatMap((airport) =>
    airport.checks.map((check) => ({
      airport: airport.airport,
      provider: check.evidence.provider,
      state: check.evidence.state,
      sourceUrl: check.evidence.sourceUrl,
      retrievedAt: check.evidence.retrievedAt,
      observedAt: check.evidence.observedAt || null,
      limitation: check.evidence.limitation,
    })),
  );
  const setup = [
    {
      component: "Workspace database",
      state: db.kind === "postgres" ? "connected" : "needs-setup",
      action:
        db.kind === "postgres"
          ? "Verify the intended Development/Production database in Replit."
          : "Run the verified SQLite migration, then set ATLAS_DATABASE_ENGINE=postgres.",
    },
    {
      component: "Private record backups",
        state: report.maintenance.backups.recordBackupFresh
        ? "record-restore-verified"
        : "needs-setup",
      action:
        "Create a private App Storage bucket, set bucket ID and scope, then run data:backup-records. A full disaster-recovery drill remains separate.",
    },
    {
      component: "Road routing",
      state: report.routingProbe?.roadBased
        ? "sample-route-verified"
        : "needs-setup",
      action:
        "Set ATLAS_ROUTING_PROVIDER=openrouteservice and ATLAS_ORS_API_KEY; rerun this check. A successful sample does not establish every route.",
    },
    {
      component: "Scheduled refresh",
      state: report.maintenance.scheduling.externalSchedulerVerified
        ? "verified"
        : "delivery-unverified",
      action:
        "Enable the existing GitHub maintenance workflow with matching URL/token secrets; inspect a delivered run and host job timestamps.",
    },
    {
      component: "Flight-specific status",
      state: "manual-verification-required",
      action: report.flightStatus.limitation,
    },
  ];
  const failedWeather = checks.some((check) =>
    ["unavailable", "stale"].includes(check.state),
  );
  const needsSetup = setup.some((item) => item.state === "needs-setup");
  console.log(
    JSON.stringify(
      {
        state:
          runtime.state !== "ready" || failedWeather
            ? "attention-required"
            : needsSetup
              ? "needs-setup"
              : "core-ready-with-limitations",
        checkedAt: report.checkedAt,
        runtime,
        setup,
        airports: report.airports,
        history: report.history,
        historySync: report.historySync,
        routingProbe: report.routingProbe,
        weather: checks,
        limitation:
          "This checks a local runtime and MCO/YYZ samples. It does not certify every airport, the published deployment, paid-provider availability, or disaster recovery.",
      },
      null,
      2,
    ),
  );
  if (runtime.state !== "ready" || failedWeather) process.exitCode = 1;
  else if (needsSetup) process.exitCode = 2;
} catch {
  console.error(
    "Readiness check failed. Check database/service settings in Replit; no credentials were logged.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
