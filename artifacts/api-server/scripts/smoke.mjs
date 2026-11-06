import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(apiDirectory, "../..");
const artifactConfigPath = path.join(apiDirectory, ".replit-artifact/artifact.toml");
const builtEntryPoint = path.join(apiDirectory, "dist/index.mjs");
const startTimeoutMs = 15_000;
const requestTimeoutMs = 8_000;

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function collectOutput(child) {
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  return () => output;
}

async function waitForServer(child, baseUrl, output) {
  const deadline = Date.now() + startTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Built API service exited before becoming ready.\n${output()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/healthz`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = `GET /api/healthz returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(150);
  }

  throw new Error(
    `Built API service did not become ready at preview route /api/healthz (${lastError || "startup timeout"}).\n${output()}`,
  );
}

async function apiRequest(baseUrl, method, route, { workspaceKey, body } = {}) {
  const url = new URL(route, baseUrl);
  if (workspaceKey) url.searchParams.set("workspaceKey", workspaceKey);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (error) {
    throw new Error(
      `Could not reach required API route ${method} ${url.pathname}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const unavailable = response.status === 404
      ? `Required API route is unavailable: ${method} ${url.pathname} returned HTTP 404`
      : `${method} ${url.pathname} returned HTTP ${response.status}`;
    throw new Error(`${unavailable}${data?.message || data?.error ? `: ${data.message || data.error}` : ""}`);
  }
  return { response, data };
}

function createSseMessageReader(reader) {
  const decoder = new TextDecoder();
  let buffered = "";
  return async function nextMessage() {
    while (true) {
      const boundary = buffered.indexOf("\n\n");
      if (boundary >= 0) {
        const eventText = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        const data = eventText
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data) return JSON.parse(data);
        continue;
      }

      const { value, done } = await reader.read();
      if (done) throw new Error("The API event stream closed before the expected event arrived.");
      buffered += decoder.decode(value, { stream: true });
    }
  };
}

async function expectSseMessage(nextMessage, description) {
  try {
    return await Promise.race([
      nextMessage(),
      delay(requestTimeoutMs).then(() => {
        throw new Error(`Timed out waiting for ${description} through GET /api/events.`);
      }),
    ]);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`GET /api/events returned an invalid event while waiting for ${description}.`);
    }
    throw error;
  }
}

async function checkPreviewConfiguration() {
  const config = await readFile(artifactConfigPath, "utf8");
  assert.match(config, /previewPath\s*=\s*"\/api"/, "API artifact previewPath must remain /api");
  assert.match(config, /paths\s*=\s*\[[^\]]*"\/api"[^\]]*\]/, "API service must route the /api preview prefix");
  assert.match(
    config,
    /artifacts\/api-server\/dist\/index\.mjs/,
    "Production API service must start the built API entry point",
  );
}

async function main() {
  await checkPreviewConfiguration();
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "atlas-api-smoke-"));
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--enable-source-maps", builtEntryPoint], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      ATLAS_DATA_DIR: path.join(temporaryDirectory, "workspace-data"),
      ATLAS_RUNTIME_ROOT: path.join(temporaryDirectory, "runtime"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = collectOutput(child);
  const eventController = new AbortController();

  try {
    await waitForServer(child, baseUrl, output);

    const health = await apiRequest(baseUrl, "GET", "/api/_healthcheck");
    assert.equal(health.data?.status, "ready", "Atlas health route must be available through /api");

    const created = await apiRequest(baseUrl, "POST", "/api/guest/create", { body: {} });
    assert.equal(created.response.status, 201);
    const workspaceKey = created.data?.workspaceKey;
    assert.match(workspaceKey || "", /^[0-9a-f]{64}$/i, "Guest workspace creation must return a share link");

    const initialOperations = await apiRequest(baseUrl, "GET", "/api/operations", { workspaceKey });
    const workspaceId = initialOperations.data?.team?.id;
    assert.equal(initialOperations.data?.needsTeam, false, "Operations must resolve the newly created guest workspace");
    assert.equal(initialOperations.data?.team?.role, "owner");
    assert.match(workspaceId || "", /^team_[0-9a-f-]+$/i, "Operations must include the guest workspace identity");
    assert.deepEqual(initialOperations.data?.managers, [], "A new isolated workspace must start without managers");

    let eventResponse;
    try {
      eventResponse = await fetch(`${baseUrl}/api/events`, {
        headers: { Accept: "text/event-stream" },
        signal: eventController.signal,
      });
    } catch (error) {
      throw new Error(`Could not reach required API route GET /api/events: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!eventResponse.ok || !eventResponse.body) {
      throw new Error(`Required API route GET /api/events returned HTTP ${eventResponse.status}`);
    }
    const reader = eventResponse.body.getReader();
    const nextMessage = createSseMessageReader(reader);
    const ready = await expectSseMessage(nextMessage, "the connection readiness event");
    assert.equal(ready?.type, "connection.ready", "SSE must send the readiness event first");
    assert.match(ready?.connectionId || "", /^[a-f0-9]{48}$/i, "Readiness event must include its connection ID");

    const subscribed = await apiRequest(baseUrl, "POST", "/api/subscriptions", {
      workspaceKey,
      body: {
        entity_type: "workspace",
        entity_id: workspaceId,
        connection_id: ready.connectionId,
      },
    });
    assert.equal(subscribed.data?.ok, true, "The SSE connection must subscribe to the created workspace");

    const createdManager = await apiRequest(baseUrl, "POST", "/api/managers", {
      workspaceKey,
      body: { name: "API smoke check manager" },
    });
    assert.equal(createdManager.response.status, 201);
    const update = await expectSseMessage(nextMessage, "the subscribed workspace update");
    assert.equal(update?.type, "entity.update", "Workspace mutation must produce an entity update");
    assert.equal(update?.entity_type, "workspace");
    assert.equal(update?.entity_id, workspaceId, "The event must belong to the subscribed workspace");
    assert.equal(update?.action, "created");
    assert.equal(update?.entity, "manager");

    const updatedOperations = await apiRequest(baseUrl, "GET", "/api/operations", { workspaceKey });
    assert.equal(updatedOperations.data?.team?.id, workspaceId);
    assert.equal(updatedOperations.data?.managers?.length, 1);
    assert.equal(updatedOperations.data?.managers?.[0]?.id, createdManager.data?.manager?.id);
    console.log("API smoke check passed: built startup, /api preview routes, guest operations, SSE readiness, and workspace update.");
  } finally {
    eventController.abort();
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(5_500),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`API smoke check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
