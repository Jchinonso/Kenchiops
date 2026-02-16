/**
 * FilterBar Component
 *
 * Provides filtering controls for dashboard list pages.
 * Supports repository text search (debounced), severity dropdown,
 * confidence range dropdown, and time-range preset dropdown
 * depending on the variant.
 *
 * Confidence filter uses "min:X,max:Y" encoding to support range queries
 * (e.g., "min:0.5,max:0.8" for medium, "max:0.5" for low).
 *
 * Filter state can be persisted to localStorage via loadSavedFilters/saveFilters.
 */

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

// ==================== Types ====================

interface FilterValues {
  readonly repository: string;
  readonly severity: string;
  readonly minConfidence: string;
  readonly timeRange: string;
}

interface FilterBarProps {
  readonly filters: FilterValues;
  readonly onFilterChange: (filters: FilterValues) => void;
  readonly variant: "analyses" | "failures";
}

// ==================== Constants ====================

const DEBOUNCE_MS = 300;

const FILTER_STORAGE_PREFIX = "kenchi_filters_";

const SEVERITY_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "All Severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const CONFIDENCE_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "All Confidence" },
  { value: "min:0.8", label: "High (80%+)" },
  { value: "min:0.5,max:0.8", label: "Medium (50-80%)" },
  { value: "max:0.5", label: "Low (<50%)" },
];

const TIME_RANGE_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "All Time" },
  { value: "24h", label: "Last 24 Hours" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

/** Duration lookup for time range presets (in milliseconds) */
const TIME_RANGE_DURATIONS: Readonly<Record<string, number>> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

const INPUT_CLASS = cn(
  "px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg",
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
  "placeholder:text-gray-400 dark:placeholder:text-gray-500 dark:text-gray-100"
);

const EMPTY_FILTERS: FilterValues = {
  repository: "",
  severity: "",
  minConfidence: "",
  timeRange: "",
};

/** Helper to set a ref value without triggering the object-mutation lint rule */
const setRef = <T,>(ref: React.MutableRefObject<T>, value: T): void => {
  Object.assign(ref, { current: value });
};

// ==================== Persistence Helpers ====================

/**
 * Loads saved filter state from localStorage for a given page key.
 * Returns null if no saved state exists or parsing fails.
 */
export const loadSavedFilters = (pageKey: string): Partial<FilterValues> | null => {
  try {
    const stored = localStorage.getItem(`${FILTER_STORAGE_PREFIX}${pageKey}`);
    return stored ? (JSON.parse(stored) as Partial<FilterValues>) : null;
  } catch {
    return null;
  }
};

/**
 * Saves filter state to localStorage for a given page key.
 * Silently fails if localStorage is unavailable or full.
 */
export const saveFilters = (pageKey: string, filters: FilterValues): void => {
  try {
    localStorage.setItem(`${FILTER_STORAGE_PREFIX}${pageKey}`, JSON.stringify(filters));
  } catch {
    // localStorage quota exceeded or unavailable — non-fatal
  }
};

// ==================== Time Range Helper ====================

/**
 * Converts a time-range preset string to an ISO timestamp for the `since` query param.
 * Returns undefined for empty/unknown values (meaning "all time").
 */
export const timeRangeToSince = (timeRange: string): string | undefined => {
  const ms = TIME_RANGE_DURATIONS[timeRange];
  return ms !== undefined ? new Date(Date.now() - ms).toISOString() : undefined;
};

// ==================== Component ====================

export const FilterBar = ({ filters, onFilterChange, variant }: FilterBarProps) => {
  const [localRepo, setLocalRepo] = useState(filters.repository);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref to always access the latest filters inside the debounced callback,
  // preventing stale closure issues when dropdown changes race with debounced repo input.
  const filtersRef = useRef(filters);
  setRef(filtersRef, filters);

  // Sync local state when external filters change (e.g., from searchQuery prop)
  useEffect(() => {
    setLocalRepo(filters.repository);
  }, [filters.repository]);

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const handleRepoInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setLocalRepo(value);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setRef(
      timerRef,
      setTimeout(() => {
        // Read from ref to get latest filters (avoids stale closure)
        onFilterChange({ ...filtersRef.current, repository: value });
      }, DEBOUNCE_MS)
    );
  };

  const handleSeverityChange = (value: string) => {
    onFilterChange({ ...filters, severity: value === "all" ? "" : value });
  };

  const handleConfidenceChange = (value: string) => {
    onFilterChange({ ...filters, minConfidence: value === "all" ? "" : value });
  };

  const handleTimeRangeChange = (value: string) => {
    onFilterChange({ ...filters, timeRange: value === "all" ? "" : value });
  };

  const handleClear = () => {
    setLocalRepo("");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onFilterChange(EMPTY_FILTERS);
  };

  const hasActiveFilters =
    filters.repository !== "" ||
    filters.severity !== "" ||
    filters.minConfidence !== "" ||
    filters.timeRange !== "";

  return (
    <div
      className="flex flex-wrap items-center gap-3 mb-4"
      role="search"
      aria-label="Table filters"
    >
      <label className="sr-only" htmlFor="filter-repository">
        Filter by repository
      </label>
      <input
        id="filter-repository"
        type="text"
        value={localRepo}
        onChange={handleRepoInput}
        placeholder="Filter by repository, e.g. org/repo-name"
        className={cn(INPUT_CLASS, "w-64")}
      />

      {variant === "failures" && (
        <Select value={filters.severity || "all"} onValueChange={handleSeverityChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Severities" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((option) => (
              <SelectItem key={option.value || "all"} value={option.value || "all"}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {variant === "analyses" && (
        <Select value={filters.minConfidence || "all"} onValueChange={handleConfidenceChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Confidence" />
          </SelectTrigger>
          <SelectContent>
            {CONFIDENCE_OPTIONS.map((option) => (
              <SelectItem key={option.value || "all"} value={option.value || "all"}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.timeRange || "all"} onValueChange={handleTimeRangeChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All Time" />
        </SelectTrigger>
        <SelectContent>
          {TIME_RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.value || "all"} value={option.value || "all"}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear all filters"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
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

export type { FilterValues };
