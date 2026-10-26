<script setup lang="ts">
import { computed, nextTick, shallowRef, watch } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { getCollectStatus, postCollectRun } from "@/api/collect";
import { getSources } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import type { CollectRun } from "@/api/types";
import { useAdminKey } from "@/composables/useAdminKey";
import ErrorState from "@/components/ErrorState.vue";
import EmptyState from "@/components/EmptyState.vue";
import StatusChip from "@/components/StatusChip.vue";
import { formatCompactInstant, formatUtc } from "@/utils/formatters";

/**
 * The poller stops when the tab is hidden (`refetchIntervalInBackground: false`) — an idle
 * dashboard must not hammer the API (T19).
 */
const POLL_MS = 10_000;

const { key, hasKey, set, clear } = useAdminKey();

// -- key dialog ---------------------------------------------------------------

const keyDraft = shallowRef("");
const rememberKey = shallowRef(false);
const keyDialogOpen = shallowRef(false);
const keyInput = shallowRef<HTMLInputElement | null>(null);
const keyTrigger = shallowRef<HTMLButtonElement | null>(null);
const keyClear = shallowRef<HTMLButtonElement | null>(null);

function openKeyDialog() {
  keyDraft.value = "";
  keyDialogOpen.value = true;
}

/** Closes the dialog and puts focus back where the user left it. */
function closeKeyDialog() {
  keyDialogOpen.value = false;
  keyTrigger.value?.focus();
}

function saveKey() {
  if (keyDraft.value.trim()) {
    set(keyDraft.value.trim(), rememberKey.value);
  }
  keyDialogOpen.value = false;
  // Saving swaps the trigger button out for "Clear key": hand focus to whichever survives.
  void nextTick(() => {
    (keyClear.value ?? keyTrigger.value)?.focus();
  });
}

// Focus the field on open: the dialog exists only to take one value.
watch(keyDialogOpen, async (open) => {
  if (!open) return;
  await nextTick();
  keyInput.value?.focus();
});

// -- status polling -----------------------------------------------------------

const statusQuery = useQuery({
  queryKey: ["collect-status"],
  queryFn: getCollectStatus,
  refetchInterval: POLL_MS,
  refetchIntervalInBackground: false,
});

// -- trigger form -------------------------------------------------------------

const sources = shallowRef<{ key: string; name: string }[]>([]);
const sourceKey = shallowRef("");
const limitDraft = shallowRef("");
const submitting = shallowRef(false);
const submitError = shallowRef<unknown>(null);
const submittedRuns = shallowRef<
  { run_id: number; source_key: string | null; status: string }[]
>([]);

async function loadSources() {
  try {
    sources.value = (await getSources(true)).sources.map((s) => ({
      key: s.key,
      name: s.name,
    }));
  } catch {
    // The status table above already shows the API state; the form degrades to "all".
    sources.value = [];
  }
}
void loadSources();

async function trigger() {
  // Admin key is the gate: without it the run cannot be queued. Check before the
  // submitting state, so the loading animation never appears for a request that is
  // doomed to fail — the key prompt is the feedback for that case.
  if (!hasKey.value) {
    submitError.value = new ApiError(
      "unauthorized",
      "Enter the admin key first.",
      null,
      401,
    );
    return;
  }

  submitting.value = true;
  submitError.value = null;
  submittedRuns.value = [];
  try {
    // <input type="number"> hands v-model a number, not a string.
    const rawLimit = limitDraft.value;
    const limit =
      typeof rawLimit === "number"
        ? rawLimit
        : Number.parseInt(String(rawLimit).trim(), 10);
    const result = await postCollectRun(
      {
        source_key: sourceKey.value || null,
        limit:
          limit !== null && Number.isFinite(limit) && limit > 0 ? limit : null,
      },
      key.value!,
    );
    submittedRuns.value = result.runs;
    await statusQuery.refetch();
  } catch (cause: unknown) {
    submitError.value = cause;
  } finally {
    submitting.value = false;
  }
}

