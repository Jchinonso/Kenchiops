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
import { Lock } from "lucide-react";
import { useSubscription, type PlanDTO } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

// ==================== Types ====================

interface FeatureGateProps {
  readonly feature: string;
  readonly fallback?: React.ReactNode;
  readonly children: React.ReactNode;
}

// ==================== Helpers ====================

const FEATURE_LABELS: Readonly<Record<string, string>> = {
  slackIntegration: "Slack Integration",
  customRules: "Custom Rules",
  teamAnalytics: "Team Analytics",
  ssoSaml: "SSO / SAML",
  auditLog: "Audit Log",
  apiAccess: "API Access",
  prioritySupport: "Priority Support",
};

const getFeatureLabel = (feature: string): string =>
  FEATURE_LABELS[feature] ?? feature.replace(/([A-Z])/g, " $1").trim();

const isFeatureEnabled = (plan: PlanDTO, feature: string): boolean => {
  const features = plan.features as unknown as Readonly<Record<string, unknown>>;
  return features[feature] === true;
};

// ==================== Default Fallback ====================

interface DefaultUpgradeFallbackProps {
  readonly featureLabel: string;
  readonly planName: string;
}

const DefaultUpgradeFallback = ({ featureLabel, planName }: DefaultUpgradeFallbackProps) => (
  <div
    className={cn(
      "rounded-lg border border-dashed border-gray-300 dark:border-gray-700",
      "bg-gray-50 dark:bg-gray-900/50 p-6 text-center"
    )}
  >
    <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
      <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
    </div>
    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
      {featureLabel} is not available on the {planName} plan
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
      Upgrade your plan to unlock this feature.
    </p>
    <Link
      to="/dashboard/settings/plan"
      className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/25"
    >
      Upgrade Plan
    </Link>
  </div>
);

// ==================== Component ====================

export const FeatureGate = ({ feature, fallback, children }: FeatureGateProps) => {
  const { data: subscription, isLoading } = useSubscription();

  // While loading, render nothing to avoid flicker
  if (isLoading) {
    return null;
  }

  // No subscription data — default to showing children (fail open for display)
  if (!subscription) {
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
