/**
 * Subscription plan card — current plan display with animated usage bars.
 */

import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageWarning } from "@/components/UsageWarning";
import { cn } from "@/lib/utils";
import { itemVariants } from "@/lib/animations";
import { UsageBar } from "./UsageBar";
import { getPlanBadgeStyle } from "./constants";
import type { UsageLimitDTO } from "@/hooks/useSubscription";

interface UsageData {
  readonly usage: {
    readonly repositories: UsageLimitDTO;
    readonly analysesThisMonth: UsageLimitDTO;
    readonly integrations: UsageLimitDTO;
    readonly teamMembers: UsageLimitDTO;
  };
}

interface SubscriptionCardProps {
  readonly planId: string;
  readonly planDisplayName: string;
  readonly usageData: UsageData | null;
  readonly isLoading: boolean;
}

export const SubscriptionCard = ({
  planId,
  planDisplayName,
  usageData,
  isLoading,
}: SubscriptionCardProps) => (
  <motion.div variants={itemVariants}>
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-indigo-500" />
          <CardTitle>Subscription Plan</CardTitle>
        </div>
        <CardDescription>Your current plan and resource usage.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Current Plan
                </span>
                <Badge variant="outline" className={cn("text-xs", getPlanBadgeStyle(planId))}>
                  {planDisplayName}
                </Badge>
              </div>
              <Link
                to="/dashboard/settings/plan"
                className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
              >
                Manage Plan
              </Link>
            </div>
            {usageData ? (
              <div className="space-y-3">
                <UsageBar label="Repositories" usage={usageData.usage.repositories} />
                <UsageBar label="Analyses This Month" usage={usageData.usage.analysesThisMonth} />
                <UsageBar label="Integrations" usage={usageData.usage.integrations} />
                <UsageBar label="Team Members" usage={usageData.usage.teamMembers} />
                <div className="pt-2 space-y-2">
                  <UsageWarning
                    label="Repositories"
                    current={usageData.usage.repositories.current}
                    limit={usageData.usage.repositories.limit}
                  />
                  <UsageWarning
                    label="Analyses"
                    current={usageData.usage.analysesThisMonth.current}
                    limit={usageData.usage.analysesThisMonth.limit}
                  />
                  <UsageWarning
                    label="Team Members"
                    current={usageData.usage.teamMembers.current}
                    limit={usageData.usage.teamMembers.limit}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Unable to load usage data.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  </motion.div>
);
