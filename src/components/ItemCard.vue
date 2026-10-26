<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import type { Item } from "@/api/types";
import { formatCompactInstant } from "@/utils/formatters";
import { thumbnailUrlOf } from "@/utils/thumbnails";
import MetricsBadge from "@/components/MetricsBadge.vue";

const props = defineProps<{ item: Item; sourceLabel?: string }>();

const title = computed(() => props.item.title ?? "(untitled)");
const detailRoute = computed(() => `/items/${props.item.id}`);
/** The source chip is a filter shortcut, not decoration: one click shows only that source. */
const sourceRoute = computed(() => ({
  path: "/items",
  query: { source: props.sourceLabel },
}));

/**
 * The thumbnail, when the source's payload carried one (Reddit preview, feed <img>,
 * Threads media). It is loaded lazily, sent no referrer, and hidden entirely if the
 * CDN fails — the placeholder beneath it takes over, nothing broken is shown.
 */
const thumbnail = computed(() => thumbnailUrlOf(props.item.metadata));
const hideThumbnail = shallowRef(false);
watch(thumbnail, () => {
  hideThumbnail.value = false;
});

/** First grapheme, uppercased: the monogram in the placeholder block. */
const monogram = computed(() => {
  const label = props.sourceLabel ?? props.item.author ?? "?";
  return Array.from(label.trim())[0]?.toUpperCase() ?? "?";
});

/**
 * A short excerpt, derived from the stored text only — never fetched from anywhere.
 * `text` is already HTML-stripped and length-capped at collect time; two lines are
 * enough for the list, the detail page carries the whole thing.
 */
