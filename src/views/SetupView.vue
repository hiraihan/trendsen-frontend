<script setup lang="ts">
import { computed, onMounted, reactive, shallowRef } from "vue";
import {
  getCredentialStatus,
  postSourceCredentials,
  type CredentialStatus,
} from "@/api/credentials";
import { ApiError, NetworkError } from "@/api/client";
import { useAdminKey } from "@/composables/useAdminKey";
import ErrorState from "@/components/ErrorState.vue";
import StatusChip from "@/components/StatusChip.vue";

/**
 * The Setup screen is the web answer to the SQL runbook in docs/sources.md: paste the
 * Reddit/X/Threads credentials into a form, save, and the source goes live. Credential
 * values are write-only — the status endpoint answers with booleans, and nothing ever
 * echoes a stored value back.
 *
 * The status endpoint requires the admin key (ADR-0006, amended), which makes this
 * screen's flow honest: "Unlock setup" sends the key on the status call, so a wrong key
 * is a visible 401 *before* any credential is stored. The key comes from the shared
 * composable (the same one CollectView uses), so it works whichever screen set it.
 */
const { key, hasKey, set, clear } = useAdminKey();

const keyDraft = shallowRef("");
const savingKey = shallowRef(false);
const keyError = shallowRef<unknown>(null);

/**
 * Unlock = verify the draft with the one call this screen makes before the first write.
 * A 401 rejects the draft outright — the key is adopted only after the status call
 * succeeded — and a network failure is distinguished from a wrong key.
 */
async function saveKey() {
  if (!keyDraft.value.trim()) return;
  savingKey.value = true;
  keyError.value = null;
  const candidate = keyDraft.value.trim();
  try {
    // The verification call is also the load: its answer is the status map, so there
    // is no second identical request right after it.
    const loaded = await getCredentialStatus(candidate);
    set(candidate, false);
    keyDraft.value = "";
    statuses.value = loaded.sources;
    statusError.value = null;
  } catch (cause: unknown) {
    keyError.value = describeKeyFailure(cause);
  } finally {
    // The button must become usable again whatever the outcome: a rejected key
    // leaves the panel open, and the operator has to be able to type a new one
    // (a stuck "Checking…" would force a full page reload).
    savingKey.value = false;
  }
}

/**
 * Say what actually went wrong. Only a 401 means "wrong key": reporting a server
 * error as a bad key would send the operator hunting for the wrong problem. The
 * envelope's code is the contract (docs/api.md), so the branch is on the code.
 */
function describeKeyFailure(cause: unknown): unknown {
  if (cause instanceof NetworkError) return cause;
  if (cause instanceof ApiError && cause.code === "unauthorized") {
    return new Error("The admin key was rejected. Check it and try again.");
  }
  if (cause instanceof ApiError) {
    return new Error(
      `The API could not verify the key (${cause.code}). Try again in a moment.`,
    );
  }
  return new Error("The admin key could not be verified. Try again.");
}

/** The key the next save sends: the composable's value, whatever screen set it. */
const activeKey = computed(() => key.value ?? "");

// -- status -------------------------------------------------------------------

const statuses = shallowRef<CredentialStatus[]>([]);
/** Starts true only when a key already exists and the mount will fetch. */
const loading = shallowRef(hasKey.value);
const statusError = shallowRef<unknown>(null);

/**
 * Reload the readiness map with the adopted key. A 401 here means the key went stale
 * (or was entered on another screen and rejected there): drop it so the unlock panel
 * comes back, instead of stranding the operator in front of dead forms.
 */
async function refresh() {
  statusError.value = null;
  try {
    statuses.value = (await getCredentialStatus(activeKey.value)).sources;
  } catch (cause: unknown) {
    if (cause instanceof ApiError && cause.code === "unauthorized") {
      // The key went stale (or was rejected elsewhere): back to the unlock panel,
      // which is its own message — no duplicate error state on top of it.
      clear();
      return;
    }
    statusError.value = cause;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  // Only load when a key exists: without it the endpoint answers 401 and the unlock
  // panel is the right first screen.
  if (hasKey.value) void refresh();
});

// -- per-source forms ---------------------------------------------------------

interface FieldSpec {
  name: string;
  label: string;
  secret: boolean;
  hint: string;
}

