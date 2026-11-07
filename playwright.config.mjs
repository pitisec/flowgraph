// Testy end-to-end: przykłady i edytor w Chromium (pliki otwierane przez file://, bez serwera).
import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1480, height: 920 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
