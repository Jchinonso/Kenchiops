/**
 * Billing & Payment card — Stripe customer info with portal link.
 */

import { motion } from "motion/react";
import { Receipt, ExternalLink, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeDisplay } from "@/components/TimeDisplay";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { itemVariants } from "@/lib/animations";
import { BILLING_STATUS_LABELS, BILLING_BADGE_STYLES, DEFAULT_BADGE_STYLE } from "./constants";

interface BillingCardProps {
  readonly billingStatus: {
    readonly status: string;
    readonly currentPeriodEnd: string | null;
  };
  readonly isLoading: boolean;
  readonly portalLoading: boolean;
  readonly onOpenPortal: () => Promise<void>;
}

export const BillingCard = ({
  billingStatus,
  isLoading,
  portalLoading,
  onOpenPortal,
}: BillingCardProps) => {
  const { status } = billingStatus;
  const statusLabel = BILLING_STATUS_LABELS[status] ?? `Status: ${titleCase(status)}`;
  const badgeStyle = BILLING_BADGE_STYLES[status] ?? DEFAULT_BADGE_STYLE;

  return (
    <motion.div variants={itemVariants}>
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-500" />
            <CardTitle>Billing & Payment</CardTitle>
          </div>
          <CardDescription>
            Manage your payment method, invoices, and billing details.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Payment Status
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{statusLabel}</p>
                  {billingStatus.currentPeriodEnd && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                      Current period ends: <TimeDisplay dateTime={billingStatus.currentPeriodEnd} />
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={cn("text-xs", badgeStyle)}>
                  {titleCase(status)}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => {
                  void onOpenPortal();
                }}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors disabled:opacity-50"
              >
                {portalLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Manage Billing
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