// -- display ------------------------------------------------------------------

const runs = computed(() => statusQuery.data.value?.runs ?? []);
const active = computed(() => statusQuery.data.value?.active ?? []);

/**
 * Polling is silent to assistive tech by default. This summary changes only when a run's
 * id/status pair changes, so the live region announces real transitions, not every tick.
 */
const statusSummary = computed(() => {
  const latest = runs.value.slice(0, 5);
  if (latest.length === 0) return "";
  return latest.map((run) => `#${run.run_id} ${run.status}`).join(", ");
});

/** When the last successful poll landed — a fact on screen, not an announcement. */
const lastChecked = computed(() => {
  const at = statusQuery.dataUpdatedAt.value;
  return at > 0 ? formatCompactInstant(new Date(at).toISOString()) : null;
});

/** Only non-zero counters are worth a chip; the columns already carry the rest. */
function errorCounts(run: CollectRun): [string, number][] {
  const counts = run.error_summary?.counts;
  if (!counts || typeof counts !== "object") return [];
  return Object.entries(counts).filter(([, value]) => value > 0);
}

/** The message behind a failed run, in one line; the full list rides on the title. */
function errorLabel(run: CollectRun): string | null {
  const summary = run.error_summary;
  if (!summary) return null;
  const errors = Array.isArray(summary.errors) ? summary.errors : [];
  if (errors.length === 0) {
    // Stale-run reaps carry a `reason`, not a per-item `errors` list.
    return typeof summary.reason === "string" ? summary.reason : null;
  }
  const first = errors[0];
  const text =
    typeof first === "object" && first !== null && "message" in first
      ? String((first as { message: unknown }).message)
      : String(first);
  return errors.length > 1 ? `${errors.length} errors · ${text}` : text;
}

/** The messages behind the counters, available on hover rather than dumped in the cell. */
function errorTitle(run: CollectRun): string | undefined {
  const summary = run.error_summary;
  if (!summary) return undefined;
  const errors = Array.isArray(summary.errors) ? summary.errors : [];
  if (errors.length === 0) return undefined;
  return errors
    .map((error) =>
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error),
    )
    .join(" · ");
}
</script>

