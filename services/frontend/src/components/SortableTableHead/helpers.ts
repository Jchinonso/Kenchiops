import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface SortConfig {
  readonly column: string;
  readonly direction: "asc" | "desc" | null;
}

export const cycleSortDirection = (current: "asc" | "desc" | null): "asc" | "desc" | null =>
  current === null ? "asc" : current === "asc" ? "desc" : null;

export const SORT_ICON: Readonly<Record<string, typeof ArrowUpDown>> = {
  asc: ArrowUp,
  desc: ArrowDown,
};

export const ARIA_SORT: Readonly<Record<string, "ascending" | "descending">> = {
  asc: "ascending",
  desc: "descending",
};
