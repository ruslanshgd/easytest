import { defineConfig, devices } from "@playwright/test";
import path from "path";

const analyticsBase = "http://localhost:5174";
const viewerBase = "http://localhost:5173";
const rootDir = path.join(__dirname, "..");

export default defineConfig({
  testDir: path.join(__dirname, "tests"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "analytics",
      use: { ...devices["Desktop Chrome"], baseURL: analyticsBase },
      testMatch: /01-auth|02-create|03-folders|04-blocks|05-edit|06-study|07-share/,
    },
    {
      name: "viewer",
      use: { ...devices["Desktop Chrome"], baseURL: viewerBase },
      testMatch: /08-viewer/,
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: path.join(rootDir, "figma-analytics"),
      url: analyticsBase,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev",
      cwd: path.join(rootDir, "figma-viewer"),
      url: viewerBase,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
