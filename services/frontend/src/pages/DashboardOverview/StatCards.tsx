/**
 * Quick stats grid for the DashboardOverview page.
 */

import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw } from "lucide-react";
import { titleCase } from "@/lib/formatters";
import type { StatCardsProps } from "./types";

export const StatCards = ({
  quickStats,
  statsLoading,
  statsError,
  isNewUser,
  refetchStats,
}: StatCardsProps) => {
  if (statsError && !isNewUser) {
    return (
      <Card className="mb-6 sm:mb-8">
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-sm text-red-600 dark:text-red-400">{statsError}</p>
          <button
            type="button"
            onClick={refetchStats}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
      {quickStats.map((stat, statIndex) => (
        <Link
          key={stat.title}
          to={stat.href}
          className="block group opacity-0 animate-fade-in"
          style={{ animationDelay: `${statIndex * 60}ms` }}
        >
          <Card className="py-4 sm:py-5 h-full group-hover:border-indigo-300 dark:group-hover:border-indigo-700 group-hover:shadow-lg group-hover:-translate-y-1 group-active:scale-[0.98] transition-all duration-300">
            <CardContent className="px-4 sm:px-6 h-full">
              <div className="flex items-start justify-between gap-3 h-full">
                <div className="min-w-0">
                  <p
                    className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mb-1 truncate"
                    title={stat.title}
                  >
                    {stat.title}
                  </p>
                  {statsLoading ? (
                    <Skeleton className="h-7 w-12 mt-1" />
                  ) : (
                    <>
                      <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {stat.value}
                      </p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {stat.subtitle}
                      </p>
                      {stat.sourceBreakdown && stat.sourceBreakdown.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {stat.sourceBreakdown.map((entry) => (
                            <span
                              key={entry.source}
                              className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
                            >
                              {titleCase(entry.source)} {entry.activeCount}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 ${stat.colorClass} rounded-full flex items-center justify-center flex-shrink-0`}
                >
                  {stat.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
};
