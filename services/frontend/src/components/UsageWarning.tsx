/**
 * Usage Warning Component
 *
 * Tiered display of subscription usage warnings. Severity escalates
 * based on percentage of limit consumed:
 *   - 100%+  : error alert (destructive)
 *   - 95-99% : warning alert (amber)
 *   - 90-94% : info alert (blue)
 *   - 75-89% : subtle badge only
 *   - <75%   : nothing rendered
 */

import { Link } from "react-router-dom";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ==================== Types ====================

interface UsageWarningProps {
  readonly label: string;
  readonly current: number;
  readonly limit: number | null;
  readonly showUpgradeLink?: boolean;
}

// ==================== Helpers ====================

const THRESHOLD_ERROR = 100;
const THRESHOLD_WARNING = 95;
const THRESHOLD_INFO = 90;
const THRESHOLD_BADGE = 75;

const computePercent = (current: number, limit: number): number =>
  limit > 0 ? Math.min(Math.round((current / limit) * 100), 100) : 0;

// ==================== Component ====================

export const UsageWarning = ({
  label,
  current,
  limit,
  showUpgradeLink = true,
}: UsageWarningProps) => {
  // Unlimited plan — no warning needed
  if (limit === null || limit === 0) {
    return null;
  }

  const percent = computePercent(current, limit);

  // Below threshold — nothing to show
  if (percent < THRESHOLD_BADGE) {
    return null;
  }

  const upgradeLink = showUpgradeLink ? (
    <Link
      to="/dashboard/settings/plan"
      className="text-sm font-medium underline underline-offset-2 hover:no-underline"
    >
      Upgrade plan
    </Link>
  ) : null;

  // 100%+ — error alert
  if (percent >= THRESHOLD_ERROR) {
    return (
      <Alert
        className={cn(
          "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50",
          "[&>svg]:text-red-600 dark:[&>svg]:text-red-400"
        )}
      >
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle className="text-red-800 dark:text-red-200">{label} limit reached</AlertTitle>
        <AlertDescription className="text-red-700 dark:text-red-300">
          <p>
            You have used {current} of {limit} {label.toLowerCase()}. Upgrade your plan to continue.
          </p>
          {upgradeLink}
        </AlertDescription>
      </Alert>
    );
  }

  // 95-99% — warning alert
  if (percent >= THRESHOLD_WARNING) {
    return (
      <Alert
        className={cn(
          "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50",
          "[&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
        )}
      >
        <AlertCircle className="h-4 w-4" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">
          {label} almost at limit
        </AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          <p>
            {current} of {limit} {label.toLowerCase()} used ({percent}%).
          </p>
          {upgradeLink}
        </AlertDescription>
      </Alert>
    );
  }

  // 90-94% — info alert
  if (percent >= THRESHOLD_INFO) {
    return (
      <Alert
        className={cn(
          "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50",
          "[&>svg]:text-blue-600 dark:[&>svg]:text-blue-400"
        )}
      >
        <Info className="h-4 w-4" />
        <AlertTitle className="text-blue-800 dark:text-blue-200">{label} usage is high</AlertTitle>
        <AlertDescription className="text-blue-700 dark:text-blue-300">
          <p>
            {current} of {limit} {label.toLowerCase()} used ({percent}%).
          </p>
          {upgradeLink}
        </AlertDescription>
      </Alert>
    );
  }

  // 75-89% — subtle badge + progress bar
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {current} / {limit}
          </span>
        </div>
        <Progress
          value={percent}
          className="h-1.5 [&>[data-slot=progress-indicator]]:bg-amber-400 dark:[&>[data-slot=progress-indicator]]:bg-amber-500"
        />
      </div>
      <Badge
        variant="outline"
        className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50"
      >
        {percent}%
      </Badge>
    </div>
  );
};
