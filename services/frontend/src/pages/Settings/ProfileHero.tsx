/**
 * Profile Hero — dominant visual section combining user profile and organization info.
 * Features gradient background, glowing avatar ring, and merged org details.
 */

import { motion } from "motion/react";
import { Github, Gitlab } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeDisplay } from "@/components/TimeDisplay";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { itemVariants } from "@/lib/animations";
import type { ProfileHeroProps } from "./types";

const PROVIDER_CONFIG: Readonly<
  Record<string, { readonly icon: typeof Github; readonly className: string }>
> = {
  github: { icon: Github, className: "text-zinc-800 dark:text-zinc-200" },
  gitlab: { icon: Gitlab, className: "text-orange-500" },
};

export const ProfileHero = ({ user, tenant, tenantLoading }: ProfileHeroProps) => {
  const displayName = user?.displayName ?? "User";
  const displayEmail = user?.email ?? "";
  const userInitials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      variants={itemVariants}
      className="relative overflow-hidden rounded-2xl border border-zinc-200/60 dark:border-zinc-700/40 bg-white dark:bg-zinc-900"
    >
      {/* Gradient background wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.07] via-violet-500/[0.04] to-cyan-500/[0.07] dark:from-indigo-500/[0.12] dark:via-violet-500/[0.08] dark:to-cyan-500/[0.1]" />

      {/* Dot grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="relative px-6 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          {/* Avatar with gradient ring */}
          <div className="relative shrink-0">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 opacity-60 blur-sm" />
            <div className="relative">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="w-20 h-20 rounded-full ring-2 ring-white dark:ring-zinc-900 object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full ring-2 ring-white dark:ring-zinc-900 bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xl">{userInitials}</span>
                </div>
              )}
            </div>
          </div>

          {/* User info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100 truncate">
              {displayName}
            </h1>
            {displayEmail && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                {displayEmail}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <Badge
                variant="outline"
                className="text-xs bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
              >
                {titleCase(user?.role ?? "member")}
              </Badge>
              {user?.providers?.map((providerInfo) => {
                const providerCfg = PROVIDER_CONFIG[providerInfo.provider];
                const ProviderIcon = providerCfg?.icon ?? Github;
                const iconClassName = providerCfg?.className ?? "";
                return (
                  <Badge key={providerInfo.provider} variant="outline" className="text-xs gap-1">
                    <ProviderIcon className={cn("w-3.5 h-3.5", iconClassName)} />
                    {providerInfo.username ?? titleCase(providerInfo.provider)}
                  </Badge>
                );
              })}
            </div>
            {user?.createdAt && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                Member since <TimeDisplay dateTime={user.createdAt} />
              </p>
            )}
          </div>

          {/* Organization info (merged) */}
          <div className="sm:text-right shrink-0">
            {tenantLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-32 sm:ml-auto" />
                <Skeleton className="h-3 w-24 sm:ml-auto" />
              </div>
            ) : tenant ? (
              <>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {tenant.orgName}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs mt-1",
                    tenant.status === "active"
                      ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
                      : "bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700"
                  )}
                >
                  {titleCase(tenant.status)}
                </Badge>
                <details className="mt-1.5">
                  <summary className="text-xs text-zinc-400 dark:text-zinc-500 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
                    Tenant ID
                  </summary>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono select-all">
                    {tenant.id}
                  </p>
                </details>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
