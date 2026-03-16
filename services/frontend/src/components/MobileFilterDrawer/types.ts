import type { FilterValues } from "@/components/FilterBar";

export interface MobileFilterDrawerProps {
  readonly filters: FilterValues;
  readonly onFilterChange: (filters: FilterValues) => void;
  readonly variant: "analyses" | "failures" | "incidents" | "investigations";
  readonly hideSource?: boolean;
  readonly hideRepository?: boolean;
}
