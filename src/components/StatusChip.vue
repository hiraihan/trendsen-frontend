<script setup lang="ts">
import { computed } from "vue";

/**
 * The single place a state is turned into a chip. Run statuses and source activity both
 * route through here so the vocabulary is identical on every screen.
 */
const props = defineProps<{ status: string; label?: string }>();

const TONES: Record<string, string> = {
  pending: "chip--warn chip--dot",
  running: "chip--accent chip--dot",
  succeeded: "chip--success",
  partial: "chip--warn",
  failed: "chip--danger",
  skipped: "",
  active: "chip--success chip--dot",
  inactive: "",
};

const tone = computed(() => TONES[props.status] ?? "");
</script>

<template>
  <span class="chip" :class="tone">{{ label ?? status }}</span>
</template>
