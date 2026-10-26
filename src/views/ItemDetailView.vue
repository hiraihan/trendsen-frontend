<script setup lang="ts">
import { computed, onMounted, shallowRef } from "vue";
import { getItem, getItemSnapshots, getSources } from "@/api/endpoints";
import type { Item, Snapshot } from "@/api/types";
import MetricsBadge from "@/components/MetricsBadge.vue";
import SnapshotsChart from "@/components/SnapshotsChart.vue";
import ErrorState from "@/components/ErrorState.vue";
import EmptyState from "@/components/EmptyState.vue";
import {
  formatCompactInstant,
  formatInstant,
  formatPublished,
  formatRelative,
  formatUtc,
} from "@/utils/formatters";

const props = defineProps<{ id: string }>();

const item = shallowRef<Item | null>(null);
const itemError = shallowRef<unknown>(null);
const snapshots = shallowRef<Snapshot[]>([]);
const snapshotsError = shallowRef<unknown>(null);
const sourceKey = shallowRef<string | null>(null);

const itemId = computed(() => Number.parseInt(props.id, 10));
const idValid = computed(
  () => Number.isInteger(itemId.value) && itemId.value > 0,
);

const notFound = computed(
  () =>
    itemError.value !== null &&
    (itemError.value as { code?: string }).code === "not_found",
);

/**
 * "All items" returns to the filtered list the user came from: the router records the
 * previous full path in `history.state.back`. A direct visit falls back to the plain list,
 * and a detail-to-detail hop is never treated as "the list".
 */
const backTo = computed(() => {
  const back = (window.history.state as { back?: unknown } | null)?.back;
  return typeof back === "string" && /^\/items(\?|$)/.test(back)
    ? back
    : "/items";
});

onMounted(() => void reload());

/** One load path for first paint and for the retry button; resets every derived state. */
async function reload(): Promise<void> {
  item.value = null;
  itemError.value = null;
  snapshots.value = [];
  snapshotsError.value = null;
  sourceKey.value = null;

  if (!idValid.value) {
    itemError.value = Object.assign(
      new Error("Item ids are positive integers"),
      { code: "not_found" },
    );
    return;
  }
  try {
    item.value = await getItem(itemId.value);
  } catch (cause: unknown) {
    itemError.value = cause;
    return;
  }
  // Source name is optional context: a failed lookup must not hide the item itself.
  try {
    const { sources } = await getSources();
    sourceKey.value =
      sources.find((source) => source.id === item.value?.source_id)?.key ??
      null;
  } catch {
    sourceKey.value = null;
  }
  // Snapshots load after the item: a 404 on the item must not also fire a snapshot request.
  try {
    snapshots.value = (await getItemSnapshots(itemId.value)).snapshots;
  } catch (cause: unknown) {
    snapshotsError.value = cause;
  }
}

/** Exact instant plus its age in one text node, so spacing stays under control. */
function withAge(iso: string): string {
  return `${formatInstant(iso)} (${formatRelative(iso)})`;
}
</script>

