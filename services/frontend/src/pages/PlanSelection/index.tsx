/**
 * Plan Selection Page
 *
 * Displays all available plans in a grid with feature lists.
 * Highlights the current plan and allows changing to a different one.
 */

import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { usePlans, useSubscription, useChangePlan } from "@/hooks/useSubscription";
import { useCreateCheckout, useBillingStatus } from "@/hooks/useBilling";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { PlanCard } from "./PlanCard";

// ==================== Constants ====================

const SKELETON_KEYS = ["skel-0", "skel-1", "skel-2", "skel-3"] as const;

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

  const currentPlanId = useMemo(() => subscription?.plan?.id ?? "free", [subscription]);
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
          // Defense-in-depth: validate the checkout URL uses HTTPS before navigating.
          // The URL comes from our API but we verify protocol to prevent open redirect.
          try {
            const { protocol } = new URL(checkout.url);
            if (protocol !== "https:") {
              toast.error("Invalid checkout URL. Please try again.");
              return;
            }
          } catch {
            toast.error("Invalid checkout URL. Please try again.");
            return;
          }
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
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          Choose Your Plan
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Select the plan that best fits your team. Upgrade or downgrade anytime.
        </p>
      </div>

      {isLoading ? (
        <div className="grid lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
          {SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="bg-white dark:bg-zinc-800 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-700"
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
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
