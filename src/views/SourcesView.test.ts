import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import SourcesView from "./SourcesView.vue";
import type { Source } from "@/api/types";

vi.mock("@/api/endpoints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/endpoints")>();
  return { ...original, getSources: vi.fn(), patchSourceActive: vi.fn() };
});

import { getSources, patchSourceActive } from "@/api/endpoints";
import { useAdminKey } from "@/composables/useAdminKey";

function sourceRow(overrides: Partial<Source> = {}): Source {
  return {
    id: 1,
    key: "hackernews",
    name: "Hacker News",
    integration: "api",
    base_url: null,
    is_active: true,
    config: {},
    created_at: "2026-10-21T10:00:00Z",
    updated_at: "2026-10-21T10:00:00Z",
    ...overrides,
  };
}

function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/sources", component: SourcesView },
      { path: "/collect", component: { template: "<div />" } },
      { path: "/items", component: { template: "<div />" } },
    ],
  });
  return mount(SourcesView, { global: { plugins: [router] } });
}

beforeEach(() => {
  useAdminKey().clear();
  vi.mocked(getSources).mockResolvedValue({ sources: [sourceRow()] });
  vi.mocked(patchSourceActive).mockReset();
});

describe("SourcesView collect toggle", () => {
  it("asks for the admin key before toggling, without calling the API", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find(".sources-view__table tbody button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".key-dialog").exists()).toBe(true);
    expect(patchSourceActive).not.toHaveBeenCalled();
  });

  it("pauses a source when the admin key is set", async () => {
    useAdminKey().set("good-key", false);
    vi.mocked(patchSourceActive).mockResolvedValue(
      sourceRow({ is_active: false }),
    );
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find(".sources-view__table tbody button").trigger("click");
    await flushPromises();

    expect(patchSourceActive).toHaveBeenCalledWith(
      "hackernews",
      false,
      "good-key",
    );
    expect(wrapper.find(".sources-view__table tbody button").text()).toContain(
      "Collect",
    );
  });
});
