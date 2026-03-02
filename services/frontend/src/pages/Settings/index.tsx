/**
 * Settings Page — Redesigned with visual hierarchy, grouped sections,
 * sidebar navigation, and staggered entrance animations.
 *
 * Layout: Profile Hero → Sidebar Nav + Grouped Content → Danger Zone
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Users, Shield, Scale, Headphones, UserCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { useTheme } from "@/hooks/useTheme";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useDeletionImpact } from "@/hooks/useDeletionImpact";
import { useSubscription, useSubscriptionUsage } from "@/hooks/useSubscription";
import { useBillingStatus, useBillingPortal } from "@/hooks/useBilling";
import { useActiveSection } from "@/hooks/useActiveSection";
import { apiClient } from "@/lib/apiClient";
import { containerVariants, itemVariants } from "@/lib/animations";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FeatureGate } from "@/components/FeatureGate";
import { ProfileHero } from "./ProfileHero";
import { SettingsNav } from "./SettingsNav";
import { ThemeSelector } from "./ThemeSelector";
import { NotificationSettings } from "./NotificationSettings";
import { SubscriptionCard } from "./SubscriptionCard";
import { BillingCard } from "./BillingCard";
import { DangerZone } from "./DangerZone";
import { SECTION_IDS } from "./constants";

/** Check if browser notification permission has been denied */
const isBrowserNotificationDenied = (): boolean => {
  if (typeof Notification === "undefined") {
    return false;
  }
  return Notification.permission === "denied";
};

/** Section header — small uppercase muted label */
const SectionHeader = ({ title }: { readonly title: string }) => (
  <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-4">
    {title}
  </h2>
);

