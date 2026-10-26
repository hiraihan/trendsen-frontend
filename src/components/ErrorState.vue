<script setup lang="ts">
import { computed } from "vue";
import { ApiError, NetworkError } from "@/api/client";

const props = withDefaults(
  defineProps<{
    error: unknown;
    /** Wire `null` (default) when the failure has no meaningful retry, e.g. a 404. */
    retry?: (() => unknown) | null;
  }>(),
  { retry: null },
);

/**
 * Maps every documented error code (docs/api.md) to a human message. Branching happens on
 * `error.code`, never on `response.status` — the envelope is the contract.
 */
const MESSAGES: Record<string, string> = {
  unauthorized: "Not authorized. Check the admin key.",
  not_found: "Not found. It may have been deleted, or the link is wrong.",
  conflict: "A run is already in progress for that source.",
  validation_error: "The request was rejected: a parameter is out of range.",
  bad_request: "The request was malformed.",
  service_unavailable: "The API is temporarily unable to serve this.",
  internal_error: "Something went wrong on the API side. Try again.",
};

const message = computed(() => {
  const cause = props.error;
  if (cause instanceof ApiError) {
    return MESSAGES[cause.code] ?? cause.message;
  }
  // Only a transport failure means "cannot reach the API". Any other Error carries its
  // own meaning (a rejected key, a failed validation) and must not be mislabelled as
  // an outage — the operator would look at the wrong thing.
  if (cause instanceof NetworkError) return cause.message;
  if (cause instanceof Error) return cause.message;
  return String(cause);
});

const code = computed(() =>
  props.error instanceof ApiError ? props.error.code : null,
);
</script>

<template>
  <div class="error-state" role="alert">
    <svg
      class="error-state__icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        d="M10 5.75v5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <circle cx="10" cy="13.6" r="0.9" fill="currentColor" />
    </svg>
    <div class="error-state__body">
      <code v-if="code" class="error-state__code">{{ code }}</code>
      <p class="error-state__message">{{ message }}</p>
      <div v-if="retry || $slots.default" class="error-state__actions">
        <button
          v-if="retry"
          type="button"
          class="btn btn--ghost btn--sm error-state__retry"
          @click="retry?.()"
        >
          Try again
        </button>
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  border: 1px solid color-mix(in srgb, var(--danger) 38%, transparent);
  border-radius: var(--r-md);
  background: var(--danger-soft);
  margin: 1rem 0;
}

.error-state__icon {
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.15rem;
  color: var(--danger);
  flex: none;
}

.error-state__body {
  min-width: 0;
}

.error-state__code {
  display: block;
  margin: 0 0 0.15rem;
  color: var(--danger);
  font-size: 0.75rem;
}

.error-state__message {
  margin: 0;
  color: var(--text);
}

.error-state__actions {
  margin-top: 0.6rem;
}

/* Ghost on a danger tint: the border keeps it legible in both themes. */
.error-state__retry {
  color: var(--danger);
}
</style>
