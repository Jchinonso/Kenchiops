import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const DEFAULT_PAGE_SIZE_OPTIONS: readonly number[] = [10, 20, 50];

interface PaginationControlsProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly totalItems?: number;
  readonly pageSize?: number;
  readonly onPageSizeChange?: (size: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

export const PaginationControls = ({
  currentPage,
  totalPages,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  totalItems,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationControlsProps) => {
  const rangeLabel =
    totalItems !== undefined && pageSize !== undefined
      ? `${(currentPage - 1) * pageSize + 1}\u2013${Math.min(currentPage * pageSize, totalItems)} of ${totalItems}`
      : `Page ${currentPage} of ${totalPages}`;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between px-4 py-3 border-t dark:border-zinc-800"
    >
      <div className="flex items-center gap-3">
        {onPageSizeChange && pageSize !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Show</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="w-[68px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{rangeLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Go to previous page"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Go to next page"
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};
