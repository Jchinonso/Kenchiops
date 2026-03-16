import type { FilterValues } from "./helpers";

export interface FilterBarProps {
  readonly filters: FilterValues;
  readonly onFilterChange: (filters: FilterValues) => void;
  readonly variant: "analyses" | "failures" | "incidents" | "investigations";
  readonly hideSource?: boolean;
  readonly hideRepository?: boolean;
}
