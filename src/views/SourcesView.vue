<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, watch } from "vue";
import { getSources, patchSourceActive } from "@/api/endpoints";
import type { Source } from "@/api/types";
import { useAdminKey } from "@/composables/useAdminKey";
import ErrorState from "@/components/ErrorState.vue";
import EmptyState from "@/components/EmptyState.vue";
import StatusChip from "@/components/StatusChip.vue";
import { formatInstant, formatRelative } from "@/utils/formatters";

/**
 * Renders whatever sanitized keys exist in `config` (docs/api.md: credential-like keys are
 * dropped before serialization). The table must not assume any key survived sanitization.
 */
const sources = shallowRef<Source[]>([]);
const error = shallowRef<unknown>(null);
const pending = shallowRef(true);

const activeCount = computed(
  () => sources.value.filter((source) => source.is_active).length,
);

onMounted(() => void loadSources());

/** One load path for first paint and for the retry button. */
async function loadSources(): Promise<void> {
  pending.value = true;
  error.value = null;
  try {
    sources.value = (await getSources()).sources;
  } catch (cause: unknown) {
    error.value = cause;
  } finally {
    pending.value = false;
  }
}

// -- admin key + per-source collect toggle --------------------------------------

const { key, hasKey, set } = useAdminKey();
const keyDraft = shallowRef("");
const keyDialogOpen = shallowRef(false);
const keyInput = shallowRef<HTMLInputElement | null>(null);
const togglingKey = shallowRef<string | null>(null);
const toggleError = shallowRef<unknown>(null);

function openKeyDialog() {
  keyDraft.value = "";
  keyDialogOpen.value = true;
  nextTick(() => keyInput.value?.focus());
}

function saveKey() {
  if (keyDraft.value.trim()) set(keyDraft.value.trim(), false);
  keyDialogOpen.value = false;
}

watch(keyDialogOpen, (open) => {
  if (open) nextTick(() => keyInput.value?.focus());
});

/** Pause/resume collection. Without a key, ask for one first. */
async function toggleSource(source: Source): Promise<void> {
  if (!hasKey.value) {
    openKeyDialog();
    return;
  }
  togglingKey.value = source.key;
  toggleError.value = null;
  try {
    const updated = await patchSourceActive(
      source.key,
      !source.is_active,
      key.value!,
    );
    sources.value = sources.value.map((s) =>
      s.id === updated.id ? updated : s,
    );
  } catch (cause: unknown) {
    toggleError.value = cause;
  } finally {
    togglingKey.value = null;
  }
}

function configKeys(sources: Source[]): string[] {
  const keys = new Set<string>();
  for (const source of sources) {
    for (const key of Object.keys(source.config)) keys.add(key);
  }
  return [...keys].sort();
}

/** Values arrive as unknown JSON scalars; render them as they are, never reinterpret. */
function configValue(source: Source, key: string): string {
  const value = source.config[key];
  return value === undefined ? "—" : String(value);
}

/** No-credential integrations (ADR-0008) require an allowlist; flag a missing one. */
function allowlistMissing(source: Source): boolean {
  if (source.integration !== "rss" && source.integration !== "public_api")
    return false;
  const domains = source.config.allowed_domains;
  return domains === undefined || String(domains).trim() === "";
}
</script>

