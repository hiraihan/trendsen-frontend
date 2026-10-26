import { request, withApiKey } from "./client";
import type { ItemsPage, Item, SnapshotsPage, Source } from "./types";

/** The API base the `request` helper in `./client` uses; needed for raw-download URLs. */
const apiUrl: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export interface ItemsParams {
  source?: string;
  cursor?: string;
  since?: string;
  until?: string;
  q?: string;
  limit?: number;
  /** Viral filter (v1.4): comma-separated keywords selecting the ranking population. */
  keywords?: string;
  /** Viral filter: lower percentile band bound, 0..99. */
  quantile_low?: number;
  /** Viral filter: upper percentile band bound, 1..100. */
  quantile_high?: number;
}

export async function getItems(params: ItemsParams = {}): Promise<ItemsPage> {
  const search = new URLSearchParams();
  if (params.source) search.set("source", params.source);
  // Cursors are echoed verbatim, never decoded or constructed (docs/api.md).
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.since) search.set("since", params.since);
  if (params.until) search.set("until", params.until);
  if (params.q) search.set("q", params.q);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.keywords) search.set("keywords", params.keywords);
  if (params.quantile_low !== undefined)
    search.set("quantile_low", String(params.quantile_low));
  if (params.quantile_high !== undefined)
    search.set("quantile_high", String(params.quantile_high));
  const qs = search.toString();
  return request<ItemsPage>(`/items${qs ? `?${qs}` : ""}`);
}

export async function getItem(id: number): Promise<Item> {
  return request<Item>(`/items/${id}`);
}

export async function getItemSnapshots(
  id: number,
  limit?: number,
): Promise<SnapshotsPage> {
  const qs = limit !== undefined ? `?limit=${limit}` : "";
  return request<SnapshotsPage>(`/items/${id}/snapshots${qs}`);
}

export async function getSources(
  activeOnly = false,
): Promise<{ sources: Source[] }> {
  return request<{ sources: Source[] }>(
    `/sources${activeOnly ? "?active_only=true" : ""}`,
  );
}

/** Set whether a source is collected. Returns the updated source. */
export async function patchSourceActive(
  key: string,
  isActive: boolean,
  adminKey: string,
): Promise<Source> {
  return request<Source>(
    `/sources/${encodeURIComponent(key)}`,
    withApiKey(adminKey, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    }),
  );
}

/**
 * The filters an export honors. Deliberately its own type: the export's `maxRows` ceiling
 * (1..100 000) is not the list's page `limit` (1..100), and conflating them would let a
 * page size silently become a download size.
 */
export interface ExportParams {
  source?: string;
  since?: string;
  until?: string;
  q?: string;
  maxRows?: number;
  /** Viral filter (v1.4): comma-separated keywords selecting the ranking population. */
  keywords?: string;
  /** Viral filter: lower percentile band bound, 0..99. */
  quantile_low?: number;
  /** Viral filter: upper percentile band bound, 1..100. */
  quantile_high?: number;
}

/**
 * How many rows an export would contain for a set of filters.
 *
 * The download itself is a browser navigation, so the CSV's own headers are never shown
 * to the operator — a truncated export would be silent. The plan endpoint lets the
 * dialog say "1 234 rows match, your ceiling is 10 000" before the download starts.
 */
export async function planItemsCsv(
  params: ExportParams = {},
): Promise<{ total_matching: number; max_rows: number }> {
  const search = new URLSearchParams();
  if (params.source) search.set("source", params.source);
  if (params.since) search.set("since", params.since);
  if (params.until) search.set("until", params.until);
  if (params.q) search.set("q", params.q);
  // Echoed back so the dialog compares exactly the numbers a download would apply.
  if (params.maxRows) search.set("max_rows", String(params.maxRows));
  if (params.keywords) search.set("keywords", params.keywords);
  if (params.quantile_low !== undefined)
    search.set("quantile_low", String(params.quantile_low));
  if (params.quantile_high !== undefined)
    search.set("quantile_high", String(params.quantile_high));
  const qs = search.toString();
  return request<{ total_matching: number; max_rows: number }>(
    `/export/items.csv/plan${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Build the CSV-export URL for the current items filters.
 *
 * The download is a plain browser navigation (an `href`, not `fetch`): the response is an
 * attachment stream, so the browser's own download UX is the right handler. The filters
 * mirror `ItemsParams` — an exported CSV always matches what the list on screen shows.
 */
export function itemsCsvUrl(params: ExportParams = {}): string {
  const search = new URLSearchParams();
  if (params.source) search.set("source", params.source);
  if (params.since) search.set("since", params.since);
  if (params.until) search.set("until", params.until);
  if (params.q) search.set("q", params.q);
  if (params.maxRows !== undefined)
    search.set("max_rows", String(params.maxRows));
  if (params.keywords) search.set("keywords", params.keywords);
  if (params.quantile_low !== undefined)
    search.set("quantile_low", String(params.quantile_low));
  if (params.quantile_high !== undefined)
    search.set("quantile_high", String(params.quantile_high));
  const qs = search.toString();
  return `${apiUrl}/export/items.csv${qs ? `?${qs}` : ""}`;
}
