import { computed, shallowRef } from "vue";

const STORAGE_KEY = "trendsentinel.admin_key";

/**
 * The admin key lives in the tab, not the app: `sessionStorage` is opt-in,
 * `localStorage` is forbidden (T19). Sent only as the X-API-Key header by collect.ts;
 * never logged, rendered, or embedded in the bundle.
 */
const key = shallowRef<string | null>(sessionStorage.getItem(STORAGE_KEY));

function set(value: string, remember: boolean) {
  key.value = value;
  if (remember) {
    sessionStorage.setItem(STORAGE_KEY, value);
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

function clear() {
  key.value = null;
  sessionStorage.removeItem(STORAGE_KEY);
}

const hasKey = computed(() => key.value !== null && key.value.length > 0);

export function useAdminKey() {
  return { key, hasKey, set, clear };
}
