<script setup lang="ts"></script>

<template>
  <!-- First in the DOM so the very first Tab reaches it, ahead of the sticky nav. -->
  <a class="app-skip" href="#content">Skip to content</a>

  <nav class="app-nav">
    <div class="app-nav__inner">
      <RouterLink to="/items" class="app-nav__brand">
        <svg
          class="app-nav__mark"
          viewBox="0 0 20 20"
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx="10"
            cy="10"
            r="7.25"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <circle cx="10" cy="10" r="2" fill="currentColor" />
        </svg>
        <span>TrendSentinel</span>
      </RouterLink>
      <div class="app-nav__links">
        <RouterLink to="/items">Items</RouterLink>
        <RouterLink to="/sources">Sources</RouterLink>
        <RouterLink to="/collect">Collect</RouterLink>
        <RouterLink to="/setup">Setup</RouterLink>
      </div>
    </div>
  </nav>

  <div id="content" class="app-content" tabindex="-1">
    <RouterView />
  </div>
</template>

<!-- Scoped: the global base (tokens, controls) lives in src/style.css. -->
<style scoped>
/* Keyboard users land past the sticky nav without tabbing three links. */
.app-skip {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 50;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--accent);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--accent);
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  transform: translateY(-200%);
  transition: transform var(--speed) var(--ease-out);
}

.app-skip:focus-visible {
  transform: translateY(0);
}

/* The skip target takes focus programmatically; a page-sized ring helps nobody. */
.app-content:focus-visible,
.app-content:focus {
  outline: none;
}

.app-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.app-nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: var(--page-max);
  margin: 0 auto;
  padding: 0.75rem var(--page-pad);
}

.app-nav__brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text);
  font-size: 0.9375rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-decoration: none;
  white-space: nowrap;
}

.app-nav__mark {
  width: 1.125rem;
  height: 1.125rem;
  color: var(--accent);
  flex: none;
}

.app-nav__links {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.app-nav__links a {
  padding: 0.35rem 0.7rem;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  font-size: 0.875rem;
  font-weight: 550;
  text-decoration: none;
  transition:
    background-color var(--speed) var(--ease-out),
    color var(--speed) var(--ease-out);
}

.app-nav__links a:hover {
  background: var(--surface-2);
  color: var(--text);
}

.app-nav__links a.router-link-active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

@media (max-width: 26rem) {
  .app-nav__links {
    gap: 0;
  }

  .app-nav__links a {
    padding: 0.35rem 0.5rem;
    font-size: 0.8125rem;
  }
}
</style>
