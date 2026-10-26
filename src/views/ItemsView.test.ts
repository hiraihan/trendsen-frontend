import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ItemsView from "./ItemsView.vue";
import type { ItemsPage } from "@/api/types";

vi.mock("@/api/endpoints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/endpoints")>();
  return {
    ...original,
    getItems: vi.fn(),
    planItemsCsv: vi.fn(async () => ({
      total_matching: 12,
      max_rows: 100000,
    })),
    getSources: vi.fn(async () => ({
      sources: [
        {
          id: 1,
          key: "hackernews",
          name: "Hacker News",
          integration: "api",
          base_url: null,
          is_active: true,
          config: {},
          created_at: "2026-10-21T10:00:00Z",
          updated_at: "2026-10-21T10:00:00Z",
        },
        {
          id: 2,
          key: "github_blog",
          name: "The GitHub Blog (RSS)",
          integration: "rss",
          base_url: null,
          is_active: true,
          config: {},
          created_at: "2026-10-21T10:00:00Z",
          updated_at: "2026-10-21T10:00:00Z",
        },
      ],
    })),
  };
});

import { getItems, planItemsCsv } from "@/api/endpoints";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/items", component: ItemsView }],
  });
}

function itemRow(id: number, title: string) {
  return {
    id,
    source_id: 1,
    external_id: String(id),
    url: `https://example.test/${id}`,
    title,
    text: null,
    author: "a",
    published_at: "2026-10-21T10:00:00Z",
    metadata: {},
    captured_at: "2026-10-21T10:00:00Z",
    last_seen_at: "2026-10-21T10:00:00Z",
    metrics: null,
  };
}

function pageOf(
  ids: number[],
  nextCursor: string | null,
  total = ids.length,
): ItemsPage {
  return {
    items: ids.map((id) => itemRow(id, `t${id}`)),
    total,
    next_cursor: nextCursor,
  };
}

async function mountView(query = {}) {
  const router = makeRouter();
  await router.push({ path: "/items", query });
  await router.isReady();
  const wrapper = mount(ItemsView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe("ItemsView", () => {
  it("walks two pages without duplicating or skipping rows", async () => {
    vi.mocked(getItems).mockImplementation(async (params) => {
      return params?.cursor === undefined
        ? pageOf([1, 2], "c2")
        : pageOf([3], null);
    });

    const wrapper = await mountView();
    const loadMore = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Load more"));
    await loadMore?.trigger("click");
    await flushPromises();

    const titles = wrapper
      .findAll(".item-card__title")
      .map((node) => node.text());
    expect(titles).toEqual(["t1", "t2", "t3"]);
  });

  it("shows the total matching set and the displayed slice", async () => {
    vi.mocked(getItems).mockResolvedValue(pageOf([1, 2], null, 50));
    const wrapper = await mountView();
    expect(wrapper.find(".items-view__count").text()).toContain(
      "Showing 2 of 50 items",
    );
  });

  it("shows the end-of-results marker once the walk completes", async () => {
    vi.mocked(getItems).mockResolvedValue(pageOf([1], null));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("End of results.");
    const loadMore = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Load more"));
    expect(loadMore).toBeUndefined();
  });

  it("shows the empty state when the page has no rows", async () => {
    vi.mocked(getItems).mockResolvedValue(pageOf([], null));
    const wrapper = await mountView();
    expect(wrapper.findComponent({ name: "EmptyState" }).exists()).toBe(true);
  });

  it("shows an error state when the API fails", async () => {
    vi.mocked(getItems).mockRejectedValue(
      Object.assign(new Error("nope"), { code: "internal_error", status: 500 }),
    );
    const wrapper = await mountView();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it("passes filters from the URL query to the fetcher", async () => {
    vi.mocked(getItems).mockResolvedValue(pageOf([], null));
    await mountView({ source: "hackernews", q: "rust" });
    expect(getItems).toHaveBeenCalledWith(
      expect.objectContaining({ source: "hackernews", q: "rust", limit: 20 }),
    );
  });

  it("passes the viral filter parameters from the URL query", async () => {
    vi.mocked(getItems).mockResolvedValue(pageOf([], null));
    await mountView({
      source: "hackernews",
      keywords: "ai,rust",
      quantile_low: "80",
      quantile_high: "95",
    });
    expect(getItems).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "hackernews",
        keywords: "ai,rust",
        quantile_low: 80,
        quantile_high: 95,
      }),
    );
  });

  it("drops a non-integer quantile from the URL query", async () => {
    vi.mocked(getItems).mockResolvedValue(pageOf([], null));
    await mountView({ quantile_low: "abc", quantile_high: "12.5" });
    const called = vi.mocked(getItems).mock.calls.at(-1)?.[0];
    expect(called?.quantile_low).toBeUndefined();
    expect(called?.quantile_high).toBeUndefined();
  });

  it("re-walks from the first page when the query changes", async () => {
    const router = makeRouter();
    await router.push("/items");
    await router.isReady();
    vi.mocked(getItems).mockResolvedValue(pageOf([1], "c2"));

    const wrapper = mount(ItemsView, { global: { plugins: [router] } });
    await flushPromises();
    const callsBefore = vi.mocked(getItems).mock.calls.length;

    await router.push({ path: "/items", query: { q: "rust" } });
    await flushPromises();

    expect(vi.mocked(getItems).mock.calls.length).toBeGreaterThan(callsBefore);
    expect(vi.mocked(getItems)).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "rust" }),
    );
    wrapper.unmount();
  });
});