/**
 * The platforms this screen provisions, in display order. Static by design: the
 * readiness *numbers* live behind the admin-key-guarded status endpoint, but the
 * platform *names* are the spec §3 source table and are public — naming them before
 * unlock is what tells the operator the single key panel is not the whole page.
 */
const PLATFORMS = [
  {
    key: "reddit",
    name: "Reddit",
    where: "reddit.com/prefs/apps — script app",
    fields: "client id · client secret · user agent",
  },
  {
    key: "x",
    name: "X",
    where: "X developer portal",
    fields: "app-only bearer token",
  },
  {
    key: "threads",
    name: "Threads",
    where: "Meta app dashboard",
    fields: "long-lived access token",
  },
] as const;

/** Per collector key: what the form asks for, in the words of docs/sources.md. */
const FIELD_SPECS: Record<string, FieldSpec[]> = {
  reddit: [
    {
      name: "reddit_client_id",
      label: "Client ID",
      secret: false,
      hint: "From reddit.com/prefs/apps — the string under your script app.",
    },
    {
      name: "reddit_client_secret",
      label: "Client secret",
      secret: true,
      hint: "The secret of the same script app.",
    },
    {
      name: "reddit_user_agent",
      label: "User agent",
      secret: false,
      hint: "Descriptive and app-style, e.g. platform:app:1.0 (by /u/you).",
    },
  ],
  x: [
    {
      name: "x_bearer_token",
      label: "Bearer token",
      secret: true,
      hint: "App-only bearer token from the X developer portal (paid read tier).",
    },
  ],
  threads: [
    {
      name: "threads_access_token",
      label: "Access token",
      secret: true,
      hint: "Long-lived user token (~60 days) after Meta App Review.",
    },
  ],
};

interface Draft {
  values: Record<string, string>;
  activate: boolean;
  submitting: boolean;
  error: unknown;
  saved: boolean;
  savedKeys: string[];
}

/**
 * Drafts are created once per source and stored — a form writing into a throwaway object
 * would lose every keystroke. ``reactive`` (not ``shallowRef``) because the inputs mutate
 * nested fields and every keystroke must render.
 */
const drafts = reactive<Record<string, Draft>>({});

function draftFor(status: CredentialStatus): Draft {
  if (!drafts[status.source_key]) {
    drafts[status.source_key] = {
      values: Object.fromEntries(
        status.required_keys.map((name) => [name, ""]),
      ),
      activate: true,
      submitting: false,
      error: null,
      saved: false,
      savedKeys: [],
    };
  }
  return drafts[status.source_key];
}

function fieldsFor(status: CredentialStatus): FieldSpec[] {
  return FIELD_SPECS[status.collector_key] ?? [];
}

/**
 * Readiness comes from the server's own declaration (`required_keys`), not from the
 * local form table: the server knows which credentials the collector actually needs.
 * A source with no declared keys is ready; otherwise every declared key must be set.
 */
function isReady(status: CredentialStatus): boolean {
  if (status.required_keys.length === 0) return true;
  return status.required_keys.every((name) => status.keys[name]);
}

function statusLabel(status: CredentialStatus): string {
  if (status.required_keys.length === 0) return "ready";
  return isReady(status) ? "ready" : "waiting for credentials";
}

function statusOf(status: CredentialStatus): string {
  return isReady(status) ? "succeeded" : "pending";
}

async function save(status: CredentialStatus) {
  const draft = draftFor(status);
  const credentials = Object.fromEntries(
    Object.entries(draft.values).filter(([, value]) => value.trim() !== ""),
  );
  if (Object.keys(credentials).length === 0) return;

  draft.submitting = true;
  draft.error = null;
  try {
    const result = await postSourceCredentials(
      status.source_key,
      credentials,
      draft.activate,
      activeKey.value,
    );
    draft.saved = true;
    draft.savedKeys = result.configured_keys;
    // Clear the pasted values: they served their purpose and must not linger.
    draft.values = Object.fromEntries(
      Object.keys(draft.values).map((name) => [name, ""]),
    );
    await refresh();
  } catch (cause: unknown) {
    draft.error = cause;
  } finally {
    draft.submitting = false;
  }
}

const allReady = computed(
  () => statuses.value.length > 0 && statuses.value.every(isReady),
);
</script>

