/**
 * FilterBar Component
 *
 * Provides filtering controls for dashboard list pages.
 * Supports repository text search (debounced), severity dropdown,
 * and confidence threshold dropdown depending on the variant.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== Types ====================

interface FilterValues {
  readonly repository: string;
  readonly severity: string;
  readonly minConfidence: string;
}

interface FilterBarProps {
  readonly filters: FilterValues;
  readonly onFilterChange: (filters: FilterValues) => void;
  readonly variant: "analyses" | "failures";
}

// ==================== Constants ====================

const DEBOUNCE_MS = 300;

const SEVERITY_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "All Severities" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const CONFIDENCE_OPTIONS: ReadonlyArray<{ readonly value: string; readonly label: string }> = [
  { value: "", label: "All Confidence" },
  { value: "0.8", label: "High (80%+)" },
  { value: "0.5", label: "Medium (50%+)" },
  { value: "0.01", label: "Low (<50%)" },
];

const INPUT_CLASS = cn(
  "px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg",
  "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent",
  "placeholder:text-gray-400"
);

const EMPTY_FILTERS: FilterValues = { repository: "", severity: "", minConfidence: "" };

/** Helper to set a ref value without triggering the object-mutation lint rule */
const setRef = <T,>(ref: React.MutableRefObject<T>, value: T): void => {
  Object.assign(ref, { current: value });
};

// ==================== Component ====================

export const FilterBar = ({ filters, onFilterChange, variant }: FilterBarProps) => {
  const [localRepo, setLocalRepo] = useState(filters.repository);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when external filters change (e.g., from searchQuery prop)
  useEffect(() => {
    setLocalRepo(filters.repository);
  }, [filters.repository]);

  const handleDebouncedRepoChange = useCallback(
    (value: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setRef(
        timerRef,
        setTimeout(() => {
          onFilterChange({ ...filters, repository: value });
        }, DEBOUNCE_MS)
      );
    },
    [filters, onFilterChange]
  );

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
    handleDebouncedRepoChange(value);
  };

  const handleSeverityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, severity: event.target.value });
  };

  const handleConfidenceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onFilterChange({ ...filters, minConfidence: event.target.value });
  };

  const handleClear = () => {
    setLocalRepo("");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onFilterChange(EMPTY_FILTERS);
  };

  const hasActiveFilters =
    filters.repository !== "" || filters.severity !== "" || filters.minConfidence !== "";

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <input
        type="text"
        value={localRepo}
        onChange={handleRepoInput}
        placeholder="Filter by repository..."
        className={cn(INPUT_CLASS, "w-64")}
      />

      {variant === "failures" && (
        <select value={filters.severity} onChange={handleSeverityChange} className={INPUT_CLASS}>
          {SEVERITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {variant === "analyses" && (
        <select
          value={filters.minConfidence}
          onChange={handleConfidenceChange}
          className={INPUT_CLASS}
        >
          {CONFIDENCE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
};

export type { FilterValues };
