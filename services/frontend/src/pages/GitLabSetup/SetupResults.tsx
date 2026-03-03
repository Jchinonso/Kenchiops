import { CheckCircle2, XCircle, Loader2, RotateCcw, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SetupResultsProps } from "./types";

export const SetupResults = ({
  results,
  onRetryFailed,
  onContinue,
  isRetrying,
}: SetupResultsProps) => {
  const successCount = results.filter((result) => result.success).length;
  const failedResults = results.filter((result) => !result.success);
  const allSucceeded = failedResults.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {allSucceeded ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <XCircle className="w-5 h-5 text-amber-500" />
        )}
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {allSucceeded
            ? `All ${String(successCount)} projects enabled successfully`
            : `${String(successCount)} of ${String(results.length)} projects enabled`}
        </p>
      </div>

      <div className="space-y-2">
        {results.map((result) => (
          <div
            key={result.projectId}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
              result.success
                ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
            )}
          >
            {result.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{result.projectName}</span>
            {result.error && (
              <span className="text-xs ml-auto shrink-0 opacity-75">
                {result.error.length > 60 ? `${result.error.slice(0, 60)}...` : result.error}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        {failedResults.length > 0 && (
          <Button variant="outline" size="sm" onClick={onRetryFailed} disabled={isRetrying}>
            {isRetrying ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2" />
            )}
            Retry Failed
          </Button>
        )}
        <Button onClick={onContinue} size="sm">
          Continue to Dashboard
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
};
