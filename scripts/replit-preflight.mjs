import { fileURLToPath } from "node:url";
import { inspectRuntime } from "./runtime-state.mjs";
const state = await inspectRuntime(
  fileURLToPath(new URL("../", import.meta.url)),
);
if (state.state !== "stopped") {
  console.log(JSON.stringify(state, null, 2));
  process.exit(state.state === "ready" ? 10 : 1);
}
