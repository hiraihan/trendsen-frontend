<script setup lang="ts">
import { computed } from "vue";
import type { ItemMetrics } from "@/api/types";
import { formatNumber } from "@/utils/formatters";

const props = withDefaults(
  defineProps<{
    metrics: ItemMetrics | null;
    /**
     * How many metrics to show at most. `0` (the default) means "all of them".
     * A dense list view caps the count so one item with many metrics cannot push
     * the rest of the card off the row.
     */
    limit?: number;
  }>(),
  { limit: 0 },
);

/** Metrics are passed through untouched — displayed as stored, never derived. */
const entries = computed(() => {
  if (!props.metrics) return [];
  const all = Object.entries(props.metrics).filter(
    ([, v]) => typeof v === "number",
  );
  return props.limit > 0 ? all.slice(0, props.limit) : all;
});
</script>

<template>
  <span v-if="entries.length > 0" class="metrics-badge">
    <span
      v-for="[key, value] in entries"
      :key="key"
      class="metrics-badge__item"
    >
      <span class="metrics-badge__key">{{ key }}:</span>
      <strong class="metrics-badge__value">{{ formatNumber(value) }}</strong>
    </span>
  </span>
  <span v-else class="metrics-badge metrics-badge--empty"
    >no metrics captured</span
  >
</template>

<style scoped>
.metrics-badge {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.metrics-badge__item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.metrics-badge__key {
  color: var(--text-muted);
}

.metrics-badge__value {
  font-weight: 650;
  color: var(--text);
}

.metrics-badge--empty {
  color: var(--text-muted);
  font-size: 0.875rem;
}
</style>
