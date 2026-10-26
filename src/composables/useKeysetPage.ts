import { computed, shallowRef } from "vue";

export interface KeysetPage<T> {
  items: T[];
  total: number;
  next_cursor: string | null;
}

type PageFetcher<T> = (cursor: string | undefined) => Promise<KeysetPage<T>>;

/**
 * Walks a keyset-paginated endpoint. The cursor from each page is echoed back verbatim —
 * never decoded, never constructed (docs/api.md: a hand-made token may silently skip rows).
 */
export function useKeysetPage<T>(fetchPage: PageFetcher<T>) {
  const items = shallowRef<T[]>([]);
  const nextCursor = shallowRef<string | null>(null);
  // The total is the size of the whole filtered set; it is a property of the first page
  // and does not change as more pages are walked.
  const total = shallowRef(0);
  const pending = shallowRef(false);
  const error = shallowRef<unknown>(null);
  // Null means "not started" until the first page lands; afterwards it means the walk is
  // complete. `started` separates the two so loadMore never re-fetches a finished walk.
  let started = false;

  async function loadMore(): Promise<void> {
    if (pending.value || (started && nextCursor.value === null)) return;
    pending.value = true;
    error.value = null;
    try {
      const page = await fetchPage(nextCursor.value ?? undefined);
      items.value = [...items.value, ...page.items];
      total.value = page.total;
      nextCursor.value = page.next_cursor;
      started = true;
    } catch (cause: unknown) {
      error.value = cause;
    } finally {
      pending.value = false;
    }
  }

  /** Drops accumulated rows and refetches from the first page (filter change, retry). */
  async function reset(): Promise<void> {
    nextCursor.value = null;
    items.value = [];
    total.value = 0;
    started = false;
    await loadMore();
  }

  const hasMore = computed(() => nextCursor.value !== null);

  return { items, total, pending, error, hasMore, loadMore, reset };
}
