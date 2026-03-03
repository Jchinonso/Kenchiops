import { TableRow, TableCell } from "@/components/ui/table";
import type { ExpandedAnalysisRowProps } from "./types";

export const ExpandedAnalysisRow = ({ analysis, onViewDetails }: ExpandedAnalysisRowProps) => {
  const hasActions = analysis.recommendedActions !== null && analysis.recommendedActions.length > 0;
  const hasCause = analysis.identifiedCause !== null && analysis.identifiedCause.length > 0;

  return (
    <TableRow className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
      <TableCell colSpan={6} className="bg-zinc-50 dark:bg-zinc-800/50 border-b p-0 max-w-0">
        <div className="p-4 space-y-3">
          {hasCause && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Root Cause
              </h4>
              <p className="text-sm text-zinc-900 dark:text-zinc-100 break-words whitespace-pre-wrap">
                {analysis.identifiedCause}
              </p>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
              Recommended Actions
            </h4>
            {hasActions ? (
              <ol className="list-decimal list-inside space-y-1">
                {(analysis.recommendedActions ?? []).map((action) => (
                  <li key={action} className="text-sm text-zinc-900 dark:text-zinc-100 break-words">
                    {action}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">No recommended actions.</p>
            )}
          </div>

          <div>
            <button
              type="button"
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
              onClick={(event) => {
                event.stopPropagation();
                onViewDetails();
              }}
            >
              View Full Details &rarr;
            </button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};