export const Settings = () => {
  const { user } = useAuth();
  const { data: tenant, isLoading: tenantLoading } = useTenantInfo();
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription();
  const { data: usageData, isLoading: usageLoading } = useSubscriptionUsage();
  const { preference, setTheme } = useTheme();
  const { toastEnabled, browserEnabled, setToastEnabled, setBrowserEnabled } =
    useNotificationPreferences();
  const { data: billingStatus, isLoading: billingLoading } = useBillingStatus();
  const { openPortal, isLoading: portalLoading } = useBillingPortal();
  const { impact, isLoading: impactLoading, error: impactError, fetchImpact } = useDeletionImpact();

  const planId = useMemo(() => subscription?.plan?.id ?? "free", [subscription]);
  const planDisplayName = useMemo(() => subscription?.plan?.displayName ?? "Free", [subscription]);
  const isSubLoading = subscriptionLoading || usageLoading;

  const isPersonal = user?.tenantType === "personal";
  const loginProvider = user?.organizations.find((org) => org.isSelected)?.provider ?? "github";
  const providerDisplayName = loginProvider === "github" ? "GitHub" : "GitLab";
  const activeSection = useActiveSection(SECTION_IDS);

  // Handle Stripe Checkout redirect URL params
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const billingParam = searchParams.get("billing");
    if (billingParam === "success") {
      toast.success("Billing setup complete! Your subscription is now active.");
      setSearchParams({}, { replace: true });
    } else if (billingParam === "canceled") {
      toast.info("Checkout was canceled. No changes were made.");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const browserPermissionDenied = isBrowserNotificationDenied();
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const response = await apiClient("/auth/me", {
        method: "DELETE",
        body: { confirmation: "DELETE" },
      });
      if (response.ok) {
        // Skip POST /auth/logout — tokens are cascade-deleted with the user.
        // Redirect immediately to prevent in-flight 401s from triggering
        // concurrent refresh attempts and multiple page reloads.
        sessionStorage.setItem("kenchi_logged_out", "1");
        window.location.assign("/login");
        return;
      }
      toast.error("Failed to delete account. Please try again later.");
    } catch {
      toast.error("Failed to delete account. Please try again later.");
    } finally {
      setDeleteLoading(false);
    }
  }, []);

  return (
    <motion.div
      className="max-w-4xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Profile Hero */}
      <section id="profile">
        <ProfileHero
          user={user as Parameters<typeof ProfileHero>[0]["user"]}
          tenant={tenant}
          tenantLoading={tenantLoading}
        />
      </section>

      {/* Settings Body: Sidebar + Content */}
      <div className="mt-8 lg:grid lg:grid-cols-[200px_1fr] lg:gap-8">
        <SettingsNav activeSection={activeSection} isPersonal={isPersonal} />

        <div className="space-y-10">
          {/* Account — hidden for personal tenants */}
          {!isPersonal && (
            <section id="account">
              <SectionHeader title="Account" />
              <div className="space-y-4">
                {/* Team Management */}
                <motion.div variants={itemVariants}>
                  <Card>
                    <CardHeader className="border-b">
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-500" />
                        <CardTitle>Team Management</CardTitle>
                      </div>
                      <CardDescription>
                        View and manage organization members and roles.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Members join automatically when they sign in via {providerDisplayName} and
                          belong to your organization.
                        </p>
                        <Link
                          to="/dashboard/settings/team"
                          className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors whitespace-nowrap ml-4"
                        >
                          Manage Team
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                {/* Subscription */}
                <SubscriptionCard
                  planId={planId}
                  planDisplayName={planDisplayName}
                  usageData={usageData ?? null}
                  isLoading={isSubLoading}
                />

                {/* Billing */}
                {billingStatus?.hasStripeCustomer && (
                  <BillingCard
                    billingStatus={billingStatus}
                    isLoading={billingLoading}
                    portalLoading={portalLoading}
                    onOpenPortal={openPortal}
                  />
                )}
              </div>
            </section>
          )}

          {/* Personal Account notice — shown only for personal tenants */}
          {isPersonal && (
            <section id="personal-plan">
              <SectionHeader title="Plan" />
              <motion.div variants={itemVariants}>
                <Card>
                  <CardHeader className="border-b">
                    <div className="flex items-center gap-2">
                      <UserCircle className="w-5 h-5 text-indigo-500" />
                      <CardTitle>Personal Account</CardTitle>
                    </div>
                    <CardDescription>Your personal workspace is always free.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Personal accounts include unlimited access for individual use. To manage
                      teams, billing, and subscriptions, switch to an organization.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </section>
          )}

          {/* Preferences */}
          <section id="preferences">
            <SectionHeader title="Preferences" />
            <div className="space-y-4">
              <ThemeSelector preference={preference} onSetTheme={setTheme} />
              <NotificationSettings
                toastEnabled={toastEnabled}
                browserEnabled={browserEnabled}
                browserPermissionDenied={browserPermissionDenied}
                onToastChange={setToastEnabled}
                onBrowserChange={(checked) => {
                  void setBrowserEnabled(checked);
                }}
              />
            </div>
          </section>

          {/* Security & Access */}
          <section id="security">
            <SectionHeader title="Security & Access" />
            <div className="space-y-4">
              <FeatureGate feature="ssoSaml">
                <motion.div variants={itemVariants}>
                  <Card>
                    <CardHeader className="border-b">
                      <div className="flex items-center gap-2">
                        <Shield className="w-5 h-5 text-indigo-500" />
                        <CardTitle>SSO / SAML</CardTitle>
                      </div>
                      <CardDescription>
                        Configure single sign-on with your identity provider.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        SSO/SAML configuration will be available here. Connect your identity
                        provider to enable single sign-on for your organization.
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              </FeatureGate>

              <FeatureGate feature="customRules">
                <motion.div variants={itemVariants}>
                  <Card>
                    <CardHeader className="border-b">
                      <div className="flex items-center gap-2">
                        <Scale className="w-5 h-5 text-indigo-500" />
                        <CardTitle>Custom Rules</CardTitle>
                      </div>
                      <CardDescription>
                        Configure custom risk assessment rules for your CI pipelines.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Create and manage custom risk rules to tailor analysis to your workflows.
                        </p>
                        <Link
                          to="/dashboard/risk-rules"
                          className="text-xs font-medium text-indigo-500 hover:text-indigo-600 transition-colors whitespace-nowrap ml-4"
                        >
                          Manage Rules
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </FeatureGate>

              <FeatureGate feature="prioritySupport">
                <motion.div variants={itemVariants}>
                  <Card>
                    <CardHeader className="border-b">
                      <div className="flex items-center gap-2">
                        <Headphones className="w-5 h-5 text-indigo-500" />
                        <CardTitle>Priority Support</CardTitle>
                      </div>
                      <CardDescription>
                        Get priority support with faster response times.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Your plan includes priority support. Contact us at{" "}
                        <a
                          href="mailto:support@kenchi.dev"
                          className="text-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                          support@kenchi.dev
                        </a>{" "}
                        for expedited assistance.
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              </FeatureGate>
            </div>
          </section>

          {/* Danger Zone */}
          <section id="danger">
            <Separator className="mb-8" />
            <DangerZone
              impact={impact}
              impactLoading={impactLoading}
              impactError={impactError}
              onDeleteAccount={handleDeleteAccount}
              deleteLoading={deleteLoading}
              fetchImpact={fetchImpact}
            />
          </section>
        </div>
      </div>
    </motion.div>
  );
};
