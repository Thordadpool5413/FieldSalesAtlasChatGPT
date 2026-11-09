import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readdir, writeFile, rename, chmod, rm } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
const root = fileURLToPath(new URL("../", import.meta.url));
if (process.env.ATLAS_DATABASE_ENGINE === 'postgres') throw Error('The active record store is PostgreSQL. Use pnpm run data:backup-records; this SQLite command cannot back up active PostgreSQL records.');
const source = resolve(
  root,
  process.env.ATLAS_DATA_DIR || "artifacts/field-sales-atlas/data",
);
const destination = process.argv[2] || process.env.ATLAS_BACKUP_DIR;
if (!destination)
  throw Error("Supply a backup directory on separate durable storage.");
const target = resolve(destination);
if (target === source || !relative(source, target).startsWith(".."))
  throw Error(
    "Backup directory must be outside the application data directory.",
  );
await mkdir(target, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replaceAll(":", "-");
const temporary = join(target, ".partial-" + stamp);
const output = join(target, "atlas-" + stamp);
await mkdir(temporary, { mode: 0o700 });
const manifest = {
  version: 1,
  createdAt: new Date().toISOString(),
  files: [],
  verified: false,
  limitation:
    "SQLite files are consistent per file. Retain off-host copies; deployment restoration still requires a host-level drill.",
};
try {
  const files = await readdir(source, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || !/^(atlas|bts)\.sqlite$/.test(file.name)) continue;
    const connection = new DatabaseSync(join(source, file.name), {
      readOnly: true,
    });
    try {
      await backup(connection, join(temporary, file.name));
    } finally {
      connection.close();
    }
    const copied = new DatabaseSync(join(temporary, file.name), {
      readOnly: true,
    });
    try {
      const checks = copied.prepare("PRAGMA integrity_check").all();
      if (checks.length !== 1 || checks[0].integrity_check !== "ok")
        throw Error("Backup failed integrity validation.");
    } finally {
      copied.close();
    }
    await chmod(join(temporary, file.name), 0o600);
    manifest.files.push({
      name: file.name,
      sha256: await sha256(join(temporary, file.name)),
    });
  }
  if (!manifest.files.some((file) => file.name === "atlas.sqlite"))
    throw Error(
      "Application database does not exist; no successful backup was created.",
    );
  manifest.verified = true;
  await writeFile(
    join(temporary, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  await rename(temporary, output);
  console.log(
    JSON.stringify({
      state: "verified",
      directory: output,
      files: manifest.files.map((f) => f.name),
    }),
  );
} catch (failure) {
  await rm(temporary, { recursive: true, force: true });
  throw failure;
}
