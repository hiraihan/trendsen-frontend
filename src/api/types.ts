// Response types mirroring docs/api.md. Nothing invented: every field exists in the
// documented responses. `metrics` is populated by GET /items/{id} and — since the
// list-endpoint amendment — by GET /items page entries as each item's newest snapshot.
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

export interface Source {
  id: number;
  key: string;
  name: string;
  integration: "api" | "rss" | "html" | "public_api";
  base_url: string | null;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ItemMetrics {
  [key: string]: number;
}

export interface Item {
  id: number;
  source_id: number;
  external_id: string;
  url: string | null;
  title: string | null;
  text: string | null;
  author: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  captured_at: string;
  last_seen_at: string;
  /** Newest snapshot metrics — populated by the detail and list endpoints; null when the item has none. */
  metrics: ItemMetrics | null;
  /** Present only on a viral-filtered request: whether the item fell in the requested band. */
  viral?: boolean;
  /** The item's percentile (0..100) within its day's population, on a viral-filtered request. */
  percentile?: number | null;
}

export interface ItemsPage {
  items: Item[];
  total: number;
  next_cursor: string | null;
}

export interface Snapshot {
  id: number;
  item_id: number;
  captured_at: string;
  metrics: ItemMetrics;
}

export interface SnapshotsPage {
  snapshots: Snapshot[];
}

export interface CollectRun {
  run_id: number;
  source_id: number | null;
  source_key: string | null;
  status: "pending" | "running" | "succeeded" | "partial" | "failed";
  trigger: "scheduler" | "manual";
  started_at: string | null;
  finished_at: string | null;
  items_fetched: number;
  items_new: number;
  items_updated: number;
  item_limit: number | null;
  error_summary: {
    errors?: unknown[];
    counts?: Record<string, number>;
    reason?: string;
    detected_after_minutes?: number;
  } | null;
}

export interface CollectStatus {
  runs: CollectRun[];
  active: CollectRun[];
}