<template>
  <main class="collect-view page">
    <div class="view-head">
      <div>
        <h1>Collection runs</h1>
        <p class="view-sub">
          Refreshes every {{ POLL_MS / 1000 }}s while the tab is visible.
          <span v-if="lastChecked">Last checked {{ lastChecked }}.</span>
        </p>
      </div>
      <div class="collect-view__key">
        <template v-if="hasKey">
          <span class="collect-view__key-set">admin key set</span>
          <button
            ref="keyClear"
            type="button"
            class="btn btn--ghost btn--sm"
            @click="clear()"
          >
            Clear key
          </button>
        </template>
        <button
          v-else
          ref="keyTrigger"
          type="button"
          class="btn btn--ghost btn--sm"
          @click="openKeyDialog"
        >
          Enter admin key…
        </button>
      </div>
    </div>

    <!-- Announces run transitions only; the polling itself stays silent. -->
    <div class="visually-hidden" aria-live="polite">
      {{ statusSummary ? `Run statuses: ${statusSummary}` : "" }}
    </div>

    <!-- Key dialog: in-memory by default; sessionStorage only behind the explicit choice. -->
    <div
      v-if="keyDialogOpen"
      class="key-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-key-title"
      @click.self="closeKeyDialog"
      @keydown.esc="closeKeyDialog"
    >
      <form class="key-dialog__box panel" @submit.prevent="saveKey">
        <h2 id="admin-key-title">Admin key</h2>
        <p class="key-dialog__hint">
          Sent only as the <code>X-API-Key</code> header. Kept in memory unless
          you ask to remember it.
        </p>
        <div class="field">
          <label class="field__label" for="admin-key">Key</label>
          <input
            id="admin-key"
            ref="keyInput"
            v-model="keyDraft"
            type="password"
            autocomplete="off"
          />
        </div>
        <label class="key-dialog__remember">
          <input v-model="rememberKey" type="checkbox" />
          Remember for this tab (sessionStorage)
        </label>
        <div class="key-dialog__actions">
          <button type="submit" class="btn btn--primary">Save</button>
          <button type="button" class="btn btn--ghost" @click="closeKeyDialog">
            Cancel
          </button>
        </div>
      </form>
    </div>

    <!-- Trigger form -->
    <form class="trigger panel" @submit.prevent="trigger">
      <div class="field">
        <label class="field__label" for="trigger-source">Source</label>
        <select id="trigger-source" v-model="sourceKey">
          <option value="">All active sources</option>
          <option v-for="s in sources" :key="s.key" :value="s.key">
            {{ s.name }}
          </option>
        </select>
      </div>
      <div class="field">
        <label class="field__label" for="trigger-limit">Limit (optional)</label>
        <input
          id="trigger-limit"
          v-model="limitDraft"
          type="number"
          min="1"
          max="1000"
          placeholder="source default"
        />
      </div>
      <div class="trigger__actions">
        <button
          type="submit"
          class="btn btn--primary"
          :disabled="!hasKey || submitting"
          :aria-busy="submitting"
        >
          <span
            v-if="submitting"
            class="spinner spinner--sm"
            aria-hidden="true"
          />
          {{ submitting ? "Triggering…" : "Trigger collection" }}
        </button>
        <p v-if="!hasKey" class="trigger__key-hint">
          Enter the admin key to trigger a collection.
        </p>
      </div>
    </form>

    <p v-if="submittedRuns.length > 0" class="trigger__ok" role="status">
      Queued run
      <template v-for="(run, i) in submittedRuns" :key="run.run_id"
        >{{ i > 0 ? ", " : "" }}#{{ run.run_id }} ({{
          run.source_key ?? "all"
        }}, {{ run.status }})</template
      >
      — the worker picks it up shortly.
    </p>
    <ErrorState v-if="submitError" :error="submitError" />

    <div
      v-if="active.length > 0"
      class="progress-banner"
      role="status"
      aria-live="polite"
    >
      <div class="progress-banner__head">
        <span class="spinner" aria-hidden="true" />
        <span class="progress-banner__title">Collecting…</span>
      </div>
      <div class="progress-banner__runs">
        <div
          v-for="run in active"
          :key="run.run_id"
          class="progress-banner__run"
        >
          <span class="progress-banner__label">
            #{{ run.run_id }} · {{ run.source_key ?? "?" }}
          </span>
          <span class="progress-banner__counts">
            <span class="runs__stat">
              <strong>{{ run.items_fetched }}</strong> fetched
            </span>
            <span class="runs__stat">
              <strong>{{ run.items_new }}</strong> new
            </span>
            <span class="runs__stat">
              <strong>{{ run.items_updated }}</strong> updated
            </span>
          </span>
        </div>
      </div>
    </div>

    <div class="run-activity">
      <span class="run-activity__label">Active now</span>
      <template v-if="active.length > 0">
        <StatusChip
          v-for="run in active"
          :key="run.run_id"
          :status="run.status"
          :label="`#${run.run_id} · ${run.source_key ?? '?'}`"
        />
      </template>
      <span v-else class="run-activity__none">none</span>
      <span v-if="statusQuery.isFetching.value" class="run-activity__note">
        refreshing…
      </span>
    </div>

    <ErrorState
      v-if="statusQuery.error.value"
      :error="statusQuery.error.value"
      :retry="statusQuery.refetch"
    />
    <EmptyState
      v-else-if="!statusQuery.isPending.value && runs.length === 0"
      title="No runs recorded yet."
      hint="Trigger a collection above, or wait for the scheduler's next tick."
    />
    <div
      v-else-if="statusQuery.isPending.value && runs.length === 0"
      class="runs-skeleton"
    >
      <div v-for="n in 4" :key="n" class="skeleton runs-skeleton__row" />
    </div>
    <div
      v-else
      class="table-scroll"
      tabindex="0"
      role="region"
      aria-label="Collection runs"
    >
      <table class="runs">
        <thead>
          <tr>
            <th>Run</th>
            <th>Source</th>
            <th>Status</th>
            <th>Timing</th>
            <th>Items</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in runs" :key="run.run_id">
            <td>
              <span class="mono runs__id">#{{ run.run_id }}</span>
              <span class="runs__trigger">{{ run.trigger }}</span>
            </td>
            <td>
              <code>{{ run.source_key ?? "(deleted source)" }}</code>
            </td>
            <td>
              <StatusChip :status="run.status" />
            </td>
            <td class="runs__timing" data-label="Timing">
              <div class="runs__stamps">
                <span class="runs__stamp">
                  <span class="runs__stamp-label">start</span>
                  <time
                    v-if="run.started_at"
                    :datetime="run.started_at"
                    :title="formatUtc(run.started_at)"
                  >
                    {{ formatCompactInstant(run.started_at) }}
                  </time>
                  <span v-else class="runs__none">—</span>
                </span>
                <span class="runs__stamp">
                  <span class="runs__stamp-label">end</span>
                  <time
                    v-if="run.finished_at"
                    :datetime="run.finished_at"
                    :title="formatUtc(run.finished_at)"
                  >
                    {{ formatCompactInstant(run.finished_at) }}
                  </time>
                  <span v-else class="runs__none">—</span>
                </span>
              </div>
            </td>
            <td data-label="Items">
              <div class="runs__stats">
                <span class="runs__stat">
                  <strong>{{ run.items_fetched }}</strong> fetched
                </span>
                <span class="runs__stat">
                  <strong>{{ run.items_new }}</strong> new
                </span>
                <span class="runs__stat">
                  <strong>{{ run.items_updated }}</strong> updated
                </span>
              </div>
            </td>
            <td class="runs__errors-cell" data-label="Errors">
              <span
                v-if="errorLabel(run)"
                class="runs__error"
                :title="errorTitle(run)"
              >
                {{ errorLabel(run) }}
              </span>
              <span
                v-else-if="errorCounts(run).length > 0"
                class="runs__counts"
              >
                <span
                  v-for="[label, count] in errorCounts(run)"
                  :key="label"
                  class="chip chip--warn"
                >
                  {{ label }} {{ count }}
                </span>
              </span>
              <span v-else class="runs__none">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<style scoped>
