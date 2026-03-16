/**
 * Sortable Table Head — reusable column header with sort indicator.
 *
 * Shared across CICDAnalyses, CICDFailures, and WebhookActivity pages.
 */

import { ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { SORT_ICON, ARIA_SORT } from "./helpers";
import type { SortableTableHeadProps } from "./types";

// Re-export shared types and helpers for convenience
export { type SortConfig, cycleSortDirection } from "./helpers";

// ==================== Component ====================

export const SortableTableHead = ({
  label,
  column,
  currentSort,
  onSort,
}: SortableTableHeadProps) => {
  const { column: sortColumn, direction: sortDirection } = currentSort;
  const isActive = sortColumn === column && sortDirection !== null;
  const Icon = (isActive && sortDirection ? SORT_ICON[sortDirection] : null) ?? ArrowUpDown;
  const ariaSortValue = (isActive && sortDirection ? ARIA_SORT[sortDirection] : null) ?? "none";

  return (
    <TableHead
      scope="col"
      aria-sort={ariaSortValue}
      className="cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-indigo-500" : "text-zinc-400")} />
      </div>
    </TableHead>
  );
};
