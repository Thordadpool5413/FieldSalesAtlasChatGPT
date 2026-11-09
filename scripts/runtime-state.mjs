import net from "node:net";
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
  const current =
    local.revision &&
    local.sourceModified === false &&
    [web, api, proxiedApi].every(
      (info) =>
        info?.app === "Field Sales Atlas" &&
        info.revision === local.revision &&
        info.sourceModified === false,
    ) &&
    api.mode === "build" &&
    api.builtAt === proxiedApi.builtAt &&
    Number.isFinite(Date.parse(api.builtAt)) &&
    health?.status === "ready" &&
    JSON.stringify(api.configuration) ===
      JSON.stringify(runtimeConfiguration(env));
  return {
    state: current ? "ready" : "occupied-or-stale",
    revision: local.revision,
    webPort,
    apiPort,
    webListening,
    apiListening,
    webRevision: web?.revision || null,
    apiRevision: api?.revision || null,
    proxyRevision: proxiedApi?.revision || null,
    next: current
      ? "The current development app is already running. Use Preview; do not start a second copy."
      : "Stop the Project workflow and any Shell app process, then press Run once. Do not kill unrelated processes.",
  };
}
