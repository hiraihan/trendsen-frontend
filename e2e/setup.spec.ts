import { expect, test } from "@playwright/test";

/**
 * Setup flow E2E (credential provisioning through the web).
 *
 * Runs against the compose stack like smoke.spec.ts. The admin key comes from the
 * environment of whoever runs the test; the credentials used here are unmistakable
 * placeholders — the backend rejects them at the platform boundary and the repo's
 * credential-literal scan requires exactly this "PROBE" marker — but the *API* accepts
 * and stores them, which is the behaviour under test.
 *
 * The test cleans up after itself (see CLEANUP): the API is rotation-only by design, so
 * the scrub runs through the compose db, exactly as the operator runbook would.
 */
import { execSync } from "node:child_process";

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

const PROBE_CREDENTIALS: Record<string, string> = {
  "Client ID": "PROBE-REDDIT-CLIENT-ID-E2E-4c8a11",
  "Client secret": "PROBE-REDDIT-CLIENT-SECRET-E2E-4c8a11",
  "User agent": "trendsentinel:e2e-setup:1.0 (by /u/e2e-probe)",
};

/** Remove every PROBE key this spec stored. Safe to run when nothing was stored. */
function scrubProbeKeys(): void {
  execSync(
    "docker exec trendsentinel-db-1 psql -U trendsentinel -d trendsentinel -c \"UPDATE sources SET config = config - 'reddit_client_id' - 'reddit_client_secret' - 'reddit_user_agent' WHERE config ?| ARRAY['reddit_client_id','reddit_client_secret'] AND config::text LIKE '%PROBE-%';\"",
    { stdio: "pipe" },
  );
}

test("setup: unlock, provision reddit credentials, source goes ready", async ({
  page,
}) => {
  const requestUrls: string[] = [];
  page.on("request", (request) => requestUrls.push(request.url()));

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();

  // No status section renders before a key exists: the readiness map itself is
  // admin-key-guarded now (ADR-0006, amended), so the page opens on the unlock panel.
  await expect(
    page.getByRole("heading", { name: "Admin key" }),
  ).toBeVisible();
  await expect(page.locator(".setup-source")).toHaveCount(0);
  // The platforms behind the unlock are named up front, so the key panel reads as
  // the doorway, not the destination.
  await expect(page.getByRole("list", { name: "Platforms awaiting credentials" }).locator("li")).toHaveCount(3);

  await page.locator("#setup-admin-key").fill(ADMIN_KEY);
  await page.getByRole("button", { name: "Unlock setup" }).click();

  // Unlock verified the key (a wrong key would surface a rejection here instead):
  // the three credentialed sources appear with their forms unlocked.
  await expect(
    page.getByRole("heading", { name: /Reddit r\/technology/ }),
  ).toBeVisible();

  const reddit = page
    .locator("section", { has: page.getByRole("heading", { name: /Reddit/ }) })
    .first();

  const inputs = reddit.locator("input:not([type='checkbox'])");
  const entries = Object.entries(PROBE_CREDENTIALS);
  for (const [index, [, value]] of entries.entries()) {
    await inputs.nth(index).fill(value);
  }

  // Uncheck "activate": this test provisions against the live stack, and a fake
  // credential must never arm the real scheduler (it would 401 on every tick).
  await reddit.getByRole("checkbox").uncheck();
  await reddit.getByRole("button", { name: "Save credentials" }).click();
  await expect(reddit.getByRole("status")).toContainText("Stored");
  await expect(reddit.getByText("set").first()).toBeVisible();

  // The values must not be echoed anywhere on the page or in any request URL.
  const bodyText = await page.locator("body").innerText();
  for (const value of Object.values(PROBE_CREDENTIALS)) {
    expect(bodyText).not.toContain(value);
  }
  for (const url of requestUrls) {
    for (const value of Object.values(PROBE_CREDENTIALS)) {
      expect(url).not.toContain(value);
    }
  }

  // The Collect screen is one click away, per the setup-done hint.
  await page.getByRole("link", { name: "Collect" }).click();
  await expect(
    page.getByRole("heading", { name: "Collection runs" }),
  ).toBeVisible();

  // Leave no fake credential in the stack's config (§9 hygiene): the API is
  // rotation-only by design, so the scrub goes through the compose db directly.
  scrubProbeKeys();
});
