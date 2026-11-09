import { Client } from "@replit/object-storage";
import { DatabaseSync, backup } from "node:sqlite";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, rename, chmod } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";
import { db } from "./sdk";
import { workspacePath } from "./paths";
import type { RecordStore } from "./store";

type Archive = {
  id: string;
  object: string;
  sha256: string;
  archivedAt: string;
  periods: number;
};
const table = "atlas_bts_archives";
const file = () =>
  workspacePath(
    (process.env.ATLAS_DATA_DIR || "artifacts/field-sales-atlas/data") +
      "/bts.sqlite",
  );
async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
function validate(path: string) {
  const connection = new DatabaseSync(path, { readOnly: true });
  try {
    if (connection.prepare("PRAGMA quick_check").get()?.quick_check !== "ok")
      throw Error("BTS cache integrity validation failed.");
    const periods = Number(
      connection.prepare("SELECT count(*) AS n FROM datasets").get()?.n || 0,
    );
    if (!periods) throw Error("BTS cache contains no imported datasets.");
    connection
      .prepare("SELECT period,origin,destination FROM flights LIMIT 1")
      .get();
    return periods;
  } finally {
    connection.close();
  }
}
function client() {
  return new Client({ bucketId: process.env.ATLAS_BACKUP_BUCKET_ID! });
}
type ArchiveOptions = {
  database: RecordStore;
  path: string;
  storage: Pick<Client, "uploadFromFilename" | "downloadToFilename">;
  scope: string;
};
function defaults(): ArchiveOptions | null {
  return process.env.ATLAS_BACKUP_BUCKET_ID && db.kind === "postgres"
    ? {
        database: db,
        path: file(),
        storage: client(),
        scope: process.env.ATLAS_BACKUP_SCOPE || "",
      }
    : null;
}
export async function archiveBtsCache(options = defaults()) {
  if (
    !options ||
    options.database.kind !== "postgres" ||
    !existsSync(options.path)
  )
    return { state: "not-archived" };
  const { database, path, storage, scope } = options;
  if (!["development", "production"].includes(scope || ""))
    throw Error("Set ATLAS_BACKUP_SCOPE before archiving BTS data.");
  const temporary = await mkdtemp(join(dirname(path), ".bts-archive-"));
  try {
    const snapshot = join(temporary, "bts.sqlite");
    const source = new DatabaseSync(path, { readOnly: true });
    try {
      await backup(source, snapshot);
    } finally {
      source.close();
    }
    const periods = validate(snapshot),
      sha256 = await digest(snapshot);
    const object = "atlas/" + scope + "/bts/" + randomUUID() + ".sqlite";
    const upload = await storage.uploadFromFilename(object, snapshot, {
      compress: false,
    });
    if (!upload.ok) throw Error("Private BTS archive upload failed.");
    const returned = join(temporary, "returned.sqlite");
    if (
      !(
        await storage.downloadToFilename(object, returned, {
          decompress: false,
        })
      ).ok ||
      (await digest(returned)) !== sha256
    )
      throw Error("Private BTS archive round-trip checksum failed.");
    validate(returned);
    await database.tx.update(table, [
      {
        id: "latest",
        record: {
          object,
          sha256,
          periods,
          archivedAt: new Date().toISOString(),
        },
      },
    ]);
    return { state: "archived-and-read-back-verified", periods, sha256 };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
export async function restoreBtsCache(options = defaults()) {
  if (
    !options ||
    existsSync(options.path) ||
    options.database.kind !== "postgres"
  )
    return;
  const { database, path, storage } = options;
  const [archive] = await database.get<Archive>(table, ["latest"]);
  if (!archive) return;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(dirname(path), ".bts-restore-"));
  try {
    const downloaded = join(temporary, "bts.sqlite");
    if (
      !(
        await storage.downloadToFilename(archive.object, downloaded, {
          decompress: false,
        })
      ).ok ||
      (await digest(downloaded)) !== archive.sha256
    )
      throw Error("Private BTS cache restore checksum failed.");
    if (validate(downloaded) !== archive.periods)
      throw Error("Private BTS cache dataset count mismatch.");
    await chmod(downloaded, 0o600);
    await rename(downloaded, path);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
