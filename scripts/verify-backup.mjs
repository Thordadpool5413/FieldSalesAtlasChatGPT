import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
const source = resolve(process.argv[2] || "");
if (!process.argv[2]) throw Error("Supply the completed backup directory.");
const manifest = JSON.parse(
  await readFile(join(source, "manifest.json"), "utf8"),
);
if (
  manifest.version !== 1 ||
  !manifest.verified ||
  !Array.isArray(manifest.files) ||
  !manifest.files.some((f) => f.name === "atlas.sqlite")
)
  throw Error("Invalid backup manifest.");
const temporary = await mkdtemp(join(tmpdir(), "atlas-restore-drill-"));
try {
  for (const file of manifest.files) {
    if (
      !/^(atlas|bts)\.sqlite$/.test(file.name) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw Error("Invalid backup entry.");
    if ((await sha256(join(source, file.name))) !== file.sha256)
      throw Error("Backup checksum mismatch.");
    await copyFile(join(source, file.name), join(temporary, file.name));
    const connection = new DatabaseSync(join(temporary, file.name), {
      readOnly: true,
    });
    try {
      if (
        connection.prepare("PRAGMA integrity_check").get().integrity_check !==
        "ok"
      )
        throw Error("Restored database integrity check failed.");
      if (file.name === "atlas.sqlite")
        connection.prepare("SELECT count(*) FROM records").get();
    } finally {
      connection.close();
    }
  }
  console.log(
    JSON.stringify({
      state: "restore-verified",
      createdAt: manifest.createdAt,
      files: manifest.files.map((f) => f.name),
      limitation:
        "Verified in a temporary local directory. Validate off-host retrieval and application access on your deployment host.",
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
