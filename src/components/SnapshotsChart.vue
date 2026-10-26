<script setup lang="ts">
import { computed } from "vue";
import type { Snapshot } from "@/api/types";
import {
  formatNumber,
  formatUtc,
  formatUtcCompact,
  formatUtcMonthDay,
} from "@/utils/formatters";

const props = defineProps<{ snapshots: Snapshot[] }>();

/**
 * Snapshot metric keys are dynamic (score, descendants, … — whatever the source exposed).
 * Series are derived from the keys present, never hardcoded. Values are plotted as stored;
 * nothing is aggregated or derived (spec §11.8).
 */
const series = computed(() => {
  const keys = new Set<string>();
  for (const snapshot of props.snapshots) {
    for (const [key, value] of Object.entries(snapshot.metrics)) {
      if (typeof value === "number") keys.add(key);
    }
  }
  return [...keys].map((key) => ({
    key,
    points: props.snapshots
      .filter((snapshot) => typeof snapshot.metrics[key] === "number")
      .map((snapshot) => ({
        t: new Date(snapshot.captured_at).getTime(),
        v: snapshot.metrics[key]!,
      })),
  }));
});

/** Chartable only when a series has more than one point; otherwise the table fallback shows. */
const chartable = computed(() => series.value.some((s) => s.points.length > 1));

const WIDTH = 720;
const HEIGHT = 300;
const PAD = { x: 16, y: 22 };
/** Band under the plot reserved for the time labels; the plot shrinks so they never collide. */
const AXIS_BAND = 30;
const PLOT_BOTTOM = HEIGHT - AXIS_BAND - PAD.y;

/** The x-axis is time, so its extent is worth labelling in both the chart and its description. */
const timeExtent = computed(() => {
  const times = series.value.flatMap((s) => s.points.map((p) => p.t));
  return { min: Math.min(...times), max: Math.max(...times) };
});

const paths = computed(() => {
  const all = series.value.flatMap((s) => s.points);
  const tMin = timeExtent.value.min;
  const tMax = timeExtent.value.max;
  const vMin = Math.min(...all.map((p) => p.v));
  const vMax = Math.max(...all.map((p) => p.v));
  const x = (t: number) =>
    tMax === tMin
      ? PAD.x
      : PAD.x + ((t - tMin) / (tMax - tMin)) * (WIDTH - 2 * PAD.x);
  const y = (v: number) =>
    vMax === vMin
      ? (PAD.y + PLOT_BOTTOM) / 2
      : PLOT_BOTTOM - ((v - vMin) / (vMax - vMin)) * (PLOT_BOTTOM - PAD.y);

  return series.value.map((s, i) => {
    const points = [...s.points]
      .sort((a, b) => a.t - b.t)
      .map((p) => ({ cx: x(p.t), cy: y(p.v), v: p.v }));
    return {
      key: s.key,
      colorClass: `chart__series--${i % 4}`,
      points,
      d: points
        .map(
          (p, j) =>
            `${j === 0 ? "M" : "L"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`,
        )
        .join(" "),
    };
  });
});

/** The gridlines are the axis: label their extents so the shape has a scale. */
const axisExtent = computed(() => {
  const values = series.value.flatMap((s) => s.points.map((p) => p.v));
  return {
    max: Math.max(...values),
    min: Math.min(...values),
  };
});

/** A screen reader gets the numbers, not the shape (spec §11.8: values are shown as stored). */
const chartSummary = computed(
  () =>
    `Captures from ${formatUtc(
      new Date(timeExtent.value.min).toISOString(),
    )} to ${formatUtc(
      new Date(timeExtent.value.max).toISOString(),
    )}. ${series.value
      // The API returns snapshots newest-first; the description must read like the chart.
      .map((s) => ({ ...s, points: [...s.points].sort((a, b) => a.t - b.t) }))
      .map(
        (s) =>
          `${s.key}: ${formatNumber(s.points[0]?.v ?? 0)} to ${formatNumber(
            s.points[s.points.length - 1]?.v ?? 0,
          )} across ${s.points.length} captures`,
      )
      .join("; ")}`,
);
</script>