.collect-view__key {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.collect-view__key-set {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--success);
  font-size: 0.8125rem;
  font-weight: 600;
}

.collect-view__key-set::before {
  content: "";
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: currentColor;
}

.key-dialog {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: color-mix(in srgb, #0b0b0d 55%, transparent);
}

.key-dialog__box {
  width: min(26rem, 100%);
  box-shadow: var(--shadow-2);
}

.key-dialog__box h2 {
  margin-bottom: 0.35rem;
}

.key-dialog__hint {
  margin: 0 0 1rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.key-dialog__remember {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0.75rem 0 1rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.key-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.trigger {
  display: grid;
  grid-template-columns: minmax(12rem, 2fr) minmax(8rem, 1fr) auto;
  align-items: end;
  gap: 0.75rem;
}

.trigger__actions {
  padding-bottom: 0.05rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
}

.trigger__key-hint {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.trigger__ok {
  margin: 0.9rem 0 0;
  padding: 0.6rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--success) 32%, transparent);
  border-radius: var(--r-md);
  background: var(--success-soft);
  color: var(--success);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.run-activity {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 1.5rem 0 0.6rem;
  font-size: 0.8125rem;
}

.progress-banner {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 1.5rem;
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--accent, #0f766e) 40%, transparent);
  border-radius: var(--r-md);
  background: var(--accent-soft);
  animation: banner-pulse 2s ease-in-out infinite;
}

@keyframes banner-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0
      color-mix(in srgb, var(--accent, #0f766e) 20%, transparent);
  }
  50% {
    box-shadow: 0 0 0 4px
      color-mix(in srgb, var(--accent, #0f766e) 20%, transparent);
  }
}

.progress-banner__head {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.progress-banner__title {
  font-weight: 650;
}

.progress-banner__runs {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.progress-banner__run {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.9rem;
  font-size: 0.8125rem;
}

.progress-banner__label {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.progress-banner__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem 0.55rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.spinner {
  width: 0.9rem;
  height: 0.9rem;
  flex: none;
  border: 2px solid color-mix(in srgb, var(--accent, #0f766e) 25%, transparent);
  border-top-color: var(--accent, #0f766e);
  border-radius: 50%;
  animation: spinner-rotate 0.8s linear infinite;
}

.spinner--sm {
  width: 0.7rem;
  height: 0.7rem;
  display: inline-block;
  vertical-align: -1px;
  margin-right: 0.35rem;
}

@keyframes spinner-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2s;
  }

  .progress-banner {
    animation: none;
  }
}

.run-activity__label {
  color: var(--text-muted);
  font-weight: 600;
}

.run-activity__none {
  color: var(--text-faint);
}

.run-activity__note {
  color: var(--text-faint);
}

.runs {
  min-width: 44rem;
}

.runs__id {
  display: block;
  font-weight: 600;
  white-space: nowrap;
}

.runs__trigger {
  display: block;
  margin-top: 0.1rem;
  color: var(--text-faint);
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.runs__timing {
  white-space: nowrap;
}

.runs__stamps {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.runs__stamp {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.runs__stamp + .runs__stamp {
  margin-top: 0.1rem;
}

.runs__stamp-label {
  width: 2.1rem;
  flex: none;
  color: var(--text-faint);
  font-size: 0.6875rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.runs__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.1rem 0.55rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.runs__stat {
  white-space: nowrap;
}

.runs__stat strong {
  color: var(--text);
  font-weight: 650;
}

.runs__error {
  display: block;
  max-width: 18rem;
  color: var(--danger);
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runs__counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.runs__none {
  color: var(--text-faint);
}

.runs-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.runs-skeleton__row {
  height: 2.5rem;
}

@media (max-width: 48rem) {
  .trigger {
    grid-template-columns: 1fr 1fr;
  }

  .trigger__actions {
    grid-column: span 2;
  }

  .trigger__actions .btn {
    width: 100%;
  }
}

@media (max-width: 32rem) {
  .trigger {
    grid-template-columns: 1fr;
  }

  .trigger__actions {
    grid-column: auto;
  }
}

/* Runs become cards below table width: every field still visible, nothing clipped. */
@media (max-width: 48rem) {
  .table-scroll {
    overflow: visible;
    border: none;
    background: transparent;
    box-shadow: none;
  }

  .runs {
    min-width: 0;
  }

  .runs thead {
    display: none;
  }

  .runs,
  .runs tbody,
  .runs tr,
  .runs td {
    display: block;
    width: auto;
  }

  .runs tr {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.4rem 0.75rem;
    margin-bottom: 0.75rem;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow-1);
  }

  .runs tr:hover {
    background: var(--surface);
  }

  .runs td {
    padding: 0;
    border: none;
  }

  .runs td:nth-child(1) {
    grid-column: 1;
    grid-row: 1;
  }

  .runs td:nth-child(3) {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }

  .runs td:nth-child(2),
  .runs td:nth-child(4),
  .runs td:nth-child(5),
  .runs td:nth-child(6) {
    grid-column: 1 / -1;
  }

  .runs td:nth-child(n + 4) {
    display: grid;
    grid-template-columns: 5rem 1fr;
    gap: 0.55rem;
    align-items: start;
  }

  .runs td:nth-child(n + 4)::before {
    content: attr(data-label);
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .runs__error {
    max-width: none;
    white-space: normal;
    overflow: visible;
  }

  .runs__stats {
    align-content: center;
  }
}
</style>
