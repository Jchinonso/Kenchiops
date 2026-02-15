/**
 * Settings Page
 *
 * Shows user profile, organization info, connection statuses,
 * and appearance (dark mode) settings.
 */

import { useAuth } from "@/hooks/useAuth";
import { useTenantInfo } from "@/hooks/useDashboardData";
import { useTheme } from "@/hooks/useTheme";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Building2,
  Github,
  MessageSquare,
  ExternalLink,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
  XCircle,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";

// ==================== Constants ====================

const GITHUB_APP_SLUG = import.meta.env.VITE_GITHUB_APP_SLUG ?? "kenchi-devops";

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

interface ConnectionCardProps {
  readonly name: string;
  readonly icon: React.ReactNode;
  readonly connected: boolean;
  readonly actionLabel: string;
  readonly actionHref: string;
  readonly external?: boolean;
}

const ConnectionCard = ({
  name,
  icon,
  connected,
  actionLabel,
  actionHref,
  external,
}: ConnectionCardProps) => (
  <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {connected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Not connected</span>
            </>
          )}
        </div>
      </div>
    </div>
    {external ? (
      <a
        href={actionHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {actionLabel}
        <ExternalLink className="w-3 h-3" />
      </a>
    ) : (
      <span className="text-xs text-gray-400">Coming soon</span>
    )}
  </div>
);

// ==================== Main Component ====================

export const Settings = () => {
  const { user } = useAuth();
  const { data: tenant, isLoading: tenantLoading } = useTenantInfo();
  const { preference, setTheme } = useTheme();

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
                  {tenant.githubOrg}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    tenant.status === "active"
                      ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                  )}
                >
                  {titleCase(tenant.status)}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tenant ID: <span className="font-mono select-all">{tenant.id}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No organization found.</p>
          )}
        </CardContent>
      </Card>

      {/* Connections */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Github className="w-5 h-5 text-gray-900 dark:text-gray-100" />
            <CardTitle>Connections</CardTitle>
          </div>
          <CardDescription>Manage your service integrations.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-3">
          <ConnectionCard
            name="GitHub"
            icon={<Github className="w-8 h-8 text-gray-900 dark:text-gray-100" />}
            connected={tenant?.githubConnected ?? false}
            actionLabel={tenant?.githubConnected ? "Manage" : "Install"}
            actionHref={`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`}
            external
          />
          <ConnectionCard
            name="Slack"
            icon={<MessageSquare className="w-8 h-8 text-purple-600" />}
            connected={false}
            actionLabel="Connect"
            actionHref="/dashboard/settings"
          />
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
                Email Notifications
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Receive failure alerts and analysis summaries via email.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              Coming Soon
            </Badge>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Slack Notifications
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Get real-time alerts delivered to your Slack channels.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              Coming Soon
            </Badge>
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
            <button
              type="button"
              disabled
              className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-md opacity-50 cursor-not-allowed"
            >
              Delete Account
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
