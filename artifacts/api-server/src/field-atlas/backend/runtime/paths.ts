import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export function workspaceRoot(start = process.cwd()) {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

export function workspacePath(path: string) {
  return isAbsolute(path) ? path : resolve(workspaceRoot(), path);
}
