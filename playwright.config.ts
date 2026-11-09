import { defineConfig } from "@playwright/test";

/**
 * End-to-end harness for the player and app shell.
 *
 * The suite runs against an already-started environment, for example
 * `bun run dev` (web on port 5296 plus `bunx convex dev`). `webServer` is
 * deliberately unset: this machine has no Convex credentials, so the config
 * never starts a server itself. Specs probe the base URL first and skip with
 * a clear reason when no environment is reachable. See tests/e2e/README.md.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5296";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.spec.ts",
  outputDir: "./tests/e2e/test-results",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
  },
});
