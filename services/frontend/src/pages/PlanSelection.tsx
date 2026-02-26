/**
 * Plan Selection Page
 *
 * Displays all available plans in a grid with feature lists.
 * Highlights the current plan and allows changing to a different one.
 */

import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlans, useSubscription, useChangePlan, type PlanDTO } from "@/hooks/useSubscription";
import { useCreateCheckout, useBillingStatus } from "@/hooks/useBilling";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradePrompt } from "@/components/UpgradePrompt";

// ==================== Constants ====================

const PLAN_FEATURES: Readonly<Record<string, readonly string[]>> = {
  free: [
    "Up to 3 repositories",
    "50 analyses per month",
    "1 integration",
    "GitHub PR comments",
    "Community support",
  ],
  pro: [
    "Everything in Free",
    "Unlimited repositories",
    "Unlimited analyses",
    "Up to 5 integrations",
    "Up to 10 team members",
    "Slack integration",
    "Custom analysis rules",
    "Priority support",
  ],
  team: [
    "Everything in Pro",
    "Up to 50 team members",
    "Unlimited integrations",
    "Audit log",
    "Advanced team analytics",
    "API access",
  ],
  enterprise: [
    "Everything in Team",
    "Unlimited team members",
    "SSO / SAML authentication",
    "Dedicated support engineer",
    "Self-hosted deployment option",
    "Custom integrations",
  ],
};

const ENTERPRISE_MAILTO = "mailto:sales@kenchi.dev?subject=Enterprise%20Pricing";

const formatPrice = (priceCents: number | null): string => {
  if (priceCents === null) {
    return "Custom";
  }
  if (priceCents === 0) {
    return "$0";
  }
  return `$${Math.floor(priceCents / 100)}`;
};

const formatPeriod = (plan: PlanDTO): string => {
  if (plan.priceMonthlyCents === null) {
    return "contact us";
  }
  if (plan.priceMonthlyCents === 0) {
    return "forever";
  }
  const seats = plan.limits.maxTeamMembers;
  return seats !== null ? `per month / ${seats} seats` : "per month";
};

// ==================== Sub-components ====================

interface PlanCardProps {
  readonly plan: PlanDTO;
  readonly isCurrent: boolean;
  readonly isChanging: boolean;
  readonly onSelect: (planId: string) => void;
}

const PlanCard = ({ plan, isCurrent, isChanging, onSelect }: PlanCardProps) => {
  const features = PLAN_FEATURES[plan.id] ?? [];
  const isEnterprise = plan.id === "enterprise";
  const isHighlighted = plan.id === "pro";

  const handleSelect = useCallback(() => {
    if (!isCurrent && !isEnterprise && !isChanging) {
      onSelect(plan.id);
    }
  }, [isCurrent, isEnterprise, isChanging, onSelect, plan.id]);

  return (
    <div
      className={cn(
        "relative bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm transition-shadow hover:shadow-lg flex flex-col",
        isCurrent
          ? "ring-2 ring-indigo-500 shadow-lg"
          : isHighlighted
            ? "ring-2 ring-indigo-300 dark:ring-indigo-700"
            : "border border-gray-200 dark:border-gray-700"
      )}
    >
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-indigo-500 text-white text-xs font-semibold px-3 py-0.5">
            Current Plan
          </Badge>
        </div>
      )}

      <div className="mb-5">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
          {plan.displayName}
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {formatPrice(plan.priceMonthlyCents)}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">/ {formatPeriod(plan)}</span>
        </div>
      </div>

      <ul className="space-y-2.5 mb-6 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="w-full text-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-default">
          Current Plan
        </div>
      ) : isEnterprise ? (
        <a
          href={ENTERPRISE_MAILTO}
          className="block w-full text-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 transition-colors"
        >
          Contact Sales
        </a>
      ) : (
        <button
          type="button"
          onClick={handleSelect}
          disabled={isChanging}
          className={cn(
            "w-full text-center px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors",
            isChanging
              ? "bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
          )}
        >
          {isChanging ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Changing...
            </span>
          ) : (
            "Select Plan"
          )}
        </button>
      )}
    </div>
  );
};

// ==================== Main Component ====================

export const PlanSelection = () => {
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription, isLoading: subLoading, refetch } = useSubscription();
  const { data: billingStatus } = useBillingStatus();
  const {
    changePlan,
    isLoading: isChanging,
    planLimitError,
    isLimitDialogOpen,
    dismissLimitDialog,
  } = useChangePlan();
  const { createCheckout, isLoading: isCheckoutLoading } = useCreateCheckout();

  const currentPlanId = useMemo(() => subscription?.plan.id ?? "free", [subscription]);
  const hasBilling = billingStatus?.hasStripeCustomer ?? false;

  const handleSelectPlan = useCallback(
    async (planId: string) => {
      const targetPlan = plans?.find((plan) => plan.id === planId);
      const isPaidUpgrade =
        targetPlan?.priceMonthlyCents && targetPlan.priceMonthlyCents > 0 && !hasBilling;

      // For paid plan upgrades without existing Stripe customer, redirect to checkout
      if (isPaidUpgrade) {
        const checkout = await createCheckout(planId, "month");
        if (checkout?.url) {
          window.location.assign(checkout.url);
          return;
        }
        toast.error("Failed to start checkout. Please try again.");
        return;
      }

      // For downgrades or plan changes with existing billing, use internal change
      const result = await changePlan(planId);
      if (result) {
        toast.success(`Plan changed to ${result.subscription.planId}`);
        refetch();
      } else {
        toast.error("Failed to change plan. Please try again.");
      }
    },
    [changePlan, createCheckout, plans, hasBilling, refetch]
  );

  const isLoading = plansLoading || subLoading;
  const isBusy = isChanging || isCheckoutLoading;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <Link
          to="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          Choose Your Plan
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Select the plan that best fits your team. Upgrade or downgrade anytime.
        </p>
      </div>

      {isLoading ? (
        <div className="grid lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
            >
              <Skeleton className="h-6 w-20 mb-3" />
              <Skeleton className="h-8 w-24 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <Skeleton className="h-10 w-full mt-6" />
            </div>
          ))}
        </div>
      ) : plans ? (
        <div className="grid lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={plan.id === currentPlanId}
              isChanging={isBusy}
              onSelect={handleSelectPlan}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Unable to load plans. Please try again later.
        </p>
      )}

      {planLimitError && (
        <UpgradePrompt
          open={isLimitDialogOpen}
          onOpenChange={() => dismissLimitDialog()}
          limitKey={planLimitError.limitKey}
          currentUsage={planLimitError.currentUsage}
          limit={planLimitError.limit}
          currentPlan={planLimitError.currentPlan}
        />
      )}
    </div>
  );
};
