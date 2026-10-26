<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watch } from "vue";
import { useRoute, useRouter, type LocationQuery } from "vue-router";
import {
  getItems,
  getSources,
  itemsCsvUrl,
  planItemsCsv,
  type ItemsParams,
} from "@/api/endpoints";
import type { Item, Source } from "@/api/types";
import { useKeysetPage } from "@/composables/useKeysetPage";
import ItemCard from "@/components/ItemCard.vue";
import ErrorState from "@/components/ErrorState.vue";
import EmptyState from "@/components/EmptyState.vue";
import { isoToLocal, localToIso, formatNumber } from "@/utils/formatters";

/**
 * Filters live in the URL query (spec T18: a filtered view is a link). Every change resets
 * the keyset walk. The cursor from each page is echoed back verbatim, never constructed.
 */
const route = useRoute();
const router = useRouter();

const source = computed(() => single(route.query.source));
const q = computed(() => single(route.query.q));
const since = computed(() => single(route.query.since));
const until = computed(() => single(route.query.until));
const keywords = computed(() => single(route.query.keywords));
const quantileLow = computed(() => integer(route.query.quantile_low));
const quantileHigh = computed(() => integer(route.query.quantile_high));
const hasFilters = computed(() =>
  Boolean(
    source.value ||
    q.value ||
    since.value ||
    until.value ||
    keywords.value ||
    quantileLow.value !== undefined ||
    quantileHigh.value !== undefined,
  ),
);

function single(value: LocationQuery[string] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const text = first?.trim();
  return text ? text : undefined;
}

/** The quantile bounds are integers; garbage in the URL is dropped, never forwarded. */
function integer(value: LocationQuery[string] | undefined): number | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const n = Number(first);
  return Number.isInteger(n) ? n : undefined;
}

/** Local wall time ↔ timezone-aware instant lives in `utils/formatters` and is unit-tested. */

const fetchPage = async (
  cursor?: string,
): Promise<{ items: Item[]; total: number; next_cursor: string | null }> => {
  const params: ItemsParams = {
    source: source.value,
    q: q.value,
    since: since.value,
    until: until.value,
    keywords: keywords.value,
    limit: 20,
  };
  if (quantileLow.value !== undefined) params.quantile_low = quantileLow.value;
  if (quantileHigh.value !== undefined)
    params.quantile_high = quantileHigh.value;
  if (cursor !== undefined) params.cursor = cursor;
  return getItems(params);
};

const page = useKeysetPage<Item>(fetchPage);

const sources = shallowRef<Source[]>([]);
const sourcesError = shallowRef<unknown>(null);
const activeSourceKeys = computed(
  () => new Set(sources.value.map((s) => s.key)),
);
const sourceNamespace = computed(
  () => new Map(sources.value.map((s) => [s.id, s.key])),
);

function sourceLabelFor(item: Item): string | undefined {
  return sourceNamespace.value.get(item.source_id);
}

onMounted(() => void loadSources());

/** One load path for first paint and for the retry button on the source-filter dropdown. */
async function loadSources(): Promise<void> {
  sourcesError.value = null;
  try {
    sources.value = (await getSources()).sources;
  } catch (cause: unknown) {
    sourcesError.value = cause;
  }
}

// Any filter change (including back/forward navigation) restarts the walk.
watch(
  () => route.query,
  async (next, prev) => {
    if (
      next.source === prev?.source &&
      next.q === prev?.q &&
      next.since === prev?.since &&
      next.until === prev?.until &&
      next.keywords === prev?.keywords &&
      next.quantile_low === prev?.quantile_low &&
      next.quantile_high === prev?.quantile_high
    )
      return;
    await page.reset();
  },
);

page.loadMore();

function setFilter(
  name:
    | "source"
    | "q"
    | "since"
    | "until"
    | "keywords"
    | "quantile_low"
    | "quantile_high",
  value: string,
) {
  void router.push({ query: { ...route.query, [name]: value || undefined } });
}

/** The title box filters as you type; 250ms keeps the URL and the API quiet. */
let typing: ReturnType<typeof setTimeout> | undefined;
function setQuery(value: string) {
  clearTimeout(typing);
  typing = setTimeout(() => setFilter("q", value), 250);
}

