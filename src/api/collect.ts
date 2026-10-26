import { request, withApiKey } from "./client";
import type { CollectStatus } from "./types";

export async function getCollectStatus(): Promise<CollectStatus> {
  return request<CollectStatus>("/collect/status");
}

export interface TriggerRunBody {
  source_key: string | null;
  limit: number | null;
}

export async function postCollectRun(
  body: TriggerRunBody,
  adminKey: string,
): Promise<{
  runs: { run_id: number; source_key: string | null; status: string }[];
}> {
  return request(
    "/collect/run",
    withApiKey(adminKey, { method: "POST", body: JSON.stringify(body) }),
  );
}
