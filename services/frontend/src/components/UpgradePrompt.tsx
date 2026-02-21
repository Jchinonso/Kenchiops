/**
 * Upgrade Prompt Dialog
 *
 * Reusable dialog shown when a plan limit is reached.
 * Displays current usage vs limit and offers a path to upgrade.
 */

import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ==================== Types ====================

interface UpgradePromptProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly limitKey: string;
  readonly currentUsage: number;
  readonly limit: number;
  readonly currentPlan: string;
}

// ==================== Helpers ====================

const LIMIT_LABELS: Readonly<Record<string, string>> = {
  max_repositories: "repositories",
  max_analyses_monthly: "monthly analyses",
  max_integrations: "integrations",
  max_team_members: "team members",
  maxRepositories: "repositories",
  maxAnalysesMonthly: "monthly analyses",
  maxIntegrations: "integrations",
  maxTeamMembers: "team members",
};

const getLimitLabel = (limitKey: string): string =>
  LIMIT_LABELS[limitKey] ?? limitKey.replace(/_/g, " ");

// ==================== Component ====================

export const UpgradePrompt = ({
  open,
  onOpenChange,
  limitKey,
  currentUsage,
  limit,
  currentPlan,
}: UpgradePromptProps) => {
  const percent = limit > 0 ? Math.min(Math.round((currentUsage / limit) * 100), 100) : 100;
  const limitLabel = getLimitLabel(limitKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <DialogTitle>Plan Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            You&apos;ve reached the {limitLabel} limit on the{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">{currentPlan}</span>{" "}
            plan.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Usage</span>
            <span
              className={cn(
                "text-sm font-semibold",
                currentUsage >= limit
                  ? "text-red-600 dark:text-red-400"
                  : "text-gray-600 dark:text-gray-400"
              )}
            >
              {currentUsage} / {limit} used
            </span>
          </div>
          <Progress
            value={percent}
            className={cn(
              "h-2",
              currentUsage >= limit && "[&>[data-slot=progress-indicator]]:bg-red-500"
            )}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Dismiss
          </button>
          <Link
            to="/dashboard/settings/plan"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/25"
          >
            Upgrade Plan
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
