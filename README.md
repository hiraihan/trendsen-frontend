# TrendSentinel SPA

A Vue 3 + TypeScript frontend for the TrendSentinel API: browse collected items, inspect
their metric history, watch collection runs, and trigger new ones. One extra screen — Setup —
provisions API credentials for the authenticated sources.

> **Read-only by design.** This client computes no score, ranking, trend or sentiment. It
> consumes the documented HTTP endpoints and presents what the API returns.

- **Stack:** Vue 3 · Vite · TypeScript · TanStack Query · Vue Router
- **Backend:** a separate repository; the SPA talks to it over HTTP only.

## Features

- Browse items with keyset pagination, filtering by source / time / title query.
- Item detail with a metric-history chart and per-item metadata.
- Collect screen: run status + trigger a collection run with the admin key.
- Setup screen: provision credentials for Reddit / X / Threads (write-only).
- Admin key kept in memory (optionally per-tab via `sessionStorage`), never in `localStorage`.

## Quickstart

```bash
cp .env.example .env     # sets VITE_API_URL and SPA_E2E_BASE_URL
npm ci
npm run dev              # http://localhost:5173
```

The API must allow this origin or the browser blocks every request. In the **backend**
repository's `.env`:

```bash
CORS_ORIGINS=http://localhost:5173,http://localhost:5180
```

then restart its API (`docker compose up -d api` inside `backend/`).

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on `:5173` |
| `npm run build` | `vue-tsc` type check + production bundle |
| `npm run test -- --run` | Vitest unit/component tests (86) |
| `npm run test:e2e` | Full-stack Playwright suite against a running SPA and API (10 tests) |
| `npm run lint` | ESLint + Prettier check |
| `npm run format` | Prettier write |

`VITE_API_URL` is baked into the bundle at **build** time, not read at runtime: changing it
means rebuilding, not restarting.

## Docker

```bash
docker compose up -d --build     # serves http://localhost:5180
```

The SPA is static files — no database, no volume, no migration, and no network dependency on
the API container. The browser reaches the API over the host's published port, so this stack
runs independently of the backend's.

If the API is served from another origin, set both sides:

```bash
VITE_API_URL=https://api.example.com docker compose up -d --build
# and in the backend's .env:  CORS_ORIGINS=https://spa.example.com
```

## E2E smoke

Playwright drives a real browser against a running SPA and a running API — never a mocked
backend. Four spec files, ten tests:

| Spec | What it pins |
|---|---|
| `smoke.spec.ts` | items → detail → snapshots → collect, the 401 and 202 paths, and the proof that the admin key appears in **no request URL** and **no page text** |
| `filters.spec.ts` | the filter wire format — a wall time leaves as a timezone-aware instant, plus `q`, the source chip, and "Clear filters" |
| `navigation.spec.ts` | the quiet failures — an unknown URL, a failed load that recovers, the back link that keeps the filter, and the skip link |
| `setup.spec.ts` | unlock → provision Reddit credentials → the source goes ready |

```bash
npx playwright install chromium          # once
# with the backend stack up and the SPA served:
ADMIN_API_KEY=<the same key as the backend> npm run test:e2e
```

`SPA_E2E_BASE_URL` (default `http://localhost:5180`) says where the SPA is served.

## Project layout

```
src/
├── api/            client wrapper, types, one function per endpoint, credentials
├── composables/    keyset pagination + the admin key store
├── components/     ItemCard, MetricsBadge, SnapshotsChart, StatusChip, ErrorState, EmptyState
├── views/          Items, ItemDetail, Sources, Collect, Setup, NotFound
├── router/         routes + per-route document titles
├── utils/          formatters
├── style.css       design tokens and shared controls
└── main.ts         router + VueQueryPlugin
```

## Design rules

- Reads never carry the admin key; only the two write endpoints and the credential-status
  read do.
- Cursors are echoed, never built — pagination is the API's keyset contract.
- Every non-2xx response surfaces through the shared error envelope.
- Credential values are write-only: stored, never rendered, never returned, never in a URL.
