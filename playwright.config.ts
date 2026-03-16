import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";

loadEnvConfig(process.cwd());

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const webServerURL = process.env.PLAYWRIGHT_WEB_SERVER_URL || baseURL;
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || "bun run dev:next";
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === undefined
    ? true
    : process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 0 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: webServerURL,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.PLAYWRIGHT_DATABASE_URL || process.env.DATABASE_URL || "",
      DISABLE_RATE_LIMITS:
        process.env.PLAYWRIGHT_DISABLE_RATE_LIMITS || "1",
    },
    reuseExistingServer,
  },
});