/** The keywords box behaves like the title box: debounced, in the URL. */
let typingKeywords: ReturnType<typeof setTimeout> | undefined;
function setQueryKeywords(value: string) {
  clearTimeout(typingKeywords);
  typingKeywords = setTimeout(() => setFilter("keywords", value), 250);
}

onUnmounted(() => {
  clearTimeout(typing);
  clearTimeout(typingKeywords);
});

function clearFilters() {
  void router.push({ query: {} });
}

/**
 * The export dialog opens pre-filled with the filters on screen, so the default export
 * matches the list being viewed; the operator then picks platforms and the row ceiling.
 */
const DEFAULT_MAX_ROWS = 10_000;
const MAX_MAX_ROWS = 100_000;
const exportOpen = shallowRef(false);
const exportSource = shallowRef<string>("");
const exportSince = shallowRef("");
const exportUntil = shallowRef("");
const exportQuery = shallowRef("");
const exportKeywords = shallowRef("");
const exportQuantileLow = shallowRef<number | "">("");
const exportQuantileHigh = shallowRef<number | "">("");
const exportMaxRows = shallowRef(DEFAULT_MAX_ROWS);

/**
 * The API accepts 1..100 000. An empty or out-of-range input is clamped rather than
 * sent: a 422 would replace the download with a JSON error the browser cannot save.
 */
const clampedMaxRows = computed(() => {
  const raw = Number(exportMaxRows.value);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_ROWS;
  return Math.min(MAX_MAX_ROWS, Math.max(1, Math.trunc(raw)));
});

// -- truncation visibility ------------------------------------------------------
//
// A download is a browser navigation, so the CSV's X-Total-Matching header is never
// seen by the operator. The plan endpoint reports the same number before the download,
// so a capped export is visible in the dialog, not discovered later in a spreadsheet.

const planTotal = shallowRef<number | null>(null);
const planPending = shallowRef(false);
const planError = shallowRef<unknown>(null);

/** The plan follows the dialog's filters, debounced while the operator types. */
let planTimer: ReturnType<typeof setTimeout> | undefined;
const planFilters = computed(() => ({
  source: exportSource.value || undefined,
  since: localToIso(exportSince.value),
  until: localToIso(exportUntil.value),
  q: exportQuery.value || undefined,
  keywords: exportKeywords.value || undefined,
  quantile_low: exportQuantile(exportQuantileLow.value),
  quantile_high: exportQuantile(exportQuantileHigh.value),
  maxRows: clampedMaxRows.value,
}));

