<script setup lang="ts">
import EmptyState from "@/components/EmptyState.vue";
</script>

<template>
  <main class="not-found page">
    <div class="view-head">
      <div>
        <h1>Page not found</h1>
        <p class="view-sub">That address does not match any screen.</p>
      </div>
    </div>

    <EmptyState
      title="Nothing lives at this URL."
      hint="Check the link, or start again from the collected items."
    >
      <RouterLink to="/items" class="btn btn--primary"
        >Collected items</RouterLink
      >
    </EmptyState>
  </main>
</template>
