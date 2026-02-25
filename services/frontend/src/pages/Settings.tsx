/**
 * Settings Page
 *
 * Shows user profile, organization info, appearance (theme),
 * notification preferences, and account management (danger zone).
 */

import { useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { useTheme } from "@/hooks/useTheme";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { useDeletionImpact } from "@/hooks/useDeletionImpact";
import { useSubscription, useSubscriptionUsage, type UsageLimitDTO } from "@/hooks/useSubscription";
import { apiClient } from "@/lib/apiClient";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  User,
  Building2,
  Github,
  Sun,
  Moon,
  Monitor,
  Bell,
  AlertTriangle,
  CreditCard,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { Switch } from "@/components/ui/switch";
import { UsageWarning } from "@/components/UsageWarning";

// ==================== Constants ====================

/** Check if browser notification permission has been denied */
const isBrowserNotificationDenied = (): boolean => {
  if (typeof Notification === "undefined") {
    return false;
  }
  const { permission } = Notification;
  return permission === "denied";
};

// ==================== Sub-components ====================

interface ThemeOptionProps {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly active: boolean;
  readonly onClick: () => void;
}

const ThemeOption = ({ label, icon, active, onClick }: ThemeOptionProps) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
      active
        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950"
        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
    )}
  >
    <div
      className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center",
        active
          ? "bg-indigo-500 text-white"
          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
      )}
    >
      {icon}
    </div>
    <span
      className={cn(
        "text-sm font-medium",
        active ? "text-indigo-700 dark:text-indigo-300" : "text-gray-600 dark:text-gray-400"
      )}
    >
      {label}
    </span>
  </button>
);

// ==================== Plan Badge Helpers ====================

const PLAN_BADGE_STYLES: Readonly<Record<string, string>> = {
  free: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800",
  pro: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  team: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  enterprise:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
};

const getPlanBadgeStyle = (planId: string): string =>
  PLAN_BADGE_STYLES[planId] ?? PLAN_BADGE_STYLES.free;

// ==================== Usage Bar ====================

interface UsageBarProps {
  readonly label: string;
  readonly usage: UsageLimitDTO;
}

const UsageBar = ({ label, usage }: UsageBarProps) => {
  const percent = usage.limited
    ? Math.min(Math.round((usage.current / (usage.limit ?? 1)) * 100), 100)
    : 0;
  const exceeded = usage.limited && usage.limit !== null && usage.current >= usage.limit;
  const displayLimit = usage.limited && usage.limit !== null ? String(usage.limit) : "Unlimited";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
        <span
          className={cn(
            "text-xs font-medium",
            exceeded ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
          )}
        >
          {usage.current} / {displayLimit}
        </span>
      </div>
      {usage.limited ? (
        <Progress
          value={percent}
          className={cn("h-1.5", exceeded && "[&>[data-slot=progress-indicator]]:bg-red-500")}
        />
      ) : (
        <div className="h-1.5 w-full rounded-full bg-green-100 dark:bg-green-900" />
      )}
    </div>
  );
};

// ==================== Main Component ====================

const DELETE_CONFIRMATION = "DELETE";

