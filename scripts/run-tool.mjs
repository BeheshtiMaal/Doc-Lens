import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Windows accepts differently cased paths, but Node caches modules by path string.
// Start a fresh process: chdir alone can retain the original cwd's casing.
const projectRoot = realpathSync.native(fileURLToPath(new URL("..", import.meta.url)));
const [tool, ...args] = process.argv.slice(2);
const entrypoints = {
  next: "node_modules/next/dist/bin/next",
  playwright: "node_modules/playwright/cli.js",
};
if (!Object.hasOwn(entrypoints, tool)) {
  throw new Error("Expected a supported tool: next or playwright.");
}
const child = spawn(process.execPath, [join(projectRoot, entrypoints[tool]), ...args], {
  cwd: projectRoot,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.once("error", (error) => {
  console.error("Could not start " + tool + ":", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
