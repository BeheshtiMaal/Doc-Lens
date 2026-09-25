import { spawnSync } from "node:child_process";

const scripts = process.env.VERCEL_ENV === "production" ? ["db:migrate", "build"] : ["build"];

for (const script of scripts) {
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    console.error("Could not run " + script + ": " + result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
