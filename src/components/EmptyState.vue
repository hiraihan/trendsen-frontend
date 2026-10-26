<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    hint?: string;
  }>(),
  {
    title: "Nothing here yet.",
    hint: undefined,
  },
);
</script>

<template>
  <div class="empty-state">
    <svg
      class="empty-state__mark"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="5"
        y="6"
        width="22"
        height="20"
        rx="3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        d="M10 12h12M10 16h12M10 20h7"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </svg>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="hint" class="empty-state__hint">{{ hint }}</p>
    <div v-if="$slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 2.5rem 1rem;
  text-align: center;
}

.empty-state__mark {
  width: 2rem;
  height: 2rem;
  margin-bottom: 0.35rem;
  color: var(--text-faint);
}

.empty-state__title {
  margin: 0;
  font-weight: 600;
  color: var(--text);
}

.empty-state__hint {
  margin: 0;
  max-width: 34rem;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.empty-state__actions {
  margin-top: 0.75rem;
}
</style>
