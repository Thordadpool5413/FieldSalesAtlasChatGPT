import { execFileSync } from "node:child_process";
export function buildIdentity(cwd, mode = "build") {
  function git(args) {
    try {
      return execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  }
  const candidate = git(["rev-parse", "HEAD"]);
  const revision =
    candidate && /^[a-f0-9]{40}$/.test(candidate) ? candidate : null;
  const changes = revision
    ? git(["status", "--porcelain", "--untracked-files=no"])
    : null;
  return {
    app: "Field Sales Atlas",
    revision,
    sourceModified: changes === null ? null : changes.length > 0,
    builtAt: mode === "build" ? new Date().toISOString() : null,
    mode,
    ...(mode === "development"
      ? {
          checkedAt: new Date().toISOString(),
          limitation:
            "Development source identity; this is not a published build.",
        }
      : {}),
  };
}
