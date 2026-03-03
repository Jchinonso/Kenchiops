import type { TeamUsageGaugeProps } from "./types";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { UPGRADE_THRESHOLD } from "./constants";

export const TeamUsageGauge = ({ current, limit }: TeamUsageGaugeProps) => {
  // Unlimited plan -- no gauge needed
  if (limit === null || limit === 0) {
    return null;
  }

  const percent = Math.min(Math.round((current / limit) * 100), 100);
  const atLimit = current >= limit;
  const nearLimit = percent >= UPGRADE_THRESHOLD;

  const barColor = atLimit
    ? "[&>[data-slot=progress-indicator]]:bg-red-500"
    : nearLimit
      ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
      : "[&>[data-slot=progress-indicator]]:bg-indigo-500";

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Team Members</span>
        <span
          className={cn(
            "text-sm font-semibold",
            atLimit
              ? "text-red-600 dark:text-red-400"
              : nearLimit
                ? "text-amber-600 dark:text-amber-400"
                : "text-zinc-600 dark:text-zinc-400"
          )}
        >
          {current} / {limit}
        </span>
      </div>
      <Progress value={percent} className={cn("h-2", barColor)} />
      {nearLimit && (
        <div className="mt-3 flex items-center justify-between">
          <p
            className={cn(
              "text-xs",
              atLimit ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
            )}
          >
            {atLimit
              ? "You've reached the member limit for your plan."
              : `${percent}% of your member limit used.`}
          </p>
          <Link
            to="/dashboard/settings/plan"
            className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            Upgrade
          </Link>
        </div>
      )}
    </div>
  );
};
