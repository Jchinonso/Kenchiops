/**
 * Bulk action bar shown above the table when documents are selected.
 */

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { BulkActionBarProps } from "./types";

export const BulkActionBar = ({
  selectionCount,
  allOnPageSelected,
  isBulkDeleting,
  onDeleteSelected,
  onSelectAllOnPage,
  onClearSelection,
}: BulkActionBarProps) => (
  <div className="flex items-center gap-3 px-4 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50">
    <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
      {selectionCount} selected
    </span>
    <Button
      size="sm"
      variant="destructive"
      className="h-7 text-xs"
      onClick={onDeleteSelected}
      disabled={isBulkDeleting}
    >
      <Trash2 className="w-3 h-3 mr-1" />
      Delete Selected
    </Button>
    {!allOnPageSelected && (
      <button
        type="button"
        onClick={onSelectAllOnPage}
        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        Select All on Page
      </button>
    )}
    <button
      type="button"
      onClick={onClearSelection}
      className="text-xs text-zinc-500 dark:text-zinc-400 hover:underline"
    >
      Clear Selection
    </button>
  </div>
);
