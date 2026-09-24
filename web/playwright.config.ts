import { defineConfig } from "@playwright/test";

// End-to-end tests against a running stack (API, web and a database with tests/e2e/seed.sql).
// Locally they use the installed Chrome; CI installs Playwright's Chromium.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.CI ? undefined : "chrome",
    locale: "el-GR",
    timezoneId: "Europe/Athens",
  },
});
