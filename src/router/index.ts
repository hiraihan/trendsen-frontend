import { createRouter, createWebHistory } from "vue-router";
import ItemsView from "@/views/ItemsView.vue";
import ItemDetailView from "@/views/ItemDetailView.vue";
import SourcesView from "@/views/SourcesView.vue";
import CollectView from "@/views/CollectView.vue";
import SetupView from "@/views/SetupView.vue";
import NotFoundView from "@/views/NotFoundView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/items" },
    { path: "/items", name: "items", component: ItemsView },
    {
      path: "/items/:id",
      name: "item-detail",
      component: ItemDetailView,
      props: true,
    },
    { path: "/sources", name: "sources", component: SourcesView },
    { path: "/collect", name: "collect", component: CollectView },
    { path: "/setup", name: "setup", component: SetupView },
    // Unknown URLs used to render an empty page under the nav; now they say so.
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: NotFoundView,
    },
  ],
});

const BASE_TITLE = "TrendSentinel";

/** Static per-route labels, in the words the screens themselves use. */
const ROUTE_TITLES: Record<string, string> = {
  items: "Collected items",
  sources: "Sources",
  collect: "Collection runs",
  setup: "Setup",
  "not-found": "Page not found",
};

/**
 * The tab is part of the interface: it should say which screen is open, including after a
 * reload. The item route adds its id, because "which item" is the whole point of the page.
 */
router.afterEach((to) => {
  const label =
    to.name === "item-detail" && typeof to.params.id === "string"
      ? `Item #${to.params.id}`
      : ROUTE_TITLES[String(to.name)];
  document.title = label ? `${label} · ${BASE_TITLE}` : BASE_TITLE;
});