<template>
  <main class="setup-view page">
    <div class="view-head">
      <div>
        <h1>Setup</h1>
        <p class="view-sub">
          Provision the API credentials for Reddit, X and Threads. Values are
          stored server-side and never shown again — to change one, save a new
          value.
        </p>
      </div>
    </div>

    <!--
      What is behind the unlock: the three credentialed platforms. Shown before any
      key is entered so the key panel reads as the doorway, not the destination.
    -->
    <ul class="setup-platforms" aria-label="Platforms awaiting credentials">
      <li
        v-for="platform in PLATFORMS"
        :key="platform.key"
        class="setup-platforms__item"
      >
        <span class="setup-platforms__name">{{ platform.name }}</span>
        <span class="setup-platforms__meta">{{ platform.where }}</span>
        <span class="setup-platforms__meta">{{ platform.fields }}</span>
      </li>
    </ul>

    <!--
      Admin key panel. The unlock posts the key to the authenticated status endpoint
      first: unlock *is* verification here, and a wrong key never gets adopted. The
      panel names what is behind the unlock, so the single-form first screen is not
      mistaken for the whole page.
    -->
    <div v-if="!activeKey" class="panel setup-key">
      <h2>Admin key</h2>
      <p class="setup-key__hint">
        Enter the admin key to unlock the credential forms for
        <strong>Reddit</strong>, <strong>X</strong> and
        <strong>Threads</strong> — one section per platform. The key is verified
        against the API first, then sent only as the <code>X-API-Key</code>
        header, and stays in this tab.
      </p>
      <form class="setup-key__form" @submit.prevent="saveKey">
        <div class="field">
          <label class="field__label" for="setup-admin-key">Key</label>
          <input
            id="setup-admin-key"
            v-model="keyDraft"
            type="password"
            autocomplete="off"
            required
          />
        </div>
        <button
          type="submit"
          class="btn btn--primary"
          :disabled="savingKey || !keyDraft.trim()"
        >
          {{ savingKey ? "Checking…" : "Unlock setup" }}
        </button>
      </form>
      <ErrorState v-if="keyError" :error="keyError" />
    </div>
    <p v-else class="setup-key setup-key--ok">
      <span class="setup-key__set">admin key set</span>
      <button type="button" class="btn btn--ghost btn--sm" @click="clear()">
        Clear key
      </button>
    </p>

    <ErrorState v-if="statusError" :error="statusError" :retry="refresh" />

    <div v-else-if="loading" class="runs-skeleton">
      <div v-for="n in 3" :key="n" class="skeleton setup-skeleton__row" />
    </div>

    <template v-else>
      <p v-if="allReady" class="setup-done" role="status">
        All credentialed sources are configured. Head to
        <RouterLink to="/collect">Collection runs</RouterLink> to trigger a run.
      </p>

      <section
        v-for="status in statuses"
        :key="status.source_key"
        class="panel setup-source"
        :aria-labelledby="`setup-${status.source_key}`"
      >
        <header class="setup-source__head">
          <h2 :id="`setup-${status.source_key}`">{{ status.name }}</h2>
          <StatusChip :status="statusOf(status)" :label="statusLabel(status)" />
        </header>

        <!-- Readiness at a glance: one boolean per declared key, never a value. -->
        <ul class="setup-source__keys">
          <li
            v-for="name in status.required_keys"
            :key="name"
            :class="[
              'setup-key-state',
              status.keys[name] ? 'setup-key-state--set' : '',
            ]"
          >
            <code>{{ name }}</code>
            <span>{{ status.keys[name] ? "set" : "not set" }}</span>
          </li>
        </ul>

        <div v-if="!activeKey" class="setup-source__locked">
          Enter the admin key above to edit this source.
        </div>

        <form v-else class="setup-form" @submit.prevent="save(status)">
          <div
            v-for="field in fieldsFor(status)"
            :key="field.name"
            class="field"
          >
            <label
              class="field__label"
              :for="`setup-${status.source_key}-${field.name}`"
            >
              {{ field.label }}
              <span v-if="status.keys[field.name]" class="setup-form__current">
                (a value is stored — leave blank to keep it)
              </span>
            </label>
            <input
              :id="`setup-${status.source_key}-${field.name}`"
              v-model="draftFor(status).values[field.name]"
              :type="field.secret ? 'password' : 'text'"
              autocomplete="off"
              :placeholder="status.keys[field.name] ? '••••••••' : ''"
            />
            <p class="setup-form__hint">{{ field.hint }}</p>
          </div>

          <label class="setup-form__activate">
            <input v-model="draftFor(status).activate" type="checkbox" />
            Activate the source (start collecting after saving)
          </label>

          <div class="setup-form__actions">
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="
                draftFor(status).submitting ||
                Object.values(draftFor(status).values).every(
                  (value) => !value.trim(),
                )
              "
            >
              {{ draftFor(status).submitting ? "Saving…" : "Save credentials" }}
            </button>
          </div>

          <p v-if="draftFor(status).saved" class="setup-form__ok" role="status">
            Stored
            <template
              v-for="(name, i) in draftFor(status).savedKeys"
              :key="name"
            >
              {{ i > 0 ? ", " : "" }}<code>{{ name }}</code></template
            >{{ draftFor(status).activate ? " and activated the source" : "" }}.
          </p>
          <ErrorState
            v-if="draftFor(status).error"
            :error="draftFor(status).error"
          >
            <span
              v-if="draftFor(status).error instanceof ApiError"
              class="setup-form__detail"
            >
              {{ (draftFor(status).error as ApiError).message }}
            </span>
          </ErrorState>
        </form>
      </section>
    </template>
  </main>
