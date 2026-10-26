import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ItemCard from "./ItemCard.vue";
import type { Item } from "@/api/types";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/items/:id", component: { template: "<div />" } },
      { path: "/items", component: { template: "<div />" } },
    ],
  });
}

function itemWith(
  metadata: Record<string, unknown>,
  overrides: Partial<Item> = {},
): Item {
  return {
    id: 1,
    source_id: 1,
    external_id: "t3_1",
    url: "https://example.test/1",
    title: "A titled item",
    text: null,
    author: "someone",
    published_at: "2026-10-21T10:00:00Z",
    metadata,
    captured_at: "2026-10-21T10:00:00Z",
    last_seen_at: "2026-10-21T10:00:00Z",
    metrics: null,
    ...overrides,
  };
}

async function mountCard(item: Item) {
  const router = makeRouter();
  await router.push("/items");
  await router.isReady();
  return mount(ItemCard, {
    props: { item, sourceLabel: "reddit_technology" },
    global: { plugins: [router] },
  });
}

describe("ItemCard thumbnail", () => {
  it("renders the extracted thumbnail when metadata carries one", async () => {
    const wrapper = await mountCard(
      itemWith({ thumbnail_url: "https://cdn.test/cover.jpg" }),
    );

    const img = wrapper.find(".item-card__thumb img");
    expect(img.exists()).toBe(true);
    // Loaded lazily and referrer-free: the deployment's origin is not disclosed to
    // the platform CDN that serves the image.
    expect(img.attributes("loading")).toBe("lazy");
    expect(img.attributes("referrerpolicy")).toBe("no-referrer");
  });

  it("shows the monogram fallback when there is no thumbnail", async () => {
    const wrapper = await mountCard(itemWith({}));

    expect(wrapper.find(".item-card__thumb img").exists()).toBe(false);
    expect(wrapper.find(".item-card__thumb-fallback").text()).toBe("R");
  });

  it("swaps to the fallback when the image fails to load", async () => {
    const wrapper = await mountCard(
      itemWith({ thumbnail_url: "https://cdn.test/dead.jpg" }),
    );
    expect(wrapper.find(".item-card__thumb img").exists()).toBe(true);

    await wrapper.find(".item-card__thumb img").trigger("error");

    expect(wrapper.find(".item-card__thumb img").exists()).toBe(false);
    expect(wrapper.find(".item-card__thumb-fallback").exists()).toBe(true);
  });
});

describe("ItemCard per-post details", () => {
  it("shows both time axes with explicit labels", async () => {
    const wrapper = await mountCard(itemWith({}));

    const times = wrapper.findAll(".item-card__time time");
    expect(times).toHaveLength(2);
    // "posted" is the source's publication time; "collected" is TrendSentinel's.
    expect(wrapper.find(".item-card__time").text()).toContain("posted");
    expect(wrapper.find(".item-card__time--captured").text()).toContain(
      "collected",
    );
    expect(times[0].attributes("datetime")).toBe("2026-10-21T10:00:00Z");
    expect(times[1].attributes("datetime")).toBe("2026-10-21T10:00:00Z");
  });

  it("says posted: unknown when the source gave no publication time", async () => {
    const wrapper = await mountCard(itemWith({}, { published_at: null }));

    expect(wrapper.find(".item-card__time").text()).toContain("unknown");
    // The collected time is always present — capture is a fact we own.
    expect(wrapper.find(".item-card__time--captured").exists()).toBe(true);
  });

  it("shows a two-line excerpt derived from the stored text", async () => {
    const wrapper = await mountCard(
      itemWith(
        {},
        { text: "A stored sentence that survives stripping. ".repeat(6) },
      ),
    );

    const excerpt = wrapper.find(".item-card__excerpt");
    expect(excerpt.exists()).toBe(true);
    expect(excerpt.text()).toContain("…");
    expect(excerpt.text().length).toBeLessThanOrEqual(181);
  });

  it("shows no excerpt when the item has no text", async () => {
    const wrapper = await mountCard(itemWith({}));

    expect(wrapper.find(".item-card__excerpt").exists()).toBe(false);
  });

  it("renders the newest snapshot metrics the list endpoint now carries", async () => {
    const wrapper = await mountCard(
      itemWith({}, { metrics: { score: 1234, comments: 87, extra: 5 } }),
    );

    const metrics = wrapper.findAll(".metrics-badge__item");
    // Capped at three entries so one noisy payload cannot flood the card.
    expect(metrics).toHaveLength(3);
    expect(metrics[0].text()).toContain("1,234");
  });

  it("shows no metrics block when the item has none", async () => {
    const wrapper = await mountCard(itemWith({}));

    expect(wrapper.find(".item-card__metrics").exists()).toBe(false);
  });

  it("shows a viral badge with the percentile on a viral-filtered item", async () => {
    const wrapper = await mountCard(
      itemWith({}, { viral: true, percentile: 92.4 }),
    );

    const badge = wrapper.find(".item-card__viral");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("Viral");
    expect(badge.text()).toContain("P92");
  });

  it("shows no viral badge on an unfiltered item", async () => {
    const wrapper = await mountCard(itemWith({}));

    expect(wrapper.find(".item-card__viral").exists()).toBe(false);
  });
});
