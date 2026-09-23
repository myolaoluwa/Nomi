import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5174",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev --workspace @nomi/api",
      url: "http://localhost:4100/health",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        DATA_DIR: "./.data-e2e",
        DATABASE_URL: "",
        NODE_ENV: "test",
        PORT: "4100",
        WEB_ORIGIN: "http://localhost:5174",
      },
    },
    {
      command: "npm run dev --workspace @nomi/web -- --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://localhost:4100", VITE_API_URL: "" },
      timeout: 120000,
    },
  ],
});