</template>

<style scoped>
.setup-platforms {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin: 0 0 1.25rem;
  padding: 0;
  list-style: none;
}

.setup-platforms__item {
  display: grid;
  gap: 0.15rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface, transparent);
}

.setup-platforms__name {
  font-weight: 600;
}

.setup-platforms__meta {
  color: var(--text-faint);
  font-size: 0.8125rem;
}

.setup-key {
  margin-bottom: 1.25rem;
}

.setup-key--ok {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0 0 1.25rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--success) 32%, transparent);
  border-radius: var(--r-md);
  background: var(--success-soft);
}

.setup-key__set {
  color: var(--success);
  font-size: 0.8125rem;
  font-weight: 600;
}

.setup-key__hint {
  margin: 0 0 0.9rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.setup-key__form {
  display: flex;
  align-items: end;
  gap: 0.75rem;
}

.setup-key__form .field {
  flex: 1;
  max-width: 24rem;
}

.setup-done {
  margin: 0 0 1.25rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--success) 32%, transparent);
  border-radius: var(--r-md);
  background: var(--success-soft);
  color: var(--success);
  font-size: 0.875rem;
}

.setup-source {
  margin-bottom: 1.25rem;
}

.setup-source__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.setup-source__head h2 {
  margin: 0;
  font-size: 1.0625rem;
}

.setup-source__keys {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
  margin: 0 0 1rem;
  padding: 0;
  list-style: none;
}

.setup-key-state {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}

.setup-key-state span {
  color: var(--text-faint);
}

.setup-key-state--set span {
  color: var(--success);
  font-weight: 600;
}

.setup-source__locked {
  color: var(--text-faint);
  font-size: 0.875rem;
}

.setup-form {
  display: grid;
  gap: 0.9rem;
}

.setup-form__current {
  color: var(--text-faint);
  font-weight: 400;
  font-size: 0.75rem;
}

.setup-form__hint {
  margin: 0.3rem 0 0;
  color: var(--text-faint);
  font-size: 0.8125rem;
}

.setup-form__activate {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.setup-form__actions {
  display: flex;
  justify-content: flex-end;
}

.setup-form__ok {
  margin: 0;
  padding: 0.6rem 0.9rem;
  border: 1px solid color-mix(in srgb, var(--success) 32%, transparent);
  border-radius: var(--r-md);
  background: var(--success-soft);
  color: var(--success);
  font-size: 0.875rem;
}

.setup-form__detail {
  display: block;
  color: var(--danger);
  font-size: 0.8125rem;
}

.setup-skeleton__row {
  height: 8rem;
}

@media (max-width: 32rem) {
  .setup-platforms {
    grid-template-columns: 1fr;
  }

  .setup-key__form {
    flex-direction: column;
    align-items: stretch;
  }

  .setup-key__form .field {
    max-width: none;
  }
}
</style>
