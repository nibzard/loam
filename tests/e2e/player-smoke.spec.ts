import { expect, test, type APIRequestContext } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5296";

/**
 * Player smoke tests against a running loam environment.
 *
 * These specs drive the real app (marketing pages, auth screen, and the
 * dashboard video route). They need a dev environment with Clerk and Convex
 * configured; they never sign in, so no test account is required. When no
 * server answers at the base URL, every test skips instead of failing.
 */

const VIDEO_PATH = "/dashboard/e2e-team/e2e-project/e2e-video";

async function requireEnvironment(request: APIRequestContext) {
  const response = await request
    .get("/", { timeout: 5_000 })
    .then((probe) => probe.ok())
    .catch(() => false);
  test.skip(
    !response,
    `No server reachable at ${BASE_URL}. Start one (for example "bun run dev") or set E2E_BASE_URL. See tests/e2e/README.md.`,
  );
}

test.beforeEach(async ({ request }) => {
  await requireEnvironment(request);
});

test("homepage loads and shows loam branding", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "loam", exact: true })).toBeVisible();
});

test("sign-in page renders the auth form", async ({ page }) => {
  await page.goto("/sign-in");

  // AuthShell brand link renders before Clerk finishes loading.
  await expect(page.getByRole("link", { name: "loam." })).toBeVisible();

  // The identifier field appears once the Clerk client is loaded.
  await expect(page.getByLabel("Email or username")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("video page redirects unauthenticated visitors to sign-in", async ({ page }) => {
  await page.goto(VIDEO_PATH, { waitUntil: "domcontentloaded" });

  // The dashboard layout bounces signed-out users to /sign-in and remembers
  // the original path in redirect_url.
  await page.waitForURL(/\/sign-in/, { timeout: 20_000 });

  const url = new URL(page.url());
  expect(url.pathname).toBe("/sign-in");
  expect(url.searchParams.get("redirect_url")).toContain(VIDEO_PATH);

  await expect(page.getByLabel("Email or username")).toBeVisible();
});
