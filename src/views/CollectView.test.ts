import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import CollectView from "./CollectView.vue";

vi.mock("@/api/endpoints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/endpoints")>();
  return { ...original, getSources: vi.fn(async () => ({ sources: [] })) };
});

vi.mock("@/api/collect", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/collect")>();
  return {
    ...original,
    getCollectStatus: vi.fn(async () => ({ runs: [], active: [] })),
    postCollectRun: vi.fn(),
  };
});

import { postCollectRun } from "@/api/collect";
import { getCollectStatus } from "@/api/collect";
import { ApiError } from "@/api/client";
import { useAdminKey } from "@/composables/useAdminKey";
import type { CollectRun } from "@/api/types";

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return mount(CollectView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }]],
      stubs: { Teleport: true },
    },
  });
}

afterEach(() => {
  sessionStorage.clear();
  vi.mocked(postCollectRun).mockReset();
});

beforeEach(() => {
  // useAdminKey holds module-level state; reset it explicitly per test.
  const { clear } = useAdminKey();
  clear();
});

async function fillKey(wrapper: ReturnType<typeof mountView>) {
  await wrapper.find(".collect-view__key button").trigger("click");
  await flushPromises(); // dialog renders on nextTick
  await wrapper.find('input[type="password"]').setValue("good-key");
  await wrapper.find(".key-dialog form").trigger("submit");
  await flushPromises();
}

async function submit(wrapper: ReturnType<typeof mountView>) {
  await wrapper.find(".trigger").trigger("submit");
  await flushPromises();
}

describe("CollectView trigger form", () => {
  it("disables the trigger button until an admin key is entered", async () => {
    const wrapper = mountView();
    const button = wrapper.find(".trigger button[type='submit']");
    expect(button.attributes("disabled")).toBeDefined();
    await fillKey(wrapper);
    expect(
      wrapper.find(".trigger button[type='submit']").attributes("disabled"),
    ).toBeUndefined();
  });

  it("shows an unauthorized message when no key was entered", async () => {
    const wrapper = mountView();
    await submit(wrapper);
    expect(postCollectRun).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').text()).toContain("Not authorized");
  });

  it("maps 401 to the not-authorized message", async () => {
    const wrapper = mountView();
    await fillKey(wrapper);
    vi.mocked(postCollectRun).mockRejectedValue(
      new ApiError("unauthorized", "missing key", null, 401),
    );
    await submit(wrapper);
    expect(wrapper.find('[role="alert"]').text()).toContain("Not authorized");
  });

  it("maps 404 (unknown source) to its own message", async () => {
    const wrapper = mountView();
    await fillKey(wrapper);
    vi.mocked(postCollectRun).mockRejectedValue(
      new ApiError("not_found", "no such source", null, 404),
    );
    await submit(wrapper);
    expect(wrapper.find('[role="alert"]').text()).toContain("Not found");
  });

  it("maps 409 (already running) to its own message", async () => {
    const wrapper = mountView();
    await fillKey(wrapper);
    vi.mocked(postCollectRun).mockRejectedValue(
      new ApiError("conflict", "busy", null, 409),
    );
    await submit(wrapper);
    expect(wrapper.find('[role="alert"]').text()).toContain(
      "already in progress",
    );
  });

  it("shows the queued run ids on 202 and sends the key as a header only", async () => {
    const wrapper = mountView();
    await fillKey(wrapper);
    vi.mocked(postCollectRun).mockResolvedValue({
      runs: [{ run_id: 7, source_key: "hackernews", status: "pending" }],
    });
    await submit(wrapper);

    expect(postCollectRun).toHaveBeenCalledWith(
      { source_key: null, limit: null },
      "good-key",
    );
    expect(wrapper.find('[role="status"]').text()).toContain("#7");
  });

  it("sends a parsed limit and the chosen source key", async () => {
    vi.mocked(postCollectRun).mockResolvedValue({
      runs: [{ run_id: 9, source_key: null, status: "pending" }],
    });
    const wrapper = mountView();
    await fillKey(wrapper);
    await wrapper.find('.trigger input[type="number"]').setValue("10");
    await submit(wrapper);
    expect(postCollectRun).toHaveBeenCalledWith(
      { source_key: null, limit: 10 },
      "good-key",
    );
  });
});

describe("CollectView progress banner", () => {
  function activeRun(overrides: Partial<CollectRun> = {}) {
    return {
      run_id: 11,
      source_id: 1,
      source_key: "hackernews",
      status: "running" as const,
      trigger: "manual" as const,
      started_at: "2026-10-26T10:00:00Z",
      finished_at: null,
      items_fetched: 12,
      items_new: 8,
      items_updated: 4,
      item_limit: 25,
      error_summary: null,
      ...overrides,
    };
  }

  it("shows an animated banner with live counts for a running run", async () => {
    vi.mocked(getCollectStatus).mockResolvedValue({
      runs: [],
      active: [activeRun()],
    });
    const wrapper = mountView();
    await flushPromises();

    const banner = wrapper.find(".progress-banner");
    expect(banner.exists()).toBe(true);
    expect(banner.find(".spinner").exists()).toBe(true);
    expect(banner.text()).toContain("Collecting…");
    expect(banner.text()).toContain("#11");
    expect(banner.text()).toContain("12");
    expect(banner.text()).toContain("8");
    expect(banner.text()).toContain("4");
  });

  it("hides the banner when no run is active", async () => {
    vi.mocked(getCollectStatus).mockResolvedValue({ runs: [], active: [] });
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.find(".progress-banner").exists()).toBe(false);
  });
});

describe("CollectView runs table", () => {
  function runRow(overrides: Partial<CollectRun> = {}): CollectRun {
    return {
      run_id: 21,
      source_id: 1,
      source_key: "hackernews",
      status: "failed",
      trigger: "scheduler",
      started_at: "2026-10-26T10:00:00Z",
      finished_at: "2026-10-26T10:00:30Z",
      items_fetched: 0,
      items_new: 0,
      items_updated: 0,
      item_limit: 25,
      error_summary: null,
      ...overrides,
    };
  }

  it("renders a stale-reaped run whose summary has a reason and no errors list", async () => {
    vi.mocked(getCollectStatus).mockResolvedValue({
      runs: [
        runRow({
          error_summary: {
            reason: "reaped as stale",
            detected_after_minutes: 30,
          },
        }),
      ],
      active: [],
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find(".runs").exists()).toBe(true);
    expect(wrapper.text()).toContain("reaped as stale");
  });

  it("does not crash when a run's summary omits counts", async () => {
    vi.mocked(getCollectStatus).mockResolvedValue({
      runs: [runRow({ error_summary: { errors: [] } })],
      active: [],
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find(".runs").exists()).toBe(true);
  });
});
