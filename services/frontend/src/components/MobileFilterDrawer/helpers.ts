import type { FilterValues } from "@/components/FilterBar";

/** Count non-empty filter values to show on the badge. */
export const countActiveFilters = (filters: FilterValues): number => {
  // let: incrementally counting truthy filter values
  let count = 0; // let: accumulator for conditional increments
  if (filters.repository) {
    count += 1;
  }
  if (filters.severity) {
    count += 1;
  }
  if (filters.minConfidence) {
    count += 1;
  }
  if (filters.timeRange) {
    count += 1;
  }
  if (filters.source) {
    count += 1;
  }
  if (filters.status) {
    count += 1;
  }
  return count;
};
