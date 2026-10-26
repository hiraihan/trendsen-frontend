import { expect, test } from "@playwright/test";

/**
 * The quiet failures around the happy path: a URL that matches no route, an API that will
 * not answer, a filtered list you came back from, and the first Tab of a keyboard session.
 * Each one was a real gap; the tests pin the behaviour, not the pixels.
 */

test("an unknown URL says so and leads back to the items", async ({ page }) => {
  await page.goto("/nowhere");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Page not found · TrendSentinel");

  await page.getByRole("link", { name: "Collected items" }).click();
  await expect(page).toHaveURL(/\/items$/);
  await expect(
    page.getByRole("heading", { name: "Collected items" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Collected items · TrendSentinel");
});

test("a failed list load offers a retry that actually recovers", async ({
  page,
}) => {
  // Kill only the item list; /sources still answers, so the page renders normally.
  await page.route("http://localhost:8000/items**", (route) => route.abort());
  await page.goto("/items");
  await expect(page.getByRole("alert")).toContainText("Cannot reach the API");
  await expect(page.locator(".item-card__title")).toHaveCount(0);

  // No reload: the retry button re-runs the same query against a working API.
  await page.unroute("http://localhost:8000/items**");
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.locator(".item-card__title").first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("back from an item returns to the same filtered list", async ({
  page,
}) => {
  await page.goto("/items");

  const chip = page.locator(".item-card__source").first();
  await expect(chip).toBeVisible();
  const sourceKey = (await chip.innerText()).trim();

  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith("/items") &&
      url.searchParams.get("source") === sourceKey
    );
  });
  await chip.click();
  await filtered;
  await expect(page.locator("#filter-source")).toHaveValue(sourceKey);

  // The list still owns the request; the detail page just needs its snapshot section.
  await page.locator(".item-card__detail-link").first().click();
  await expect(page).toHaveURL(/\/items\/\d+/);
  await expect(page.getByText("Snapshot history")).toBeVisible();

  // The back link carries the query, not just the path.
  const back = page.locator(".item-detail__back");
  await expect(back).toHaveAttribute(
    "href",
    new RegExp(`source=${sourceKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
  await back.click();

  await expect(page).toHaveURL(
    new RegExp(`source=${sourceKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  );
  await expect(page.locator("#filter-source")).toHaveValue(sourceKey);
});

test("the first Tab reaches the skip link and it jumps past the nav", async ({
  page,
}) => {
  await page.goto("/items");
  await expect(
    page.getByRole("heading", { name: "Collected items" }),
  ).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();

  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("content");
});
