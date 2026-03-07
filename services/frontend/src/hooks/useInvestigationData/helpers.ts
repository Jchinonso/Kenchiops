// Inlined from @kenchi/shared — frontend Docker build context does not include shared package
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates that an ID is a UUID to prevent path traversal via crafted IDs */
export const isValidUuid = (value: string): boolean => uuidPattern.test(value);

export const isActiveStatus = (status: string): boolean =>
  status === "queued" ||
  status === "gathering" ||
  status === "parsing" ||
  status === "correlating" ||
  status === "analyzing" ||
  status === "diagnosing";

/**
 * Polling config for active investigations. SSE push handles real-time
 * updates, so this is a safety-net fallback in case the SSE connection
 * is temporarily lost. The long interval avoids the previous 3s x 200
 * burst pattern that generated up to 200 requests per investigation.
 */
export const INVESTIGATION_POLLING_CONFIG = {
  fallbackIntervalMs: 30_000,
} as const;

export const buildInvestigationsUrl = (limit: number, offset: number, status?: string): string => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (status) {
    params.set("status", status);
  }
  return `/api/v1/investigations?${params.toString()}`;
};