<template>
  <div v-if="chartable" class="chart panel">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      role="img"
      aria-label="Metric history over time"
    >
      <desc>{{ chartSummary }}</desc>
      <line
        v-for="fraction in [0, 0.5, 1]"
        :key="fraction"
        :x1="PAD.x"
        :x2="WIDTH - PAD.x"
        :y1="PAD.y + fraction * (PLOT_BOTTOM - PAD.y)"
        :y2="PAD.y + fraction * (PLOT_BOTTOM - PAD.y)"
        class="chart__grid"
      />
      <text :x="PAD.x" :y="PAD.y - 6" class="chart__axis">
        {{ formatNumber(axisExtent.max) }}
      </text>
      <text :x="PAD.x" :y="PLOT_BOTTOM + 14" class="chart__axis">
        {{ formatNumber(axisExtent.min) }}
      </text>
      <!-- The x-axis is time: the two ends are labelled so the shape has a span. -->
      <text
        :x="PAD.x"
        :y="HEIGHT - 8"
        class="chart__axis chart__axis--time"
        text-anchor="start"
      >
        {{ formatUtcMonthDay(timeExtent.min) }}
      </text>
      <text
        :x="WIDTH - PAD.x"
        :y="HEIGHT - 8"
        class="chart__axis chart__axis--time"
        text-anchor="end"
      >
        {{ formatUtcMonthDay(timeExtent.max) }}
      </text>
      <path
        v-for="line in paths"
        :key="line.key"
        :d="line.d"
        class="chart__line"
        :class="line.colorClass"
      />
      <g v-for="line in paths" :key="`dots-${line.key}`">
        <circle
          v-for="(point, i) in line.points"
          :key="i"
          :cx="point.cx"
          :cy="point.cy"
          r="3.5"
          class="chart__dot"
          :class="line.colorClass"
        >
          <title>{{ line.key }}: {{ formatNumber(point.v) }}</title>
        </circle>
      </g>
    </svg>
    <p class="chart__legend">
      <span v-for="line in paths" :key="line.key" class="chart__legend-item">
        <span
          class="chart__swatch"
          :class="line.colorClass"
          aria-hidden="true"
        />
        {{ line.key }}
      </span>
    </p>
  </div>
  <div
    v-else-if="snapshots.length > 0"
    class="table-scroll"
    tabindex="0"
    role="region"
    aria-label="Snapshot values"
  >
    <table>
      <thead>
        <tr>
          <th>captured at (UTC)</th>
          <th v-for="s in series" :key="s.key">{{ s.key }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="snapshot in snapshots" :key="snapshot.id">
          <td class="mono" :title="formatUtc(snapshot.captured_at)">
            {{ formatUtcCompact(snapshot.captured_at) }}
          </td>
          <td v-for="s in series" :key="s.key" class="num">
            {{
              typeof snapshot.metrics[s.key] === "number"
                ? snapshot.metrics[s.key]
                : "—"
            }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.chart {
  padding: 1rem 1rem 0.75rem;
}

.chart__grid {
  stroke: var(--border);
  stroke-width: 1;
}

.chart__line {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Surface fill so dots punch through overlapping lines; stroke comes from the series class. */
.chart__dot {
  fill: var(--surface);
  stroke-width: 1.75;
}

.chart__axis {
  fill: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* The time ticks sit under the plot, quieter than the values they bracket. */
.chart__axis--time {
  fill: var(--text-faint);
  font-size: 10.5px;
  letter-spacing: 0.01em;
}

.chart__line--0,
.chart__series--0 {
  stroke: #1f5fd0;
  color: #1f5fd0;
}

.chart__line--1,
.chart__series--1 {
  stroke: #c2672c;
  color: #c2672c;
}

.chart__line--2,
.chart__series--2 {
  stroke: #0f766e;
  color: #0f766e;
}

.chart__line--3,
.chart__series--3 {
  stroke: #a626a4;
  color: #a626a4;
}

@media (prefers-color-scheme: dark) {
  .chart__line--0,
  .chart__series--0 {
    stroke: #7ab0ff;
    color: #7ab0ff;
  }

  .chart__line--1,
  .chart__series--1 {
    stroke: #f0b077;
    color: #f0b077;
  }

  .chart__line--2,
  .chart__series--2 {
    stroke: #5ec7bd;
    color: #5ec7bd;
  }

  .chart__line--3,
  .chart__series--3 {
    stroke: #e08fe0;
    color: #e08fe0;
  }
}

.chart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 0.5rem 0 0;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.chart__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.chart__swatch {
  width: 1rem;
  height: 0.2rem;
  border-radius: 999px;
  background: currentColor;
}
</style>
