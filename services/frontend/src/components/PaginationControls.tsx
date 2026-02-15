import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}

export const PaginationControls = ({
  currentPage,
  totalPages,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: PaginationControlsProps) => (
  <nav
    aria-label="Pagination"
    className="flex items-center justify-between px-4 py-3 border-t dark:border-gray-800"
  >
    <span className="text-sm text-gray-500 dark:text-gray-400">
      Page {currentPage} of {totalPages}
    </span>
    <div className="flex items-center gap-2">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Go to previous page"
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
        Prev
      </button>
      <button
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Go to next page"
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </nav>
);
