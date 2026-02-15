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
  <div className="flex items-center justify-between px-4 py-3 border-t">
    <span className="text-sm text-gray-500">
      Page {currentPage} of {totalPages}
    </span>
    <div className="flex items-center gap-2">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
        Prev
      </button>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);
