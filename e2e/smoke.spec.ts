import { expect, test } from "@playwright/test";

/**
 * Full-stack smoke (T19): items → detail → snapshots → collect trigger. The admin key
 * comes from the environment of whoever runs the test; it is never asserted into page
 * text or URLs — the last block verifies exactly that.
 */
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";

test("walk items → detail → snapshots → collect", async ({ page }) => {
  // Record every request so the key-leak check can scan them all at the end.
  const requestUrls: string[] = [];
  page.on("request", (request) => requestUrls.push(request.url()));
  // -- items ------------------------------------------------------------------
  await page.goto("/items");
  await expect(
    page.getByRole("heading", { name: "Collected items" }),
  ).toBeVisible();

  // Wait for real collected rows from the compose stack.
  const firstDetail = page.locator(".item-card__detail-link").first();
  await expect(firstDetail).toBeVisible();
  await firstDetail.click();

  // -- detail -----------------------------------------------------------------
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText(
    "Collected items",
  );
  await expect(page.getByText("Snapshot history")).toBeVisible();

  // -- collect ----------------------------------------------------------------
  await page.getByRole("link", { name: "Collect" }).click();
  await expect(
    page.getByRole("heading", { name: "Collection runs" }),
  ).toBeVisible();

  // Wrong key → 401 message, no run queued.
  await page.getByRole("button", { name: "Enter admin key…" }).click();
  await page.locator('input[type="password"]').fill("wrong-key");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Trigger collection" }).click();
  await expect(page.getByRole("alert")).toContainText("Not authorized");

  // Right key → 202, queued run shows up.
  await page.getByRole("button", { name: "Clear key" }).click();
  await page.getByRole("button", { name: "Enter admin key…" }).click();
  await page.locator('input[type="password"]').fill(ADMIN_KEY);
  // Do not tick "remember": the key must not outlive the tab by default.
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Trigger collection" }).click();
  await expect(page.getByRole("status")).toContainText(/Queued run #\d+/);

  // -- the key never leaks ------------------------------------------------------
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain(ADMIN_KEY);
  for (const url of requestUrls) {
    expect(url).not.toContain(ADMIN_KEY);
  }
});
