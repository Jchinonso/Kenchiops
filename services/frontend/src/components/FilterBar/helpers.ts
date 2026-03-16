export type FilterValues = {
  readonly repository: string;
  readonly severity: string;
  readonly minConfidence: string;
  readonly timeRange: string;
  readonly source?: string;
  readonly status?: string;
};

export const EMPTY_FILTERS: FilterValues = {
  repository: "",
  severity: "",
  minConfidence: "",
  timeRange: "",
  source: "",
  status: "",
};

const FILTER_STORAGE_PREFIX = "kenchi_filters_";

/**
 * Build a tenant-scoped localStorage key for filter persistence.
 * When tenantId is provided, keys are isolated per tenant to prevent cross-tenant leaks.
 */
const buildFilterStorageKey = (pageKey: string, tenantId?: string): string =>
  tenantId
    ? `${FILTER_STORAGE_PREFIX}${tenantId}_${pageKey}`
    : `${FILTER_STORAGE_PREFIX}${pageKey}`;

/**
 * Loads saved filter state from localStorage for a given page key.
 * Returns null if no saved state exists or parsing fails.
 */
export const loadSavedFilters = (
  pageKey: string,
  tenantId?: string
): Partial<FilterValues> | null => {
  try {
    const stored = localStorage.getItem(buildFilterStorageKey(pageKey, tenantId));
    return stored ? (JSON.parse(stored) as Partial<FilterValues>) : null;
  } catch {
    return null;
  }
};

/**
 * Saves filter state to localStorage for a given page key.
 * Silently fails if localStorage is unavailable or full.
 */
export const saveFilters = (pageKey: string, filters: FilterValues, tenantId?: string): void => {
  try {
    localStorage.setItem(buildFilterStorageKey(pageKey, tenantId), JSON.stringify(filters));
  } catch {
    // localStorage quota exceeded or unavailable — non-fatal
  }
};

/** Duration lookup for time range presets (in milliseconds) */
export const TIME_RANGE_DURATIONS: Readonly<Record<string, number>> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

/**
 * Converts a time-range preset string to an ISO timestamp for the `since` query param.
 * Returns undefined for empty/unknown values (meaning "all time").
 */
export const timeRangeToSince = (timeRange: string): string | undefined => {
  const ms = TIME_RANGE_DURATIONS[timeRange];
  return ms !== undefined ? new Date(Date.now() - ms).toISOString() : undefined;
};

/**
 * Parses the confidence filter string into min/max values.
 * Format: "min:0.5,max:0.8" or "min:0.8" or "max:0.5"
 */
export const parseConfidenceFilter = (
  value: string
): { readonly min: number | null; readonly max: number | null } => {
  if (!value) {
    return { min: null, max: null };
  }

  const parts = value.split(",");

  const extractValue = (prefix: string): number | null => {
    const match = parts.find((part) => part.startsWith(`${prefix}:`));
    if (!match) {
      return null;
    }
    const parsed = parseFloat(match.split(":")[1]);
    return Number.isNaN(parsed) ? null : parsed;
  };

  return { min: extractValue("min"), max: extractValue("max") };
};
