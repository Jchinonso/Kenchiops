/**
 * MobileFilterDrawer
 *
 * On mobile: renders a "Filters" trigger button that opens a bottom Drawer
 * containing the FilterBar in a vertical layout.
 * On desktop: renders the FilterBar inline as a passthrough.
 */

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { FilterBar } from "@/components/FilterBar";
import type { FilterValues } from "@/components/FilterBarUtils";

interface MobileFilterDrawerProps {
  readonly filters: FilterValues;
  readonly onFilterChange: (filters: FilterValues) => void;
  readonly variant: "analyses" | "failures" | "incidents" | "investigations";
  readonly hideSource?: boolean;
  readonly hideRepository?: boolean;
}

/** Count non-empty filter values to show on the badge. */
const countActiveFilters = (filters: FilterValues): number => {
  // let: incrementally counting truthy filter values
  let count = 0;
  if (filters.repository) {count += 1;}
  if (filters.severity) {count += 1;}
  if (filters.minConfidence) {count += 1;}
  if (filters.timeRange) {count += 1;}
  if (filters.source) {count += 1;}
  if (filters.status) {count += 1;}
  return count;
};

export const MobileFilterDrawer = ({
  filters,
  onFilterChange,
  variant,
  hideSource,
  hideRepository,
}: MobileFilterDrawerProps) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <FilterBar
        filters={filters}
        onFilterChange={onFilterChange}
        variant={variant}
        hideSource={hideSource}
        hideRepository={hideRepository}
      />
    );
  }

  const activeCount = countActiveFilters(filters);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filters
        {activeCount > 0 && (
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs min-w-[20px] text-center">
            {activeCount}
          </Badge>
        )}
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <DrawerTitle>Filters</DrawerTitle>
              <DrawerClose className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 min-h-[44px] min-w-[44px] flex items-center justify-center">
                Done
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="p-4">
            <FilterBar
              filters={filters}
              onFilterChange={onFilterChange}
              variant={variant}
              hideSource={hideSource}
              hideRepository={hideRepository}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};