const MAX_EXCERPT_CHARS = 180;
const excerpt = computed(() => {
  const text = props.item.text?.trim();
  if (!text) return null;
  if (text.length <= MAX_EXCERPT_CHARS) return text;
  const cut = text.slice(0, MAX_EXCERPT_CHARS);
  // Break at the last word boundary so the ellipsis never splits a word.
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 0 ? boundary : MAX_EXCERPT_CHARS)}…`;
});

/**
 * Whether the card shows a metrics row at all. The rendering itself lives in
 * `MetricsBadge` (one component for one job): the card only decides *if* there is
 * anything to show, the badge decides *how*.
 */
const hasMetrics = computed(
  () =>
    props.item.metrics !== null &&
    Object.values(props.item.metrics).some((v) => typeof v === "number"),
);

/** The percentile is a 0..100 float; show it whole and stable. */
function formatPercentile(value: number | null | undefined): string {
  if (typeof value !== "number") return "—";
  return String(Math.round(value));
}
</script>

<template>
  <article class="item-card">
    <RouterLink
      :to="detailRoute"
      class="item-card__thumb"
      tabindex="-1"
      aria-hidden="true"
    >
      <img
        v-if="thumbnail && !hideThumbnail"
        :src="thumbnail"
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        @error="hideThumbnail = true"
      />
      <span v-else class="item-card__thumb-fallback">{{ monogram }}</span>
    </RouterLink>

    <div class="item-card__main">
      <a
        v-if="item.url"
        :href="item.url"
        target="_blank"
        rel="noopener noreferrer"
        class="item-card__title"
      >
        <span>{{ title }}</span>
        <svg
          class="item-card__external"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
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
      <!-- No url (Ask HN posts, some RSS entries): fall back to the detail route. -->
      <RouterLink v-else :to="detailRoute" class="item-card__title">{{
        title
      }}</RouterLink>

      <RouterLink :to="detailRoute" class="item-card__excerpt-link">
        <p v-if="excerpt" class="item-card__excerpt">{{ excerpt }}</p>
      </RouterLink>

      <div
        v-if="hasMetrics || item.viral"
        class="item-card__metrics"
        aria-label="Latest captured metrics"
      >
        <span
          v-if="item.viral"
          class="chip item-card__viral"
          title="Fell in the requested viral quantile band"
        >
          Viral · P{{ formatPercentile(item.percentile) }}
        </span>
        <MetricsBadge v-if="hasMetrics" :metrics="item.metrics" :limit="3" />
      </div>

      <p class="item-card__meta">
        <RouterLink
          v-if="sourceLabel"
          :to="sourceRoute"
          class="chip item-card__source"
          :title="`Show only ${sourceLabel} items`"
          >{{ sourceLabel }}</RouterLink
        >
        <span>{{ item.author ?? "unknown author" }}</span>
        <!-- The two time axes are labeled, never merged (spec §5): "posted" is when
             the post went up at the source; "collected" is when TrendSentinel stored it.
             The labels are real text, not aria-hidden decoration: a screen reader must
             hear which axis it is reading, or the two instants merge for AT users. -->
        <span v-if="item.published_at" class="item-card__time">
          <span class="item-card__time-label">posted</span>
          <time :datetime="item.published_at">{{
            formatCompactInstant(item.published_at)
          }}</time>
        </span>
        <span v-else class="item-card__time">
          <span class="item-card__time-label">posted</span>
          <span>unknown</span>
        </span>
        <span class="item-card__sep" aria-hidden="true">·</span>
        <span class="item-card__time item-card__time--captured">
          <span class="item-card__time-label">collected</span>
          <time :datetime="item.captured_at">{{
            formatCompactInstant(item.captured_at)
          }}</time>
        </span>
      </p>
    </div>

    <RouterLink :to="detailRoute" class="item-card__detail-link">
      Details
      <svg
        class="item-card__arrow"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M3.5 8h8M8.5 4.5 12 8l-3.5 3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </RouterLink>
  </article>
</template>

<style scoped>
.item-card {
  display: grid;
  /* Thumbnail | content | details-link: content takes the remaining width, the
     other two tracks are their own natural size — no space-between stretching. */
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.9rem;
  margin-inline: -0.5rem;
  padding: 0.85rem 0.5rem;
  border-bottom: 1px solid var(--border);
  border-radius: var(--r-sm);
  transition: background-color var(--speed) var(--ease-out);
}

.item-card__thumb {
  display: block;
  align-self: center;
  width: 4.75rem;
  height: 4.75rem;
  flex: none;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-3);
}

.item-card__thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-card__thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--text-faint);
  font-size: 1.375rem;
  font-weight: 650;
  user-select: none;
}

.item-card:last-child {
  border-bottom: none;
}

.item-card:hover {
  background: var(--surface-2);
}

.item-card__main {
  min-width: 0;
}

.item-card__title {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  color: var(--text);
  font-weight: 600;
  line-height: 1.35;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.item-card__title:hover {
  text-decoration: underline;
  text-decoration-thickness: 1px;
}

.item-card__external {
  width: 0.75rem;
  height: 0.75rem;
  flex: none;
  color: var(--text-faint);
  transform: translateY(-0.05em);
}

.item-card__excerpt-link {
  display: block;
  margin: 0.25rem 0 0;
  text-decoration: none;
}

.item-card__excerpt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin: 0;
  color: var(--text-muted);
  font-size: 0.875rem;
  line-height: 1.45;
}

.item-card__metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.item-card__viral {
  border-color: color-mix(in srgb, var(--accent, #0f766e) 55%, transparent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 650;
}

.item-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0.45rem 0 0;
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.item-card__source {
  padding-block: 0;
  font-size: 0.6875rem;
  text-decoration: none;
  transition:
    border-color var(--speed) var(--ease-out),
    color var(--speed) var(--ease-out);
}

.item-card__source:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.item-card__sep {
  color: var(--text-faint);
}

.item-card__time {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  white-space: nowrap;
}

.item-card__time-label {
  color: var(--text-faint);
  font-size: 0.8125rem;
}

.item-card__time--captured {
  color: var(--text-faint);
}

.item-card__detail-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  align-self: start;
  margin-top: 0.1rem;
  padding: 0.25rem 0.4rem;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-weight: 550;
  text-decoration: none;
  white-space: nowrap;
  transition:
    color var(--speed) var(--ease-out),
    background-color var(--speed) var(--ease-out);
}

.item-card__detail-link:hover {
  background: var(--surface-3);
  color: var(--accent);
}

.item-card__arrow {
  width: 0.8rem;
  height: 0.8rem;
  transition: transform var(--speed) var(--ease-out);
}

.item-card__detail-link:hover .item-card__arrow {
  transform: translateX(2px);
}

@media (max-width: 34rem) {
  .item-card {
    /* Narrow screens: thumbnail left, content right, link flows under the content.
       Two tracks — the link moves into the content column via grid-column. */
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.65rem;
  }

  .item-card__thumb {
    width: 3.25rem;
    height: 3.25rem;
  }

  .item-card__detail-link {
    grid-column: 2;
    justify-self: start;
    margin-top: 0.1rem;
    margin-left: -0.4rem;
  }
}
</style>