describe("ItemsView export dialog", () => {
  it("opens from the Export button and lists every platform as a choice", async () => {
    const wrapper = await mountView();

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Export CSV"))
      ?.trigger("click");
    await flushPromises();

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    // "All platforms" + one radio per known source.
    const radios = dialog.findAll('input[type="radio"]');
    expect(radios.length).toBeGreaterThanOrEqual(2);
    expect(dialog.text()).toContain("All platforms");
  });

  it("pre-selects the platform currently filtered in the URL", async () => {
    const wrapper = await mountView({ source: "hackernews" });

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Export CSV"))
      ?.trigger("click");
    await flushPromises();

    const dialog = wrapper.find('[role="dialog"]');
    const checked = dialog
      .findAll('input[type="radio"]')
      .find((r) => (r.element as HTMLInputElement).checked);
    expect((checked?.element as HTMLInputElement).value).toBe("hackernews");
  });

  it("builds the download link from the dialog's platform and range", async () => {
    const wrapper = await mountView();

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Export CSV"))
      ?.trigger("click");
    await flushPromises();

    const dialog = wrapper.find('[role="dialog"]');
    const download = dialog.find("a[download]");
    // Default selection is "All platforms" — no source param in the URL.
    expect(download.attributes("href")).toBe(
      "http://localhost:8000/export/items.csv?max_rows=10000",
    );

    const hackernews = dialog
      .findAll('input[type="radio"]')
      .find((r) => (r.element as HTMLInputElement).value === "hackernews");
    await hackernews?.setValue();
    await flushPromises();

    expect(dialog.find("a[download]").attributes("href")).toContain(
      "source=hackernews",
    );
  });

  it("sends the chosen row ceiling and clamps an out-of-range one", async () => {
    const wrapper = await mountView();

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Export CSV"))
      ?.trigger("click");
    await flushPromises();

    const dialog = wrapper.find('[role="dialog"]');
    const maxRows = dialog.find("#export-max");
    await maxRows.setValue(500);
    await flushPromises();
    expect(dialog.find("a[download]").attributes("href")).toContain(
      "max_rows=500",
    );

    // The API accepts 1..100 000; an out-of-range value is clamped, never sent as-is
    // (a 422 would replace the download with a JSON error).
    await maxRows.setValue(0);
    await flushPromises();
    expect(dialog.find("a[download]").attributes("href")).toContain(
      "max_rows=1",
    );

    await maxRows.setValue(999999);
    await flushPromises();
    expect(dialog.find("a[download]").attributes("href")).toContain(
      "max_rows=100000",
    );
  });

  it("closes on Cancel without navigating", async () => {
    const wrapper = await mountView();

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Export CSV"))
      ?.trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    await wrapper
      .find('[role="dialog"]')
      .find('button[type="button"].btn--ghost')
      .trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it("shows the matching row count before the download", async () => {
    vi.useFakeTimers();
    vi.mocked(planItemsCsv).mockResolvedValue({
      total_matching: 12,
      max_rows: 100000,
    });
    const wrapper = await mountView();

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Export CSV"))
      ?.trigger("click");
    // The plan is debounced; advancing the clock fires it, then the pending
    // promise is flushed.
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    // The plan ran with the dialog's filters and said what a download would contain.
    expect(planItemsCsv).toHaveBeenCalled();
    const plan = wrapper.find(".export-dialog__plan");
    expect(plan.text()).toContain("12 rows will be exported");
    vi.useRealTimers();
  });

  it("warns when the ceiling would truncate the export", async () => {
    vi.useFakeTimers();
    vi.mocked(planItemsCsv).mockResolvedValue({
      total_matching: 25000,
      max_rows: 100000,
    });
    const wrapper = await mountView();

    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Export CSV"))
      ?.trigger("click");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    // The default ceiling is 10 000, so 25 000 matching rows must warn, not slip by.
    const plan = wrapper.find(".export-dialog__plan--warn");
    expect(plan.exists()).toBe(true);
    expect(plan.text()).toContain("25,000 rows match");
    expect(plan.text()).toContain("capped at 10,000");
    vi.useRealTimers();
  });
});
