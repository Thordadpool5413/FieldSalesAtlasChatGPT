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

async function apiRequest(baseUrl, method, route, { workspaceKey, body, query, allowError = false } = {}) {
  const url = new URL(route, baseUrl);
  if (workspaceKey) url.searchParams.set("workspaceKey", workspaceKey);
  for (const [name, value] of Object.entries(query || {})) {
    url.searchParams.set(name, value);
  }

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
  if (!response.ok && !allowError) {
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

      let chunk;
      try {
        chunk = await reader.read();
      } catch {
        return { type: "connection.closed" };
      }
      const { value, done } = chunk;
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

    const ownerKey = workspaces[0].key;
    const invitations = await Promise.all([
      apiRequest(baseUrl, "POST", "/api/workspace/trainer-links", {
        workspaceKey: ownerKey,
        body: { seat: "trainer_a" },
      }),
      apiRequest(baseUrl, "POST", "/api/workspace/trainer-links", {
        workspaceKey: ownerKey,
        body: { seat: "trainer_b" },
      }),
    ]);
    const [trainerA, trainerB] = invitations.map((invitation, index) => {
      assert.equal(invitation.response.status, 201, `Owner must issue trainer ${index === 0 ? "A" : "B"} access`);
      assert.match(invitation.data?.workspaceKey || "", /^[0-9a-f]{64}$/i);
      assert.match(invitation.data?.linkId || "", /^[0-9a-f]{64}$/i);
      return { key: invitation.data.workspaceKey, linkId: invitation.data.linkId };
    });
    assert.notEqual(trainerA.key, trainerB.key, "Trainer links must be distinct bearer capabilities");

    const ownerLinks = await apiRequest(baseUrl, "GET", "/api/workspace/trainer-links", {
      workspaceKey: ownerKey,
    });
    assert.deepEqual(
      ownerLinks.data?.links?.filter(({ id }) => [trainerA.linkId, trainerB.linkId].includes(id))
        .map(({ id, seat, status }) => ({ id, seat, status }))
        .sort((left, right) => left.seat.localeCompare(right.seat)),
      [
        { id: trainerA.linkId, seat: "trainer_a", status: "active" },
        { id: trainerB.linkId, seat: "trainer_b", status: "active" },
      ].sort((left, right) => left.seat.localeCompare(right.seat)),
      "Owner must see both active trainer invitations",
    );

    const [trainerAOperations, trainerBOperations] = await Promise.all([
      apiRequest(baseUrl, "GET", "/api/operations", {
        workspaceKey: trainerA.key,
        query: { trainerId: "trainer_b" },
      }),
      apiRequest(baseUrl, "GET", "/api/operations", {
        workspaceKey: trainerB.key,
        query: { trainerId: "trainer_a" },
      }),
    ]);
    assert.equal(trainerAOperations.data?.team?.id, workspaces[0].id);
    assert.equal(trainerAOperations.data?.team?.role, "member");
    assert.equal(trainerAOperations.data?.accessSeat, "trainer_a",
      "Trainer A's link must not be able to claim Trainer B's seat");
    assert.equal(trainerBOperations.data?.team?.id, workspaces[0].id);
    assert.equal(trainerBOperations.data?.team?.role, "member");
    assert.equal(trainerBOperations.data?.accessSeat, "trainer_b",
      "Trainer B's link must not be able to claim Trainer A's seat");

    await apiRequest(baseUrl, "PUT", "/api/travel/preferences", {
      workspaceKey: trainerA.key,
      query: { slot: "trainer_a" },
      body: { hotelPerNight: 175 },
    });
    await apiRequest(baseUrl, "PUT", "/api/travel/preferences", {
      workspaceKey: trainerB.key,
      query: { slot: "trainer_b" },
      body: { hotelPerNight: 260 },
    });
    const [ownerReadsTrainerA, ownerReadsTrainerB] = await Promise.all([
      apiRequest(baseUrl, "GET", "/api/travel/preferences", {
        workspaceKey: ownerKey,
        query: { slot: "trainer_a" },
      }),
      apiRequest(baseUrl, "GET", "/api/travel/preferences", {
        workspaceKey: ownerKey,
        query: { slot: "trainer_b" },
      }),
    ]);
    assert.equal(ownerReadsTrainerA.data?.preferences?.hotelPerNight, 175);
    assert.equal(ownerReadsTrainerB.data?.preferences?.hotelPerNight, 260);
    for (const [label, key, otherSeat] of [
      ["Trainer A", trainerA.key, "trainer_b"],
      ["Trainer B", trainerB.key, "trainer_a"],
    ]) {
      const crossSeatRead = await apiRequest(baseUrl, "GET", "/api/travel/preferences", {
        workspaceKey: key,
        query: { slot: otherSeat },
        allowError: true,
      });
      assert.equal(crossSeatRead.response.status, 403, `${label} must not read the other trainer's preferences`);
      const crossSeatWrite = await apiRequest(baseUrl, "PUT", "/api/travel/preferences", {
        workspaceKey: key,
        query: { slot: otherSeat },
        body: { hotelPerNight: 999 },
        allowError: true,
      });
      assert.equal(crossSeatWrite.response.status, 403, `${label} must not change the other trainer's preferences`);
    }
    const trainerBPreferences = await apiRequest(baseUrl, "GET", "/api/travel/preferences", {
      workspaceKey: trainerB.key,
      query: { slot: "trainer_b" },
    });
    assert.equal(trainerBPreferences.data?.preferences?.hotelPerNight, 260,
      "A denied cross-seat write must not alter Trainer B's saved preferences");

    const profilePayloads = {
      trainer_a: {
        id: "trainer_a", name: "Trainer 1", homeCity: "A-only base", homeAirports: [],
        homeDriveMinutes: {}, preferredAirlines: "", preferNonstop: true, maxConnections: 1, notes: "",
      },
      trainer_b: {
        id: "trainer_b", name: "Trainer 2", homeCity: "B-only base", homeAirports: [],
        homeDriveMinutes: {}, preferredAirlines: "", preferNonstop: true, maxConnections: 1, notes: "",
      },
    };
    const [trainerAProfileSave, trainerBProfileSave] = await Promise.all([
      apiRequest(baseUrl, "PUT", "/api/trainer-profiles/trainer_a", {
        workspaceKey: trainerA.key,
        body: profilePayloads.trainer_a,
      }),
      apiRequest(baseUrl, "PUT", "/api/trainer-profiles/trainer_b", {
        workspaceKey: trainerB.key,
        body: profilePayloads.trainer_b,
      }),
    ]);
    assert.equal(trainerAProfileSave.response.status, 200, "Trainer A may update its own profile");
    assert.equal(trainerBProfileSave.response.status, 200, "Trainer B may update its own profile");
    const [trainerAProfileDenied, trainerBProfileDenied] = await Promise.all([
      apiRequest(baseUrl, "PUT", "/api/trainer-profiles/trainer_b", {
        workspaceKey: trainerA.key,
        body: { ...profilePayloads.trainer_b, homeCity: "Unauthorized edit" },
        allowError: true,
      }),
      apiRequest(baseUrl, "PUT", "/api/trainer-profiles/trainer_a", {
        workspaceKey: trainerB.key,
        body: { ...profilePayloads.trainer_a, homeCity: "Unauthorized edit" },
        allowError: true,
      }),
    ]);
    assert.equal(trainerAProfileDenied.response.status, 403, "Trainer A must not change Trainer B's profile");
    assert.equal(trainerBProfileDenied.response.status, 403, "Trainer B must not change Trainer A's profile");
    const ownerProfiles = await apiRequest(baseUrl, "GET", "/api/trainer-profiles", {
      workspaceKey: ownerKey,
    });
    assert.equal(
      ownerProfiles.data?.profiles?.find(({ id }) => id === "trainer_a")?.homeCity,
      "A-only base",
      "Denied cross-seat writes must leave Trainer A's profile unchanged",
    );
    assert.equal(
      ownerProfiles.data?.profiles?.find(({ id }) => id === "trainer_b")?.homeCity,
      "B-only base",
      "Denied cross-seat writes must leave Trainer B's profile unchanged",
    );

    for (const [label, key] of [["Trainer A", trainerA.key], ["Trainer B", trainerB.key]]) {
      const deniedList = await apiRequest(baseUrl, "GET", "/api/workspace/trainer-links", {
        workspaceKey: key,
        allowError: true,
      });
      assert.equal(deniedList.response.status, 403, `${label} must not list or manage invitations`);
      const deniedIssue = await apiRequest(baseUrl, "POST", "/api/workspace/trainer-links", {
        workspaceKey: key,
        body: { seat: "trainer_a" },
        allowError: true,
      });
      assert.equal(deniedIssue.response.status, 403, `${label} must not issue trainer invitations`);
    }
    const deniedRevoke = await apiRequest(
      baseUrl,
      "DELETE",
      `/api/workspace/trainer-links/${trainerA.linkId}`,
      { workspaceKey: trainerB.key, allowError: true },
    );
    assert.equal(deniedRevoke.response.status, 403, "Trainer B must not revoke Trainer A's access");

    const trainerAEvents = await openWorkspaceEventStream(
      baseUrl, trainerA.key, workspaces[0].id, eventControllers,
    );
    const trainerBEvents = await openWorkspaceEventStream(
      baseUrl, trainerB.key, workspaces[0].id, eventControllers,
    );
    const revoked = await apiRequest(
      baseUrl,
      "DELETE",
      `/api/workspace/trainer-links/${trainerA.linkId}`,
      { workspaceKey: ownerKey },
    );
    assert.equal(revoked.data?.revoked, true, "Owner must revoke Trainer A's link");

    const revokedAccess = await apiRequest(baseUrl, "GET", "/api/operations", {
      workspaceKey: trainerA.key,
      allowError: true,
    });
    assert.equal(revokedAccess.response.status, 403, "Revoked trainer links must fail subsequent API requests");
    const revokedMetadata = await apiRequest(baseUrl, "GET", "/api/workspace/trainer-links", {
      workspaceKey: ownerKey,
    });
    assert.equal(
      revokedMetadata.data?.links?.find(({ id }) => id === trainerA.linkId)?.status,
      "revoked",
      "Owner must see the trainer link's revoked status",
    );

    const pendingTrainerAAfterRevocation = trainerAEvents();
    const trainerBRevocationNotice = await expectSseMessage(
      trainerBEvents,
      "Trainer B's notification about Trainer A's revocation",
    );
    assert.equal(trainerBRevocationNotice?.action, "revoked");
    assert.equal(trainerBRevocationNotice?.entity, "trainer invitation");
    await assertNoSseMessageDuring(
      pendingTrainerAAfterRevocation,
      "Trainer A after its link was revoked",
      500,
    );

    const pendingTrainerBUpdate = trainerBEvents();
    const postRevocationManager = await apiRequest(baseUrl, "POST", "/api/managers", {
      workspaceKey: ownerKey,
      body: { name: "Post-revocation live update" },
    });
    assert.equal(postRevocationManager.response.status, 201);
    const trainerBUpdate = await expectSseMessage(
      () => pendingTrainerBUpdate,
      "Trainer B's authorized workspace update after revocation",
    );
    assert.equal(trainerBUpdate?.entity, "manager");
    await assertNoSseMessageDuring(
      pendingTrainerAAfterRevocation,
      "Trainer A after another workspace update",
      500,
    );

    console.log("API smoke check passed: isolated storage, guest workspace separation, owner/trainer access boundaries, revocation, and live subscription cleanup.");
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
