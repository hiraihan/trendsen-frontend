import { expect, test, type Page } from "@playwright/test";

/**
 * The filters are the one part of the list view that talks to the API with a *derived* value:
 * a `datetime-local` wall time has to leave as a timezone-aware instant (docs/api.md), and a
 * title search has to arrive as `q`. Both were silently wrong once; these tests pin the
 * request, not the pixels.
 */
const SINCE_LOCAL = "2026-10-20T10:00";
const UNTIL_LOCAL = "2026-10-21T09:59";

/** The request the app makes for the first page, once a filter changes. */
function itemsRequest(page: Page, match: (url: URL) => boolean) {
  return page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname.endsWith("/items") && match(url);
  });
}

test("the time range leaves as a timezone-aware instant", async ({ page }) => {
  await page.goto("/items");

  const sinceRequest = itemsRequest(page, (url) =>
    url.searchParams.has("since"),
  );
  await page.locator("#filter-since").fill(SINCE_LOCAL);
  const sinceUrl = new URL((await sinceRequest).url());
  expect(sinceUrl.searchParams.get("since")).toBe(
    new Date(SINCE_LOCAL).toISOString(),
  );

  const untilRequest = itemsRequest(page, (url) =>
    url.searchParams.has("until"),
  );
  await page.locator("#filter-until").fill(UNTIL_LOCAL);
  const untilUrl = new URL((await untilRequest).url());
  expect(untilUrl.searchParams.get("until")).toBe(
    new Date(UNTIL_LOCAL).toISOString(),
  );

  // A filtered view is a link: the range survives a reload.
  await expect(page).toHaveURL(/since=.*Z/);
  await page.reload();
  await expect(page.locator("#filter-since")).toHaveValue(SINCE_LOCAL);
  await expect(page.locator("#filter-until")).toHaveValue(UNTIL_LOCAL);
});

test("a title search arrives as q and clears again", async ({ page }) => {
  await page.goto("/items");

  const searchRequest = itemsRequest(
    page,
    (url) => url.searchParams.get("q") === "rust",
  );
  await page.locator("#filter-q").fill("rust");
  await searchRequest;
  await expect(page).toHaveURL(/q=rust/);

  const clearedRequest = itemsRequest(
    page,
    (url) => !url.searchParams.has("q"),
  );
  await page.locator("#filter-q").fill("");
  await clearedRequest;
  await expect(page).not.toHaveURL(/q=/);
});

test("a source chip filters the list by that source", async ({ page }) => {
  await page.goto("/items");

  const chip = page.locator(".item-card__source").first();
  await expect(chip).toBeVisible();
  const sourceKey = (await chip.innerText()).trim();

  const chipRequest = itemsRequest(
    page,
    (url) => url.searchParams.get("source") === sourceKey,
  );
  await chip.click();
  await chipRequest;

  expect(new URL(page.url()).searchParams.get("source")).toBe(sourceKey);
  // The filter shows up in the dropdown, and the chip's own source now owns the list.
  await expect(page.locator("#filter-source")).toHaveValue(sourceKey);
});

test("Clear filters drops every parameter at once", async ({ page }) => {
  await page.goto("/items");

  const chip = page.locator(".item-card__source").first();
  await expect(chip).toBeVisible();
  const sourceKey = (await chip.innerText()).trim();
  await chip.click();
  await expect(page.locator("#filter-source")).toHaveValue(sourceKey);

  const searchRequest = itemsRequest(
    page,
    (url) => url.searchParams.get("q") === "the",
  );
  await page.locator("#filter-q").fill("the");
  await searchRequest;
  await expect(page).toHaveURL(/q=the/);

  const unfiltered = itemsRequest(
    page,
    (url) => !url.searchParams.has("q") && !url.searchParams.has("source"),
  );
  await page.locator(".filters__actions button").first().click();
  await unfiltered;

  await expect(page).toHaveURL(/\/items$/);
  await expect(page.locator(".filters__actions button")).toHaveCount(0);
});