<template>
  <main class="sources-view page">
    <div class="view-head">
      <div>
        <h1>Sources</h1>
        <p v-if="!error && sources.length > 0" class="view-sub">
          {{ sources.length }} configured · {{ activeCount }} active
        </p>
      </div>
      <div class="sources-view__head-actions">
        <button
          v-if="!hasKey"
          type="button"
          class="btn btn--ghost btn--sm"
          @click="openKeyDialog"
        >
          Enter admin key…
        </button>
        <span v-else class="sources-view__key-set">admin key set</span>
        <RouterLink to="/collect" class="btn btn--ghost btn--sm">
          Trigger a run
        </RouterLink>
      </div>
    </div>

    <!-- Admin key dialog: needed to change a source's collect state. -->
    <div
      v-if="keyDialogOpen"
      class="key-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sources-admin-key-title"
      @click.self="keyDialogOpen = false"
      @keydown.esc="keyDialogOpen = false"
    >
      <form class="key-dialog__box panel" @submit.prevent="saveKey">
        <h2 id="sources-admin-key-title">Admin key</h2>
        <div class="field">
          <label class="field__label" for="sources-admin-key">Key</label>
          <input
            id="sources-admin-key"
            ref="keyInput"
            v-model="keyDraft"
            type="password"
            autocomplete="off"
          />
        </div>
        <div class="key-dialog__actions">
          <button
            type="button"
            class="btn btn--ghost"
            @click="keyDialogOpen = false"
          >
            Cancel
          </button>
          <button type="submit" class="btn btn--primary">Save key</button>
        </div>
      </form>
    </div>

    <ErrorState v-if="error" :error="error" :retry="loadSources" />
    <ErrorState v-if="toggleError" :error="toggleError" :retry="loadSources" />
    <EmptyState
      v-else-if="!pending && sources.length === 0"
      title="No sources configured."
      hint="Seeded sources arrive with the database migrations."
    />

    <div v-else-if="pending" class="sources-view__skeleton">
      <div
        v-for="n in 3"
        :key="n"
        class="skeleton sources-view__skeleton-row"
      />
    </div>

    <div
      v-else
      class="table-scroll"
      tabindex="0"
      role="region"
      aria-label="Configured sources"
    >
      <table class="sources-view__table">
        <thead>
          <tr>
            <th>Source</th>
            <th>State</th>
            <th>Configuration</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="source in sources" :key="source.id">
            <td data-label="Source">
              <div class="cell">
                <div class="sources-view__keyline">
                  <RouterLink
                    :to="{ path: '/items', query: { source: source.key } }"
                    class="sources-view__keylink"
                    :title="`Show only ${source.key} items`"
                    ><code class="sources-view__key">{{
                      source.key
                    }}</code></RouterLink
                  >
                  <span class="chip sources-view__integration">{{
                    source.integration
                  }}</span>
                </div>
                <span class="sources-view__name">{{ source.name }}</span>
                <span
                  v-if="allowlistMissing(source)"
                  class="sources-view__allowlist-missing"
                  title="No-credential sources require config.allowed_domains"
                >
                  allowlist missing
                </span>
              </div>
            </td>
            <td data-label="State">
              <StatusChip
                :status="source.is_active ? 'active' : 'inactive'"
                :label="source.is_active ? 'active' : 'paused'"
              />
            </td>
            <td data-label="Configuration">
              <div class="sources-view__config">
                <span
                  v-for="key in configKeys([source])"
                  :key="key"
                  class="sources-view__config-item"
                >
                  <span class="sources-view__config-key">{{ key }}</span>
                  <span class="sources-view__config-value">{{
                    configValue(source, key)
                  }}</span>
                </span>
              </div>
            </td>
            <td data-label="Updated" class="sources-view__updated num">
              <div class="cell">
                <time :datetime="source.updated_at">{{
                  formatInstant(source.updated_at)
                }}</time>
                <span class="sources-view__relative">{{
                  formatRelative(source.updated_at)
                }}</span>
              </div>
            </td>
            <td data-label="Action">
              <button
                type="button"
                class="btn btn--ghost btn--sm"
                :disabled="togglingKey === source.key"
                :aria-busy="togglingKey === source.key"
                @click="toggleSource(source)"
              >
                {{
                  togglingKey === source.key
                    ? "Saving…"
                    : source.is_active
                      ? "Pause"
                      : "Collect"
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>

<style scoped>
.sources-view__head-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sources-view__key-set {
  color: var(--success);
  font-size: 0.8125rem;
  font-weight: 600;
}

.sources-view__table {
  min-width: 44rem;
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

.key-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

.sources-view__keyline {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.sources-view__integration {
  padding-block: 0;
  font-size: 0.6875rem;
}

.sources-view__keylink {
  text-decoration: none;
  transition: color var(--speed) var(--ease-out);
}

.sources-view__keylink:hover {
  color: var(--accent);
}

.sources-view__keylink:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.sources-view__key {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text);
}

.sources-view__name {
  display: block;
  margin-top: 0.15rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.sources-view__allowlist-missing {
  display: inline-block;
  margin-top: 0.2rem;
  padding: 0.05rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--warn, #b45309) 45%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--warn, #b45309) 10%, transparent);
  color: var(--warn, #b45309);
  font-size: 0.6875rem;
  font-weight: 650;
  width: max-content;
}

.sources-view__updated {
  white-space: nowrap;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.sources-view__config {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  max-width: 28rem;
}

.sources-view__config-item {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  padding: 0.05rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.sources-view__config-key {
  color: var(--text-muted);
}

.sources-view__config-value {
  color: var(--text);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.sources-view__relative {
  display: block;
  color: var(--text-faint);
  font-size: 0.75rem;
}

.sources-view__skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.sources-view__skeleton-row {
  height: 3.25rem;
}

@media (max-width: 46rem) {
  .table-scroll {
    border: none;
    background: transparent;
    box-shadow: none;
    overflow-x: visible;
  }

  .sources-view__table {
    min-width: 0;
  }

  .sources-view__table thead {
    display: none;
  }

  .sources-view__table,
  .sources-view__table tbody,
  .sources-view__table tr,
  .sources-view__table td {
    display: block;
    width: 100%;
  }

  .sources-view__table tr {
    margin-bottom: 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow-1);
    overflow: hidden;
  }

  .sources-view__table tr:hover {
    background: var(--surface);
  }

  .sources-view__table td {
    display: grid;
    grid-template-columns: 7.5rem 1fr;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.55rem 0.75rem;
  }

  .sources-view__table td > * {
    min-width: 0;
  }

  .sources-view__table td > .chip {
    justify-self: start;
  }

  .sources-view__table td::before {
    content: attr(data-label);
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .sources-view__config {
    max-width: none;
  }
}
</style>
