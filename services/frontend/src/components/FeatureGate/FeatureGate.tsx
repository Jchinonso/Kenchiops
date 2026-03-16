/**
 * Feature Gate Component
 *
 * Conditionally renders children based on whether the current subscription
 * plan includes a given feature. When the feature is not available, renders
 * either a custom fallback or a default upgrade prompt.
 *
 * Feature names correspond to PlanFeaturesDTO keys from the subscription API:
 *   slackIntegration, customRules, teamAnalytics, ssoSaml,
 *   auditLog, apiAccess, prioritySupport
 */

import { Link } from "react-router-dom";
import { Lock, ArrowRight, Zap } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { getFeatureLabel, isFeatureEnabled } from "./helpers";
import type { FeatureGateProps, DefaultUpgradeFallbackProps } from "./types";

// ==================== Default Fallback ====================

const DefaultUpgradeFallback = ({ featureLabel, planName }: DefaultUpgradeFallbackProps) => (
  <div className="flex items-start justify-center py-16">
    <div
      className={cn(
        "relative flex flex-col items-center text-center max-w-sm w-full mx-4",
        "rounded-2xl border border-zinc-700/60 overflow-hidden",
        "bg-zinc-900/80 backdrop-blur-xl",
        "shadow-2xl shadow-black/40"
      )}
    >
      {/* Amber glow top edge */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.5), transparent)",
        }}
      />

      <div className="px-8 pt-10 pb-8 w-full">
        {/* Lock icon with amber glow ring */}
        <div className="relative mx-auto mb-6 w-16 h-16">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%)",
              transform: "scale(2)",
            }}
          />
          <div
            className={cn(
              "relative w-full h-full rounded-full flex items-center justify-center",
              "border border-amber-500/30 bg-amber-500/10"
            )}
          >
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-zinc-100 mb-2 tracking-tight">
          {featureLabel} Unavailable
        </h2>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          {featureLabel} is not included in the {planName} plan. Upgrade to unlock this feature.
        </p>

        <Link
          to="/dashboard/settings/plan"
          className={cn(
            "group inline-flex items-center gap-2 w-full justify-center",
            "px-6 py-3 text-sm font-semibold rounded-xl",
            "text-zinc-950 transition-all duration-200",
            "bg-amber-500 hover:bg-amber-400",
            "shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
          )}
        >
          <Zap className="w-4 h-4" />
          Upgrade Plan
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  </div>
);

// ==================== Component ====================

export const FeatureGate = ({ feature, fallback, children }: FeatureGateProps) => {
  const { data: subscription, isLoading } = useSubscription();

  // While loading, render nothing to avoid flicker
  if (isLoading) {
    return null;
  }

  // No subscription data or missing plan — default to showing children (fail open for display)
  if (!subscription?.plan) {
    return <>{children}</>;
  }

  const enabled = isFeatureEnabled(subscription.plan, feature);

  if (enabled) {
    return <>{children}</>;
  }

  // Feature not enabled — show fallback or default upgrade prompt
  return (
    <>
      {fallback ?? (
        <DefaultUpgradeFallback
          featureLabel={getFeatureLabel(feature)}
          planName={subscription.plan.displayName}
        />
      )}
    </>
  );
};
