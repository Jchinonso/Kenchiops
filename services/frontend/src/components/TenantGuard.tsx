/**
 * Tenant Guard Route Wrapper
 *
 * Protects dashboard routes based on tenant subscription status:
 *   - "suspended"  -> renders a full SuspendedPage, blocking all access
 *   - "past_due"   -> renders a PastDueBanner above children
 *   - all others   -> renders children normally
 *
 * Uses useSubscription() to read the current tenant's subscription status.
 */

import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, ShieldX } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// ==================== Types ====================

interface TenantGuardProps {
  readonly children: React.ReactNode;
}

// ==================== Sub-components ====================

const SuspendedPage = () => (
  <div className="min-h-[60vh] flex items-center justify-center p-4">
    <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-8 text-center">
      <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <ShieldX className="w-7 h-7 text-red-600 dark:text-red-400" />
      </div>

      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Account Suspended</h1>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Your organization's account has been suspended due to a billing issue. Please update your
        payment method to restore access.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
        <Link
          to="/dashboard/settings/plan"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors shadow-lg shadow-indigo-500/25"
        >
          <CreditCard className="w-4 h-4" />
          Update Billing
        </Link>
        <a
          href="mailto:support@kenchi.dev"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          Contact Support
        </a>
      </div>
    </div>
  </div>
);

const PastDueBanner = () => (
  <Alert
    className={cn(
      "mb-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50",
      "[&>svg]:text-amber-600 dark:[&>svg]:text-amber-400"
    )}
  >
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle className="text-amber-800 dark:text-amber-200">Payment past due</AlertTitle>
    <AlertDescription className="text-amber-700 dark:text-amber-300">
      <p>
        Your subscription payment is overdue. Please{" "}
        <Link
          to="/dashboard/settings/plan"
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          update your billing information
        </Link>{" "}
        to avoid service interruption.
      </p>
    </AlertDescription>
  </Alert>
);

// ==================== Component ====================

export const TenantGuard = ({ children }: TenantGuardProps) => {
  const { data: subscription, isLoading } = useSubscription();

  // While loading, render children to avoid layout shift
  if (isLoading || !subscription) {
    return <>{children}</>;
  }

  const { status } = subscription.subscription;

  if (status === "suspended") {
    return <SuspendedPage />;
  }

  if (status === "past_due") {
    return (
      <>
        <PastDueBanner />
        {children}
      </>
    );
  }

  return <>{children}</>;
};
