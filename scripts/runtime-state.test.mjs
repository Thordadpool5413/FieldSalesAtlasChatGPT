import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRuntime, runtimeConfiguration } from "./runtime-state.mjs";

test("runtime inspection distinguishes a current app from a stale API, changed settings and unrelated ports", async () => {
  const root = await mkdtemp(join(tmpdir(), "atlas-runtime-inspect-"));
  const git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const configuration = runtimeConfiguration({});
  let api, web;
  try {
    git(["init"]);
    await writeFile(join(root, "fixture.txt"), "fixture");
    git(["add", "fixture.txt"]);
    git([
      "-c",
      "user.name=Runtime Test",
      "-c",
      "user.email=runtime@example.invalid",
      "commit",
      "-m",
      "fixture",
    ]);
    const revision = git(["rev-parse", "HEAD"]);
    const info = {
      app: "Field Sales Atlas",
      revision,
      sourceModified: false,
      mode: "build",
      builtAt: new Date().toISOString(),
      configuration,
    };
    let servedApi = info;
    const serve = (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/api/_healthcheck"
            ? { status: "ready" }
            : req.url === "/build-info.json"
              ? { ...info, mode: "development" }
              : servedApi,
        ),
      );
    };
    api = http.createServer(serve).listen(0, "127.0.0.1");
    await once(api, "listening");
    web = http.createServer(serve).listen(0, "127.0.0.1");
    await once(web, "listening");
    const env = {
      PORT: String(web.address().port),
      ATLAS_API_PORT: String(api.address().port),
    };
    assert.equal((await inspectRuntime(root, env)).state, "ready");
    servedApi = { ...info, revision: "a".repeat(40) };
    assert.equal((await inspectRuntime(root, env)).state, "occupied-or-stale");
    servedApi = info;
    assert.equal(
      (
        await inspectRuntime(root, {
          ...env,
          ATLAS_DATABASE_ENGINE: "postgres",
        })
      ).state,
      "occupied-or-stale",
    );
    await writeFile(join(root, "fixture.txt"), "modified");
    assert.equal((await inspectRuntime(root, env)).state, "occupied-or-stale");
    assert.equal(api.listening, true);
    assert.equal(web.listening, true);
    await new Promise((resolve) => api.close(resolve));
    await new Promise((resolve) => web.close(resolve));
    assert.equal((await inspectRuntime(root, env)).state, "stopped");
  } finally {
    if (api?.listening) await new Promise((resolve) => api.close(resolve));
    if (web?.listening) await new Promise((resolve) => web.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
