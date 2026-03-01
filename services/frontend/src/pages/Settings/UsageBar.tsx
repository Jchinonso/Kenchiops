/**
 * Usage bar showing current/limit with progress indicator.
 */

import type { UsageLimitDTO } from "@/hooks/useSubscription";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface UsageBarProps {
  readonly label: string;
  readonly usage: UsageLimitDTO;
}

export const UsageBar = ({ label, usage }: UsageBarProps) => {
  const percent = usage.limited
    ? Math.min(Math.round((usage.current / (usage.limit ?? 1)) * 100), 100)
    : 0;
  const exceeded = usage.limited && usage.limit !== null && usage.current >= usage.limit;
  const displayLimit = usage.limited && usage.limit !== null ? String(usage.limit) : "Unlimited";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
        <span
          className={cn(
            "text-xs font-medium",
            exceeded ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"
          )}
        >
          {usage.current} / {displayLimit}
        </span>
      </div>
      {usage.limited ? (
        <Progress
          value={percent}
          className={cn("h-1.5", exceeded && "[&>[data-slot=progress-indicator]]:bg-red-500")}
        />
      ) : (
        <div className="h-1.5 w-full rounded-full bg-green-100 dark:bg-green-900" />
      )}
    </div>
  );
};
