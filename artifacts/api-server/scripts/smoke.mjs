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

async function openWorkspaceEventStream(baseUrl, workspaceKey, workspaceId, controllers) {
  const controller = new AbortController();
  controllers.push(controller);
  let response;
  try {
    response = await fetch(`${baseUrl}/api/events`, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`Could not reach required API route GET /api/events: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok || !response.body) {
    throw new Error(`Required API route GET /api/events returned HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
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
  assert.equal(subscribed.data?.ok, true, "The SSE connection must subscribe to its guest workspace");
  return nextMessage;
}

async function assertNoSseMessageDuring(pendingMessage, description, quietMs = 350) {
  const outcome = await Promise.race([
    pendingMessage.then(
      (message) => ({ message }),
      (error) => ({ error }),
    ),
    delay(quietMs).then(() => ({ quiet: true })),
  ]);
  assert.equal(outcome.quiet, true, `${description} must not receive another workspace's event`);
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
  const eventControllers = [];

  try {
    await waitForServer(child, baseUrl, output);

    const health = await apiRequest(baseUrl, "GET", "/api/_healthcheck");
    assert.equal(health.data?.status, "ready", "Atlas health route must be available through /api");

    const guests = await Promise.all([
      apiRequest(baseUrl, "POST", "/api/guest/create", { body: {} }),
      apiRequest(baseUrl, "POST", "/api/guest/create", { body: {} }),
    ]);
    const workspaces = guests.map((created, index) => {
      assert.equal(created.response.status, 201, `Guest workspace ${index + 1} must be created`);
      assert.match(created.data?.workspaceKey || "", /^[0-9a-f]{64}$/i, `Guest workspace ${index + 1} must return a share link`);
      return { key: created.data.workspaceKey };
    });
    assert.notEqual(workspaces[0].key, workspaces[1].key, "Guest workspaces must have distinct share links");

    for (const [index, workspace] of workspaces.entries()) {
      const operations = await apiRequest(baseUrl, "GET", "/api/operations", { workspaceKey: workspace.key });
      workspace.id = operations.data?.team?.id;
      assert.equal(operations.data?.needsTeam, false, `Operations must resolve guest workspace ${index + 1}`);
      assert.equal(operations.data?.team?.role, "owner");
      assert.match(workspace.id || "", /^team_[0-9a-f-]+$/i, "Operations must include each guest workspace identity");
      assert.deepEqual(operations.data?.managers, [], `Guest workspace ${index + 1} must start without managers`);
    }
    assert.notEqual(workspaces[0].id, workspaces[1].id, "Guest workspaces must have distinct workspace identities");

    const [nextMessageA, nextMessageB] = await Promise.all(
      workspaces.map((workspace) => openWorkspaceEventStream(baseUrl, workspace.key, workspace.id, eventControllers)),
    );
    const createdManagerA = await apiRequest(baseUrl, "POST", "/api/managers", {
      workspaceKey: workspaces[0].key,
      body: { name: "Workspace A isolation marker" },
    });
    assert.equal(createdManagerA.response.status, 201);
    const updateA = await expectSseMessage(nextMessageA, "workspace A's subscribed update");
    assert.equal(updateA?.type, "entity.update");
    assert.equal(updateA?.entity_type, "workspace");
    assert.equal(updateA?.entity_id, workspaces[0].id, "Workspace A's event must carry its own identity");
    assert.equal(updateA?.action, "created");
    assert.equal(updateA?.entity, "manager");

    const pendingB = nextMessageB();
    await assertNoSseMessageDuring(pendingB, "Workspace B", 350);

    const pendingA = nextMessageA();
    const createdManagerB = await apiRequest(baseUrl, "POST", "/api/managers", {
      workspaceKey: workspaces[1].key,
      body: { name: "Workspace B isolation marker" },
    });
    assert.equal(createdManagerB.response.status, 201);
    const updateB = await pendingB;
    assert.equal(updateB?.type, "entity.update");
    assert.equal(updateB?.entity_type, "workspace");
    assert.equal(updateB?.entity_id, workspaces[1].id, "Workspace B's event must carry its own identity");
    assert.equal(updateB?.action, "created");
    assert.equal(updateB?.entity, "manager");
    await assertNoSseMessageDuring(pendingA, "Workspace A", 350);

    const operationsA = await apiRequest(baseUrl, "GET", "/api/operations", { workspaceKey: workspaces[0].key });
    const operationsB = await apiRequest(baseUrl, "GET", "/api/operations", { workspaceKey: workspaces[1].key });
    assert.equal(operationsA.data?.team?.id, workspaces[0].id);
    assert.deepEqual(
      operationsA.data?.managers?.map(({ id, name }) => ({ id, name })),
      [{ id: createdManagerA.data?.manager?.id, name: "Workspace A isolation marker" }],
      "Workspace A operations must contain only its own manager",
    );
    assert.equal(operationsB.data?.team?.id, workspaces[1].id);
    assert.deepEqual(
      operationsB.data?.managers?.map(({ id, name }) => ({ id, name })),
      [{ id: createdManagerB.data?.manager?.id, name: "Workspace B isolation marker" }],
      "Workspace B operations must contain only its own manager",
    );
    assert.ok(
      operationsA.data?.activity?.some(({ summary }) => summary.includes("Workspace A isolation marker")),
      "Workspace A activity must include its own manager record",
    );
    assert.ok(
      operationsB.data?.activity?.some(({ summary }) => summary.includes("Workspace B isolation marker")),
      "Workspace B activity must include its own manager record",
    );
    assert.ok(
      operationsA.data?.activity?.every(({ summary }) => !summary.includes("Workspace B isolation marker")),
      "Workspace A activity must not contain workspace B records",
    );
    assert.ok(
      operationsB.data?.activity?.every(({ summary }) => !summary.includes("Workspace A isolation marker")),
      "Workspace B activity must not contain workspace A records",
    );
    console.log("API smoke check passed: built startup, temporary storage, two-guest operations isolation, and workspace-scoped SSE updates.");
  } finally {
    for (const controller of eventControllers) controller.abort();
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
