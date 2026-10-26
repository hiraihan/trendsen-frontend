import { describe, expect, it, vi } from "vitest";
import { useKeysetPage } from "./useKeysetPage";
import type { KeysetPage } from "./useKeysetPage";

interface Row {
  id: number;
}

function page(
  ids: number[],
  nextCursor: string | null,
  total = ids.length,
): KeysetPage<Row> {
  return { items: ids.map((id) => ({ id })), total, next_cursor: nextCursor };
}

describe("useKeysetPage", () => {
  it("accumulates rows across pages", async () => {
    const pages = [
      page([1, 2], "c2", 5),
      page([3, 4], "c3", 5),
      page([5], null, 5),
    ];
    const fetchPage = vi.fn(async (cursor?: string) => {
      const index = cursor === undefined ? 0 : cursor === "c2" ? 1 : 2;
      return pages[index]!;
    });

    const state = useKeysetPage<Row>(fetchPage);
    await state.loadMore();
    await state.loadMore();
    await state.loadMore();

    expect(state.items.value.map((row) => row.id)).toEqual([1, 2, 3, 4, 5]);
    expect(state.total.value).toBe(5);
    expect(state.hasMore.value).toBe(false);
  });

  it("echoes the cursor verbatim", async () => {
    const fetchPage = vi.fn(async () => page([1], "opaque=="));
    const state = useKeysetPage<Row>(fetchPage);
    await state.loadMore();
    await state.loadMore();

    // Second call must carry the exact token from the first page.
    expect(fetchPage).toHaveBeenLastCalledWith("opaque==");
  });

  it("stops fetching once the cursor is null", async () => {
    const fetchPage = vi.fn(async () => page([1], null));
    const state = useKeysetPage<Row>(fetchPage);
    await state.loadMore();

    expect(state.hasMore.value).toBe(false);
    await state.loadMore(); // guard: pending/finished walk must not re-request
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("reset clears rows and refetches the first page", async () => {
    const fetchPage = vi.fn(async (cursor?: string) =>
      cursor === undefined ? page([1, 2], "c2") : page([3], null),
    );
    const state = useKeysetPage<Row>(fetchPage);
    await state.loadMore();
    await state.loadMore();
    expect(state.items.value).toHaveLength(3);

    await state.reset();
    expect(state.items.value.map((row) => row.id)).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenLastCalledWith(undefined);
  });

  it("exposes errors instead of throwing", async () => {
    const fetchPage = vi.fn(async () => {
      throw new Error("boom");
    });
    const state = useKeysetPage<Row>(fetchPage);
    await expect(state.loadMore()).resolves.toBeUndefined();
    expect((state.error.value as Error).message).toBe("boom");
  });
});
