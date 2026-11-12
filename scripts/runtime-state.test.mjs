import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRuntime, runtimeConfiguration } from "./runtime-state.mjs";

test("runtime inspection separates service, configuration, source-edit and build-identity failures", async () => {
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
    await writeFile(
      join(root, ".replit"),
      '[nix]\npackages = ["glibcLocales", "unicon-lang"]\n',
    );
    git(["add", "fixture.txt", ".replit"]);
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
    let servedProxyApi;
    let healthReady = true;
    let webModified = false;
    const serve = (req, res, proxy = false) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/_healthcheck" && !healthReady) res.statusCode = 503;
      res.end(
        JSON.stringify(
          req.url === "/api/_healthcheck"
            ? { status: healthReady ? "ready" : "not-ready" }
            : req.url === "/build-info.json"
              ? { ...info, mode: "development", sourceModified: webModified }
              : proxy
                ? servedProxyApi || servedApi
                : servedApi,
        ),
      );
    };
    api = http.createServer(serve).listen(0, "127.0.0.1");
    await once(api, "listening");
    web = http
      .createServer((req, res) => serve(req, res, true))
      .listen(0, "127.0.0.1");
    await once(web, "listening");
    const env = {
      PORT: String(web.address().port),
      ATLAS_API_PORT: String(api.address().port),
    };
    assert.equal((await inspectRuntime(root, env)).state, "ready");
    servedApi = { ...info, revision: "a".repeat(40) };
    assert.equal(
      (await inspectRuntime(root, env)).state,
      "revision-or-build-mismatch",
    );
    servedApi = info;
    assert.equal(
      (
        await inspectRuntime(root, {
          ...env,
          ATLAS_DATABASE_ENGINE: "postgres",
        })
      ).state,
      "configuration-mismatch",
    );
    servedProxyApi = {
      ...info,
      configuration: {
        ...configuration,
        backupScope: "synthetic-secret-not-for-logs",
      },
    };
    const mismatch = await inspectRuntime(root, env);
    assert.equal(mismatch.state, "configuration-mismatch");
    assert.deepEqual(mismatch.configurationDifferences, [
      "proxyApi.backupScope",
    ]);
    assert.ok(
      !JSON.stringify(mismatch).includes("synthetic-secret-not-for-logs"),
    );
    servedProxyApi = undefined;
    const secretChange=await inspectRuntime(root,{...env,ATLAS_AEROAPI_KEY:"new-secret-not-for-output"});
    assert.equal(secretChange.state,"configuration-mismatch");
    assert.ok(secretChange.configurationDifferences.includes("api.flightStatusConfigured"));
    assert.equal(JSON.stringify(secretChange).includes("new-secret-not-for-output"),false);
    healthReady = false;
    assert.equal((await inspectRuntime(root, env)).state, "not-ready");
    healthReady = true;
    // Reproduce the reported case: all revisions and environment settings match,
    // API is healthy, and only the accidental .replit package entry was removed.
    await writeFile(
      join(root, ".replit"),
      '[nix]\npackages = ["glibcLocales"]\n',
    );
    webModified = true;
    const edited = await inspectRuntime(root, env);
    assert.equal(edited.state, "uncommitted-changes");
    assert.deepEqual(edited.modifiedPaths, [".replit"]);
    assert.equal(edited.checks.revisionsMatch, true);
    assert.equal(edited.checks.apiHealthReady, true);
    assert.equal(edited.checks.configurationMatches, true);
    assert.equal(edited.checks.buildSourceClean, true);
    assert.match(edited.next, /restart alone cannot resolve/);
    git(["add", ".replit"]);
    assert.deepEqual((await inspectRuntime(root, env)).modifiedPaths, [
      ".replit",
    ]);
    git(["reset", "--quiet", "HEAD", "--", ".replit"]);
    await writeFile(
      join(root, ".replit"),
      '[nix]\npackages = ["glibcLocales", "unicon-lang"]\n',
    );
    webModified = false;
    servedApi = { ...info, sourceModified: true };
    assert.equal((await inspectRuntime(root, env)).state, "unverified-build");
    servedApi = { ...info, app: "Other service" };
    assert.equal(
      (await inspectRuntime(root, env)).state,
      "occupied-or-unrecognized",
    );
    servedApi = info;
    assert.equal((await inspectRuntime(root, env)).state, "ready");
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
