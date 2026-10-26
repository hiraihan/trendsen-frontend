import { request, withApiKey } from "./client";

/**
 * Credential provisioning is write-only: values travel in the POST body and are never
 * returned. The status view reports a boolean per declared key and requires the admin
 * key — the readiness map is operational information (ADR-0006, amended), and the 401
 * from this call is what lets Setup verify a key before the first write.
 */
export interface CredentialStatus {
  source_key: string;
  name: string;
  collector_key: string;
  required_keys: string[];
  keys: Record<string, boolean>;
}

export async function getCredentialStatus(adminKey: string): Promise<{
  sources: CredentialStatus[];
}> {
  return request<{ sources: CredentialStatus[] }>(
    "/sources/credentials",
    withApiKey(adminKey),
  );
}

export interface ProvisionResult {
  source_key: string;
  configured_keys: string[];
  is_active: boolean;
}

export async function postSourceCredentials(
  sourceKey: string,
  credentials: Record<string, string>,
  activate: boolean,
  adminKey: string,
): Promise<ProvisionResult> {
  return request(
    `/sources/${encodeURIComponent(sourceKey)}/credentials`,
    withApiKey(adminKey, {
      method: "POST",
      body: JSON.stringify({ credentials, activate }),
    }),
  );
}