export const Settings = () => {
  const { user, logout } = useAuth();
  const { data: tenant, isLoading: tenantLoading } = useTenantInfo();
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription();
  const { data: usageData, isLoading: usageLoading } = useSubscriptionUsage();
  const { preference, setTheme } = useTheme();
  const { toastEnabled, browserEnabled, setToastEnabled, setBrowserEnabled } =
    useNotificationPreferences();

  const planId = useMemo(() => subscription?.plan.id ?? "free", [subscription]);
  const planDisplayName = useMemo(() => subscription?.plan.displayName ?? "Free", [subscription]);
  const isSubLoading = subscriptionLoading || usageLoading;

  const browserPermissionDenied = isBrowserNotificationDenied();
  const { impact, isLoading: impactLoading, error: impactError, fetchImpact } = useDeletionImpact();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isDeleteConfirmed = deleteConfirmation === DELETE_CONFIRMATION;

  const handleDeleteAccount = useCallback(async () => {
    setDeleteLoading(true);
    try {
      const response = await apiClient("/auth/me", {
        method: "DELETE",
        body: { confirmation: "DELETE" },
      });
      if (response.ok) {
        await logout();
      } else {
        toast.error("Failed to delete account. Please try again later.");
      }
    } catch {
      toast.error("Failed to delete account. Please try again later.");
    } finally {
      setDeleteLoading(false);
    }
  }, [logout]);

  const displayName = user?.displayName ?? "User";
  const displayEmail = user?.email ?? "";
  const userInitials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage your profile, organization, and preferences.
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-500" />
            <CardTitle>Profile</CardTitle>
          </div>
          <CardDescription>Your account information.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={displayName} className="w-14 h-14 rounded-full" />
            ) : (
              <div className="w-14 h-14 bg-indigo-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold text-lg">{userInitials}</span>
              </div>
            )}
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {displayName}
              </p>
              {displayEmail && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{displayEmail}</p>
              )}
              <Badge variant="outline" className="mt-1.5 text-xs">
                {titleCase(user?.role ?? "member")}
              </Badge>
              {user?.createdAt && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Member since <TimeDisplay dateTime={user.createdAt} />
                </p>
              )}
              {user?.providers && user.providers.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  {user.providers.map((providerInfo) => (
                    <Badge key={providerInfo.provider} variant="outline" className="text-xs gap-1">
                      <Github className="w-3 h-3" />
                      {providerInfo.username ?? titleCase(providerInfo.provider)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organization */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            <CardTitle>Organization</CardTitle>
          </div>
          <CardDescription>Your team&apos;s organization details.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {tenantLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : tenant ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {tenant.orgName}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    tenant.status === "active"
                      ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  )}
                >
                  {titleCase(tenant.status)}
                </Badge>
              </div>
              <details className="mt-1">
                <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  Show technical details
                </summary>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Tenant ID: <span className="font-mono select-all">{tenant.id}</span>
                </p>
              </details>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No organization found.</p>
          )}
        </CardContent>
      </Card>

      {/* Team Management */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            <CardTitle>Team Management</CardTitle>
          </div>
          <CardDescription>View and manage organization members and roles.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Members join automatically via GitHub OAuth when they belong to your GitHub
              organization.
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

      {/* Subscription Plan */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-500" />
            <CardTitle>Subscription Plan</CardTitle>
          </div>
          <CardDescription>Your current plan and resource usage.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          {isSubLoading ? (
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
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
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
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Unable to load usage data.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-500" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>Choose your preferred theme.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-3">
            <ThemeOption
              label="Light"
              icon={<Sun className="w-5 h-5" />}
              active={preference === "light"}
              onClick={() => setTheme("light")}
            />
            <ThemeOption
              label="Dark"
              icon={<Moon className="w-5 h-5" />}
              active={preference === "dark"}
              onClick={() => setTheme("dark")}
            />
            <ThemeOption
              label="System"
              icon={<Monitor className="w-5 h-5" />}
              active={preference === "system"}
              onClick={() => setTheme("system")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-500" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>Configure how you receive alerts and updates.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                In-App Toast Notifications
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Show popup alerts when failures are detected or analyses complete.
              </p>
            </div>
            <Switch checked={toastEnabled} onCheckedChange={setToastEnabled} />
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Browser Notifications
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Receive system notifications even when Kenchi is in the background.
              </p>
              {browserEnabled && browserPermissionDenied && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Browser notifications are blocked. Please allow them in your browser settings.
                </p>
              )}
            </div>
            <Switch
              checked={browserEnabled}
              onCheckedChange={(checked) => {
                void setBrowserEnabled(checked);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 dark:border-red-900">
        <CardHeader className="border-b border-red-100 dark:border-red-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <CardTitle className="text-red-700 dark:text-red-400">Danger Zone</CardTitle>
          </div>
          <CardDescription>Irreversible actions for your account.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between p-4 rounded-lg border border-red-200 dark:border-red-900">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Delete Account</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
            </div>
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                setDeleteDialogOpen(open);
                if (open) {
                  void fetchImpact();
                }
                if (!open) {
                  setDeleteConfirmation("");
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >
                  Delete Account
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {impactLoading ? (
                        <p>Checking account impact...</p>
                      ) : impactError ? (
                        <p className="mb-2 text-amber-600 dark:text-amber-400">
                          Could not check account impact. You may still proceed with deletion.
                        </p>
                      ) : impact?.willDeleteTenant ? (
                        <>
                          <p className="mb-2 text-red-600 dark:text-red-400 font-medium">
                            You are the last member of {impact.tenantName ?? "your organization"}.
                          </p>
                          <p className="mb-2">
                            Deleting your account will also permanently delete your organization and
                            all associated data, including CI provider connections
                            {impact.affectedResources.gitlabWebhooks > 0
                              ? `, ${String(impact.affectedResources.gitlabWebhooks)} GitLab webhook${impact.affectedResources.gitlabWebhooks > 1 ? "s" : ""}`
                              : ""}
                            {impact.affectedResources.hasSlackIntegration
                              ? ", Slack integration"
                              : ""}
                            , repository mappings, and analysis history. This cannot be undone.
                          </p>
                        </>
                      ) : (
                        <p className="mb-2">
                          This action cannot be undone. All your data, settings, and linked accounts
                          will be permanently deleted.
                        </p>
                      )}
                      <p>
                        Type <strong className="text-gray-900 dark:text-gray-100">DELETE</strong>{" "}
                        below to confirm.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  placeholder='Type "DELETE" to confirm'
                  className="font-mono"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!isDeleteConfirmed || deleteLoading}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleDeleteAccount();
                    }}
                    className={cn(
                      isDeleteConfirmed && !deleteLoading
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed pointer-events-none"
                    )}
                  >
                    {deleteLoading ? "Deleting..." : "Delete Account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
