import { defineConfig } from '@playwright/test'

/**
 * The E2E smoke runs against the compose stack (T19: the contract under test is the
 * documented API itself), not a mocked backend. Override with SPA_E2E_BASE_URL /
 * API_E2E_BASE_URL when the stack lives elsewhere.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.SPA_E2E_BASE_URL ?? 'http://localhost:5180',
  },
  // Fail fast locally; the smoke is one file.
  workers: 1,
})
