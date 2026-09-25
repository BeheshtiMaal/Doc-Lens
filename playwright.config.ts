import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // Give Next.js' first Windows dev-server compilation room to complete.
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/",
    reuseExistingServer: false,
    timeout: 300000,
    env: { ...process.env, APP_ORIGIN: "http://127.0.0.1:3100" },
  },
});