/** A band bound is sent only when it is a whole number in 0..100. */
function exportQuantile(value: number | ""): number | undefined {
  if (value === "" || !Number.isInteger(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

async function loadPlan(): Promise<void> {
  if (!exportOpen.value) return;
  planPending.value = true;
  planError.value = null;
  try {
    planTotal.value = (await planItemsCsv(planFilters.value)).total_matching;
  } catch (cause: unknown) {
    planError.value = cause;
  } finally {
    planPending.value = false;
  }
}

watch(
  [exportOpen, planFilters],
  () => {
    if (!exportOpen.value) return;
    clearTimeout(planTimer);
    planTimer = setTimeout(() => void loadPlan(), 300);
  },
  { deep: false },
);

onUnmounted(() => clearTimeout(planTimer));

const planLine = computed(() => {
  if (planPending.value && planTotal.value === null)
    return "Counting matching rows…";
  if (planError.value !== null) return "Could not count the matching rows.";
  if (planTotal.value === null) return "";
  if (planExceeds.value) {
    return `${formatNumber(planTotal.value)} rows match — the download will be capped at ${formatNumber(clampedMaxRows.value)}. Raise Max rows or narrow the filters.`;
  }
  return `${formatNumber(planTotal.value)} rows will be exported.`;
});

/** True when the filters match more rows than the ceiling allows. */
const planExceeds = computed(
  () =>
    planTotal.value !== null &&
    !planPending.value &&
    planTotal.value > clampedMaxRows.value,
);

function openExportDialog() {
  exportSource.value = source.value ?? "";
  exportSince.value = isoToLocal(since.value);
  exportUntil.value = isoToLocal(until.value);
  // The title search is a filter like any other: an exported CSV must describe the
  // same rows the list shows, or the operator analyses a different set than the one
  // they were looking at.
  exportQuery.value = q.value ?? "";
  exportKeywords.value = keywords.value ?? "";
  exportQuantileLow.value = quantileLow.value ?? "";
  exportQuantileHigh.value = quantileHigh.value ?? "";
  exportMaxRows.value = DEFAULT_MAX_ROWS;
  planTotal.value = null;
  exportOpen.value = true;
}

/** The download is a plain browser navigation — the response is an attachment stream. */
const exportHref = computed(() =>
  itemsCsvUrl({
    source: exportSource.value || undefined,
    since: localToIso(exportSince.value),
    until: localToIso(exportUntil.value),
    q: exportQuery.value || undefined,
    keywords: exportKeywords.value || undefined,
    quantile_low: exportQuantile(exportQuantileLow.value),
    quantile_high: exportQuantile(exportQuantileHigh.value),
    maxRows: clampedMaxRows.value,
  }),
);
</script>

<template>
  <main class="items-view page">
    <div class="view-head">
      <div>
        <h1>Collected items</h1>
        <p class="view-sub">
          Newest publication first. Filters are part of the URL.
        </p>
      </div>
      <button
        type="button"
        class="btn btn--ghost btn--sm"
        @click="openExportDialog"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
          class="items-view__export-icon"
        >
          <path
            d="M8 2.5v7M5 6.5 8 9.5l3-3M3 11v2h10v-2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Export CSV…
      </button>
    </div>

    <form class="filters" @submit.prevent>
      <div class="field">
        <label class="field__label" for="filter-source">Source</label>
        <select
          id="filter-source"
          :value="source ?? ''"
          @change="
            setFilter('source', ($event.target as HTMLSelectElement).value)
          "
        >
          <option value="">All sources</option>
          <option v-for="s in sources" :key="s.key" :value="s.key">
            {{ s.name }}{{ s.is_active ? "" : " (inactive)" }}
          </option>
        </select>
      </div>

      <div class="field field--wide">
        <label class="field__label" for="filter-q">Title contains</label>
        <input
          id="filter-q"
          type="search"
          :value="q ?? ''"
          placeholder="e.g. rust"
          @input="setQuery(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="field">
        <label class="field__label" for="filter-since">Since</label>
        <input
          id="filter-since"
          type="datetime-local"
          :value="isoToLocal(since)"
          @change="
            setFilter(
              'since',
              localToIso(($event.target as HTMLInputElement).value) ?? '',
            )
          "
        />
      </div>

      <div class="field">
        <label class="field__label" for="filter-until">Until</label>
        <input
          id="filter-until"
          type="datetime-local"
          :value="isoToLocal(until)"
          @change="
            setFilter(
              'until',
              localToIso(($event.target as HTMLInputElement).value) ?? '',
            )
          "
        />
      </div>

      <div class="field">
        <label class="field__label" for="filter-keywords"
          >Keywords (viral)</label
        >
        <input
          id="filter-keywords"
          type="search"
          :value="keywords ?? ''"
          placeholder="e.g. ai, rust"
          @input="setQueryKeywords(($event.target as HTMLInputElement).value)"
        />
      </div>

      <div class="field">
        <label class="field__label" for="filter-qlow">Quantile low</label>
        <input
          id="filter-qlow"
          type="number"
          min="0"
          max="99"
          :value="quantileLow ?? ''"
          @change="
            setFilter('quantile_low', ($event.target as HTMLInputElement).value)
          "
        />
      </div>

      <div class="field">
        <label class="field__label" for="filter-qhigh">Quantile high</label>
        <input
          id="filter-qhigh"
          type="number"
          min="1"
          max="100"
          :value="quantileHigh ?? ''"
          @change="
            setFilter(
              'quantile_high',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </div>

      <div class="filters__actions">
        <button
          v-if="hasFilters"
          type="button"
          class="btn btn--ghost btn--sm"
          @click="clearFilters"
        >
          Clear filters
        </button>
      </div>
    </form>

    <!-- Export dialog: platform picker + title search + time range + row ceiling,
         pre-filled from the on-screen filters. Every filter the list applies is
         offered here, so the CSV always describes the rows on screen. -->
    <div
      v-if="exportOpen"
      class="export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-title"
      @click.self="exportOpen = false"
      @keydown.esc="exportOpen = false"
    >
      <form
        class="export-dialog__box panel"
        @submit.prevent="exportOpen = false"
      >
        <h2 id="export-title">Export CSV</h2>
        <p class="export-dialog__hint">
          Rows are newest-posted first. The CSV separates
          <code>published_at_utc</code> (when the post went up at the source)
          from <code>captured_at_utc</code> (when TrendSentinel collected it).
        </p>

        <fieldset class="export-dialog__platforms">
          <legend class="field__label">Platforms</legend>
          <label class="export-dialog__platform">
            <input
              v-model="exportSource"
              type="radio"
              name="export-platform"
              value=""
            />
            <span>All platforms</span>
          </label>
          <label
            v-for="s in sources"
            :key="s.key"
            class="export-dialog__platform"
          >
            <input
              v-model="exportSource"
              type="radio"
              name="export-platform"
              :value="s.key"
            />
            <span>{{ s.name }}{{ s.is_active ? "" : " (inactive)" }}</span>
          </label>
        </fieldset>

        <div class="export-dialog__range">
          <div class="field field--wide">
            <label class="field__label" for="export-q">Title contains</label>
            <input
              id="export-q"
              v-model="exportQuery"
              type="search"
              placeholder="e.g. rust"
            />
            <p class="export-dialog__note">
              Leave blank to export every title.
            </p>
          </div>
          <div class="field">
            <label class="field__label" for="export-since">Posted since</label>
            <input
              id="export-since"
              v-model="exportSince"
              type="datetime-local"
            />
          </div>
          <div class="field">
            <label class="field__label" for="export-until">Posted until</label>
            <input
              id="export-until"
              v-model="exportUntil"
              type="datetime-local"
            />
          </div>
          <div class="field">
            <label class="field__label" for="export-max">Max rows</label>
            <input
              id="export-max"
              v-model.number="exportMaxRows"
              type="number"
              min="1"
              max="100000"
            />
          </div>
          <div class="field field--wide">
            <label class="field__label" for="export-keywords"
              >Keywords (viral)</label
            >
            <input
              id="export-keywords"
              v-model="exportKeywords"
              type="search"
              placeholder="e.g. ai, rust"
            />
          </div>
          <div class="field">
            <label class="field__label" for="export-qlow">Quantile low</label>
            <input
              id="export-qlow"
              v-model="exportQuantileLow"
              type="number"
              min="0"
              max="99"
            />
          </div>
          <div class="field">
            <label class="field__label" for="export-qhigh">Quantile high</label>
            <input
              id="export-qhigh"
              v-model="exportQuantileHigh"
              type="number"
              min="1"
              max="100"
            />
          </div>
        </div>

        <!-- Truncation is decided here, before the download: the CSV's own
             headers are invisible in a browser-navigation download. -->
        <p
          class="export-dialog__plan"
          :class="{ 'export-dialog__plan--warn': planExceeds }"
          role="status"
        >
          {{ planLine }}
        </p>

        <div class="export-dialog__actions">
          <button
            type="button"
            class="btn btn--ghost"
            @click="exportOpen = false"
          >
            Cancel
          </button>
          <a :href="exportHref" download class="btn btn--primary">Download</a>
        </div>
      </form>
    </div>

    <ErrorState
      v-if="sourcesError"
      :error="sourcesError"
      :retry="loadSources"
    />
    <ErrorState
      v-if="page.error.value"
      :error="page.error.value"
      :retry="page.reset"
    />

    <p
      v-if="source && !sourcesError && !activeSourceKeys.has(source)"
      class="items-view__unknown"
    >
      Unknown source key — showing nothing rather than guessing.
    </p>

    <div
      v-if="page.pending.value && page.items.value.length === 0"
      class="items-view__skeleton"
    >
      <div v-for="n in 6" :key="n" class="items-view__skeleton-row">
        <div class="skeleton skeleton--text" style="width: 55%" />
        <div class="skeleton skeleton--text" style="width: 22%" />
      </div>
    </div>

    <EmptyState
      v-else-if="!page.pending.value && page.items.value.length === 0"
      :title="
        hasFilters ? 'No items match these filters.' : 'No items collected yet.'
      "
      :hint="
        hasFilters
          ? 'Widen the time range, clear the title search, or pick All sources.'
          : 'Items appear here once a collection run stores something. Open Collect to trigger one.'
      "
    >
      <button
        v-if="hasFilters"
        type="button"
        class="btn btn--ghost"
        @click="clearFilters"
      >
        Clear filters
      </button>
      <RouterLink v-else to="/collect" class="btn btn--primary"
        >Go to Collect</RouterLink
      >
    </EmptyState>

    <template v-else>
      <p class="items-view__count" role="status">
        Showing {{ page.items.value.length }} of {{ page.total.value }} item{{
          page.total.value === 1 ? "" : "s"
        }}
        <span v-if="page.pending.value" class="items-view__count-note"
          >· refreshing…</span
        >
      </p>
      <div class="items-view__list">
        <ItemCard
          v-for="item in page.items.value"
          :key="item.id"
          :item="item"
          :source-label="sourceLabelFor(item)"
        />
      </div>
      <div class="items-view__more">
        <button
          v-if="page.hasMore.value"
          type="button"
          class="btn btn--ghost"
          :disabled="page.pending.value"
          @click="page.loadMore()"
        >
          {{ page.pending.value ? "Loading…" : "Load more" }}
        </button>
        <p v-else-if="page.items.value.length > 0" class="items-view__end">
          End of results.
        </p>
      </div>
    </template>
  </main>
</template>

<style scoped>
.filters {
  display: grid;
  grid-template-columns:
    minmax(10rem, 1.1fr) minmax(12rem, 1.6fr) minmax(9rem, 1fr) minmax(
      9rem,
      1fr
    )
    minmax(10rem, 1.2fr) minmax(6rem, 0.7fr) minmax(6rem, 0.7fr) auto;
  align-items: end;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding: 0.9rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-1);
}

.filters__actions {
  display: flex;
  justify-content: flex-end;
  padding-bottom: 0.05rem;
}

.items-view__unknown {
  margin: 0 0 0.75rem;
  color: var(--warn);
  font-size: 0.875rem;
}

.items-view__count {
  margin: 0 0 0.25rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.items-view__count-note {
  color: var(--text-faint);
}

.items-view__export-icon {
  width: 0.9rem;
  height: 0.9rem;
}

.export-dialog {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.45);
}

.export-dialog__box {
  width: min(30rem, 100%);
  max-height: min(85vh, 40rem);
  overflow: auto;
  padding: 1.25rem 1.4rem;
}

.export-dialog__hint {
  margin: 0.35rem 0 1rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.export-dialog__platforms {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}

.export-dialog__platform {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  cursor: pointer;
}

.export-dialog__range {
  display: grid;
  grid-template-columns: 1fr 1fr 0.8fr;
  gap: 0.6rem;
}

.export-dialog__note {
  margin: 0.25rem 0 0;
  color: var(--text-faint);
  font-size: 0.75rem;
}

.export-dialog__plan {
  margin: 0.9rem 0 0;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.export-dialog__plan--warn {
  border-color: color-mix(in srgb, var(--warn, #b45309) 45%, transparent);
  background: color-mix(in srgb, var(--warn, #b45309) 10%, transparent);
  color: var(--text);
}

.export-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.15rem;
}

@media (max-width: 40rem) {
  .export-dialog__range {
    grid-template-columns: 1fr;
  }
}

.items-view__list {
  display: flex;
  flex-direction: column;
}

.items-view__more {
  display: flex;
  justify-content: center;
  padding: 1.25rem 0 0;
}

.items-view__end {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.items-view__skeleton {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  padding: 0.5rem 0;
}

.items-view__skeleton-row {
  display: flex;
  justify-content: space-between;
  gap: 2rem;
}

@media (max-width: 62rem) {
  .filters {
    grid-template-columns: 1fr 1fr;
  }

  .field--wide {
    grid-column: span 2;
  }
}

@media (max-width: 34rem) {
  .filters {
    grid-template-columns: 1fr;
  }

  .field--wide {
    grid-column: auto;
  }

  .filters__actions {
    justify-content: flex-start;
  }
}
</style>
