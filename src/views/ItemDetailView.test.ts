import { describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ItemDetailView from "./ItemDetailView.vue";
import type { Item, SnapshotsPage } from "@/api/types";

vi.mock("@/api/endpoints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/endpoints")>();
  return {
    ...original,
    getItem: vi.fn(),
    getItemSnapshots: vi.fn(),
    getSources: vi.fn(async () => ({ sources: [] })),
  };
});

import { getItem, getItemSnapshots } from "@/api/endpoints";

const baseItem: Item = {
  id: 4,
  source_id: 1,
  external_id: "50178455",
  url: "https://example.test/article",
  title: "Whatever Happened to Fire Escapes",
  text: null,
  author: "sohkamyung",
  published_at: "2026-10-21T10:14:43Z",
  metadata: { type: "story" },
  captured_at: "2026-10-21T10:47:25Z",
  last_seen_at: "2026-10-21T10:49:35Z",
  metrics: { score: 42, descendants: 7 },
};

function mountView(id = "4") {
  return mount(ItemDetailView, {
    props: { id },
    global: {
      stubs: { RouterLink: true },
    },
  });
}

describe("ItemDetailView", () => {
  it("renders the item with its newest metrics", async () => {
    vi.mocked(getItem).mockResolvedValue(baseItem);
    vi.mocked(getItemSnapshots).mockResolvedValue({ snapshots: [] });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Whatever Happened to Fire Escapes");
    expect(wrapper.text()).toContain("score:");
    expect(wrapper.text()).toContain("42");
  });

  it("renders the explicit no-metrics state (a normal RSS item)", async () => {
    vi.mocked(getItem).mockResolvedValue({ ...baseItem, metrics: null });
    vi.mocked(getItemSnapshots).mockResolvedValue({ snapshots: [] });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("no metrics captured");
  });

  it("renders the snapshot empty state without crashing", async () => {
    vi.mocked(getItem).mockResolvedValue(baseItem);
    vi.mocked(getItemSnapshots).mockResolvedValue({ snapshots: [] });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.findComponent({ name: "EmptyState" }).exists()).toBe(true);
  });

  it("renders a not-found state driven by the envelope code", async () => {
    vi.mocked(getItem).mockRejectedValue(
      Object.assign(new Error("Item not found"), {
        code: "not_found",
        status: 404,
      }),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Item not found.");
    expect(getItemSnapshots).not.toHaveBeenCalled();
  });

  it("rejects a non-positive id without calling the API", async () => {
    mountView("0");
    await flushPromises();
    expect(getItem).not.toHaveBeenCalled();
  });

  it("surfaces a snapshot failure without losing the item", async () => {
    vi.mocked(getItem).mockResolvedValue(baseItem);
    vi.mocked(getItemSnapshots).mockRejectedValue(
      Object.assign(new Error("db down"), {
        code: "service_unavailable",
        status: 503,
      }),
    );

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain("Whatever Happened to Fire Escapes");
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it("passes snapshots through to the chart as stored", async () => {
    const snapshots: SnapshotsPage = {
      snapshots: [
        {
          id: 5,
          item_id: 4,
          captured_at: "2026-10-21T10:47:25Z",
          metrics: { score: 31, descendants: 4 },
        },
        {
          id: 12,
          item_id: 4,
          captured_at: "2026-10-21T11:47:25Z",
          metrics: { score: 42, descendants: 7 },
        },
      ],
    };
    vi.mocked(getItem).mockResolvedValue(baseItem);
    vi.mocked(getItemSnapshots).mockResolvedValue(snapshots);

    const wrapper = mountView();
    await flushPromises();

    const chart = wrapper.findComponent({ name: "SnapshotsChart" });
    expect(chart.props("snapshots")).toEqual(snapshots.snapshots);
  });
});
