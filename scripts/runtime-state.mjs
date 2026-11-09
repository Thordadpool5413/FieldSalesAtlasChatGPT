import net from "node:net";
import { execFileSync } from "node:child_process";
import { buildIdentity } from "./build-identity.mjs";

export function runtimeConfiguration(env = process.env) {
  return {
    recordStore: env.ATLAS_DATABASE_ENGINE || "sqlite",
    routingProvider: env.ATLAS_ROUTING_PROVIDER || "osrm",
    routingConfigured:
      env.ATLAS_ROUTING_PROVIDER === "openrouteservice"
        ? !!env.ATLAS_ORS_API_KEY
        : !!env.ATLAS_ROUTING_URL,
    privateBucketConfigured: !!env.ATLAS_BACKUP_BUCKET_ID,
    backupScope: env.ATLAS_BACKUP_SCOPE || null,
  };
}
async function listening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(800);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(true));
  });
}
async function json(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1800) });
    return response.ok &&
      response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : null;
  } catch {
    return null;
  }
}
function modifiedPaths(root) {
  try {
    // Include both staged and unstaged changes; never read file contents or env values.
    const paths = [[], ["--cached"]].flatMap((flags) =>
      execFileSync("git", ["diff", ...flags, "--name-only", "-z"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split("\0")
        .filter(Boolean),
    );
    return [...new Set(paths)].sort();
  } catch {
    return [];
  }
}
export async function inspectRuntime(root, env = process.env) {
  const webPort = Number(env.PORT || 24397),
    apiPort = Number(env.ATLAS_API_PORT || 8080);
  if (
    ![webPort, apiPort].every(
      (p) => Number.isInteger(p) && p > 0 && p <= 65535,
    ) ||
    webPort === apiPort
  )
    throw Error("PORT and ATLAS_API_PORT must be distinct valid ports.");
  const [webListening, apiListening] = await Promise.all([
    listening(webPort),
    listening(apiPort),
  ]);
  const local = buildIdentity(root, "development");
  if (!webListening && !apiListening)
    return { state: "stopped", revision: local.revision, webPort, apiPort };
  const [web, api, proxiedApi, health] = await Promise.all([
    json(`http://127.0.0.1:${webPort}/build-info.json`),
    json(`http://127.0.0.1:${apiPort}/api/build-info`),
    json(`http://127.0.0.1:${webPort}/api/build-info`),
    json(`http://127.0.0.1:${webPort}/api/_healthcheck`),
  ]);
  const expected = runtimeConfiguration(env);
  const configurationDifferences = [
    ["api", api],
    ["proxyApi", proxiedApi],
  ].flatMap(([label, info]) =>
    Object.keys(expected)
      .filter((key) => info?.configuration?.[key] !== expected[key])
      .map((key) => label + "." + key),
  );
  const checks = {
    recognizedServices: [web, api, proxiedApi].every(
      (info) => info?.app === "Field Sales Atlas",
    ),
    revisionsMatch:
      !!local.revision &&
      [web, api, proxiedApi].every((info) => info?.revision === local.revision),
    apiBuildMatchesProxy:
      api?.mode === "build" &&
      api?.builtAt === proxiedApi?.builtAt &&
      Number.isFinite(Date.parse(api?.builtAt)),
    apiHealthReady: health?.status === "ready",
    configurationMatches: configurationDifferences.length === 0,
    sourceTreeClean: local.sourceModified === false,
    buildSourceClean:
      api?.sourceModified === false &&
      proxiedApi?.sourceModified === false &&
      (web?.mode === "development" || web?.sourceModified === false),
  };
  const paths = local.sourceModified ? modifiedPaths(root) : [];
  const issues = [];
  if (!checks.recognizedServices)
    issues.push({
      code: "unrecognized-service",
      message: "One or more listeners did not return Atlas identity metadata.",
    });
  if (!checks.revisionsMatch)
    issues.push({
      code: "revision-mismatch",
      message: "Web, API or proxy revision does not match this checkout.",
    });
  if (!checks.apiBuildMatchesProxy)
    issues.push({
      code: "build-mismatch",
      message: "Direct and proxied API build identities are missing or differ.",
    });
  if (!checks.apiHealthReady)
    issues.push({
      code: "health-not-ready",
      message: "The proxied API/database health check did not report ready.",
    });
  if (!checks.configurationMatches)
    issues.push({
      code: "configuration-mismatch",
      message:
        "Shell and running service settings differ for: " +
        configurationDifferences.join(", ") +
        ". No secret values are reported.",
    });
  if (!checks.sourceTreeClean)
    issues.push({
      code:
        local.sourceModified === true
          ? "uncommitted-changes"
          : "source-unverified",
      message:
        local.sourceModified === true
          ? "Tracked files have uncommitted changes: " +
            (paths.join(", ") || "inspect git status") +
            ". This alone does not establish that the API is stale."
          : "The checkout source status could not be verified.",
    });
  if (!checks.buildSourceClean)
    issues.push({
      code: "unverified-build",
      message: "A service was built from modified or unverified source.",
    });
  let state = "ready";
  let next =
    "The current development app is already running. Use Preview; do not start a second copy.";
  if (!checks.recognizedServices) {
    state = "occupied-or-unrecognized";
    next =
      "Identify the listener owners before stopping anything; an Atlas service could not be verified.";
  } else if (!checks.revisionsMatch || !checks.apiBuildMatchesProxy) {
    state = "revision-or-build-mismatch";
    next =
      "Review the reported identities, then rebuild and restart one Atlas instance from the intended checkout.";
  } else if (!checks.apiHealthReady) {
    state = "not-ready";
    next =
      "Inspect the API/proxy logs and database connection; the health check failed.";
  } else if (!checks.configurationMatches) {
    state = "configuration-mismatch";
    next =
      "Open a new Shell after saving the intended Secrets, then restart one instance using that environment.";
  } else if (!checks.sourceTreeClean) {
    state =
      local.sourceModified === true
        ? "uncommitted-changes"
        : "source-unverified";
    next =
      "Review and preserve the tracked changes listed in modifiedPaths. A restart alone cannot resolve uncommitted configuration or source edits.";
  } else if (!checks.buildSourceClean) {
    state = "unverified-build";
    next =
      "Rebuild from the reviewed, saved checkout; a service build has unverified source changes.";
  }
  return {
    state,
    revision: local.revision,
    webPort,
    apiPort,
    webListening,
    apiListening,
    webRevision: web?.revision || null,
    apiRevision: api?.revision || null,
    proxyRevision: proxiedApi?.revision || null,
    checks,
    issues,
    modifiedPaths: paths,
    configurationDifferences,
    sourceModified: {
      checkout: local.sourceModified,
      web: web?.sourceModified ?? null,
      api: api?.sourceModified ?? null,
      proxyApi: proxiedApi?.sourceModified ?? null,
    },
    next,
  };
}
