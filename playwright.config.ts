import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["json", { outputFile: "docs/testing/playwright-results.json" }],
  ],
});
