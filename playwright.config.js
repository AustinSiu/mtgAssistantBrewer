import { defineConfig } from "@playwright/test";

// Set CHROMIUM_PATH to use a pre-installed browser instead of the one
// downloaded by `npx playwright install chromium`.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1280, height: 800 },
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
  },
});