<template>
  <main class="item-detail page">
    <RouterLink :to="backTo" class="item-detail__back">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path
          d="M12.5 8h-8M7.5 4.5 4 8l3.5 3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      All items
    </RouterLink>

    <p v-if="notFound" class="item-detail__missing">Item not found.</p>
    <ErrorState v-else-if="itemError" :error="itemError" :retry="reload" />

    <template v-else-if="item">
      <header class="item-detail__head">
        <h1>{{ item.title ?? "(untitled)" }}</h1>

        <p class="item-detail__meta">
          <RouterLink
            v-if="sourceKey"
            :to="{ path: '/items', query: { source: sourceKey } }"
            class="chip item-detail__chip"
            :title="`Show only ${sourceKey} items`"
            >{{ sourceKey }}</RouterLink
          >
          <span>{{ item.author ?? "unknown author" }}</span>
          <span class="item-detail__sep" aria-hidden="true">·</span>
          <span v-if="item.published_at">
            <time :datetime="item.published_at">{{
              withAge(item.published_at)
            }}</time>
          </span>
          <span v-else>{{ formatPublished(null) }}</span>
        </p>

        <p v-if="item.url" class="item-detail__source">
          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            class="item-detail__external"
          >
            Open original
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M6 3.5h6.5V10M12.5 3.5 4 12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </a>
          <span class="item-detail__url mono">{{ item.url }}</span>
        </p>
      </header>

      <p v-if="item.text" class="item-detail__text">{{ item.text }}</p>

      <section class="item-detail__section" aria-label="Item facts">
        <dl class="item-detail__facts">
          <div class="fact">
            <dt>Author</dt>
            <dd>{{ item.author ?? "unknown" }}</dd>
          </div>
          <div class="fact">
            <dt>Published</dt>
            <dd>
              <template v-if="item.published_at">
                <span>{{ formatCompactInstant(item.published_at) }}</span>
                <span class="fact__age">
                  ({{ formatRelative(item.published_at) }})
                </span>
              </template>
              <template v-else>
                <span>{{ formatPublished(null) }}</span>
              </template>
            </dd>
          </div>
          <div class="fact">
            <dt>First captured</dt>
            <dd :title="formatUtc(item.captured_at)">
              <span>{{ formatCompactInstant(item.captured_at) }}</span>
              <span class="fact__age">
                ({{ formatRelative(item.captured_at) }})
              </span>
            </dd>
          </div>
          <div class="fact">
            <dt>Last seen</dt>
            <dd :title="formatUtc(item.last_seen_at)">
              <span>{{ formatCompactInstant(item.last_seen_at) }}</span>
              <span class="fact__age">
                ({{ formatRelative(item.last_seen_at) }})
              </span>
            </dd>
          </div>
          <div class="fact fact--wide">
            <dt>Newest metrics</dt>
            <dd><MetricsBadge :metrics="item.metrics" /></dd>
          </div>
        </dl>
      </section>

      <section class="item-detail__section">
        <div class="item-detail__section-head">
          <h2>Snapshot history</h2>
          <span v-if="snapshots.length > 0" class="chip"
            >{{ snapshots.length }} captured</span
          >
        </div>
        <ErrorState
          v-if="snapshotsError"
          :error="snapshotsError"
          :retry="reload"
        />
        <EmptyState
          v-else-if="snapshots.length === 0"
          title="No snapshots yet."
          hint="This source exposes no changing metrics, or it has only been captured once."
        />
        <SnapshotsChart v-else :snapshots="snapshots" />
      </section>
    </template>

    <div v-else class="item-detail__loading" role="status">
      <span class="item-detail__loading-label">Loading…</span>
      <div class="skeleton item-detail__skeleton-title" />
      <div class="skeleton skeleton--text item-detail__skeleton-line" />
      <div class="skeleton skeleton--text item-detail__skeleton-line" />
    </div>
  </main>
</template>

<style scoped>
.item-detail__back {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-bottom: 1rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 550;
  text-decoration: none;
}

.item-detail__back:hover {
  color: var(--text);
}

.item-detail__back svg {
  width: 0.85rem;
  height: 0.85rem;
}

.item-detail__head {
  padding-bottom: 1.1rem;
  border-bottom: 1px solid var(--border);
}

.item-detail__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0.6rem 0 0;
  color: var(--text-muted);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.item-detail__sep {
  color: var(--text-faint);
}

/* The source chip doubles as a filter shortcut back on the list. */
.item-detail__chip {
  text-decoration: none;
  transition:
    border-color var(--speed) var(--ease-out),
    color var(--speed) var(--ease-out);
}

.item-detail__chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.item-detail__source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin: 0.75rem 0 0;
  font-size: 0.8125rem;
}

.item-detail__external {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
}

.item-detail__external:hover {
  background: var(--accent-soft);
}

.item-detail__external svg {
  width: 0.75rem;
  height: 0.75rem;
}

.item-detail__url {
  min-width: 0;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.item-detail__text {
  max-width: 70ch;
  margin: 1.25rem 0 0;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  /* Feed bodies are often raw source markup: readable, but never louder than the title. */
  color: var(--text-muted);
  font-size: 0.875rem;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.item-detail__section {
  margin-top: 1.75rem;
}

.item-detail__section-head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.item-detail__facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--border);
}

.fact {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.9rem;
  background: var(--surface);
}

/* Metrics arrive as a variable-length list: give them the full row, label beside them. */
.fact--wide {
  grid-column: 1 / -1;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.fact--wide dt {
  flex: none;
}

@media (max-width: 60rem) {
  .item-detail__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 30rem) {
  /* The meta line wraps here; a separator left dangling at end-of-line reads as a typo. */
  .item-detail__sep {
    display: none;
  }
}

@media (max-width: 22rem) {
  .item-detail__facts {
    grid-template-columns: minmax(0, 1fr);
  }
}

.fact dt {
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.fact dd {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin: 0;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.fact__age {
  color: var(--text-faint);
  font-size: 0.75rem;
}

.item-detail__missing {
  color: var(--danger);
}

.item-detail__loading {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding-top: 0.5rem;
}

.item-detail__loading-label {
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.item-detail__skeleton-title {
  width: 55%;
  height: 2rem;
}

.item-detail__skeleton-line {
  width: 40%;
}
</style>
