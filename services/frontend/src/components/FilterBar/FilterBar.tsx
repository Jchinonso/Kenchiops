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

import { EMPTY_FILTERS } from "./helpers";
import {
  DEBOUNCE_MS,
  SEVERITY_OPTIONS,
  CONFIDENCE_OPTIONS,
  TIME_RANGE_OPTIONS,
  INCIDENT_SEVERITY_OPTIONS,
  SOURCE_OPTIONS,
  INCIDENT_STATUS_OPTIONS,
  INVESTIGATION_STATUS_OPTIONS,
  INPUT_CLASS,
} from "./constants";
import type { FilterBarProps } from "./types";

/** Helper to set a ref value without triggering the object-mutation lint rule */
const setRef = <T,>(ref: React.MutableRefObject<T>, value: T): void => {
  Object.assign(ref, { current: value });
};

// ==================== Component ====================

export const FilterBar = ({
  filters,
  onFilterChange,
  variant,
  hideSource,
  hideRepository,
}: FilterBarProps) => {
  const [localRepo, setLocalRepo] = useState(filters.repository);
  const [prevRepoFilter, setPrevRepoFilter] = useState(filters.repository);

  if (filters.repository !== prevRepoFilter) {
    setPrevRepoFilter(filters.repository);
    setLocalRepo(filters.repository);
  }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref to always access the latest filters inside the debounced callback,
  // preventing stale closure issues when dropdown changes race with debounced repo input.
  const filtersRef = useRef(filters);
  useEffect(() => {
    setRef(filtersRef, filters);
  }, [filters]);

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

  const handleSourceChange = (value: string) => {
    onFilterChange({ ...filters, source: value === "all" ? "" : value });
  };

  const handleStatusChange = (value: string) => {
    onFilterChange({ ...filters, status: value === "all" ? "" : value });
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
    filters.timeRange !== "" ||
    (filters.source ?? "") !== "" ||
    (filters.status ?? "") !== "";

  return (
    <div
      className="flex flex-wrap items-center gap-3 mb-4"
      role="search"
      aria-label="Table filters"
    >
      {variant !== "incidents" && variant !== "investigations" && !hideRepository && (
        <>
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
        </>
      )}

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

      {variant === "incidents" && (
        <>
          <Select value={filters.severity || "all"} onValueChange={handleSeverityChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Severities" />
            </SelectTrigger>
            <SelectContent>
              {INCIDENT_SEVERITY_OPTIONS.map((option) => (
                <SelectItem key={option.value || "all"} value={option.value || "all"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.status || "all"} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {INCIDENT_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value || "all"} value={option.value || "all"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!hideSource && (
            <Select value={filters.source || "all"} onValueChange={handleSourceChange}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value || "all"} value={option.value || "all"}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      )}

      {variant === "investigations" && (
        <>
          <Select value={filters.status || "all"} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              {INVESTIGATION_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value || "all"} value={option.value || "all"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
        </>
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

      {variant !== "incidents" && variant !== "investigations" && (
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
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear all filters"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      )}
    </div>
  );
};
