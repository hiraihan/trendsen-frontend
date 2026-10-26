/**
 * The thumbnail contract between the API's `metadata` blob and the item card.
 *
 * Extracted, never fabricated: only an https URL the backend's own extraction wrote
 * (`metadata.thumbnail_url`, see backend/src/trendsentinel/collectors/thumbnail.py)
 * is returned. Anything else — missing key, non-string, non-https, data:/blob:
 * smuggled through stored data — is `null`, and the card renders its placeholder.
 */

export const THUMBNAIL_KEY = "thumbnail_url";

export function thumbnailUrlOf(
  metadata: Record<string, unknown>,
): string | null {
  const value = metadata[THUMBNAIL_KEY];
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || !parsed.hostname) return null;
  } catch {
    return null;
  }
  return candidate;
}
