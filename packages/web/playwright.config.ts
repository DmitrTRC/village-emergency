import { defineConfig } from "@playwright/test";

const API = "http://localhost:8788";
const WEB = "http://localhost:4173";

export default defineConfig({
  testDir: "./e2e",
  // Один PG на все спеки + /__test__/reset между ними → строго последовательно.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  use: {
    baseURL: WEB,
    geolocation: { latitude: 55.751244, longitude: 37.618423 },
    permissions: ["geolocation"],
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm -C ../shared build && pnpm -C ../server exec tsx test-server.ts",
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { E2E_API_PORT: "8788", E2E_WEB_ORIGIN: WEB },
    },
    {
      command: "pnpm build && pnpm preview --port 4173 --strictPort",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_BASE: API },
    },
  ],
});
