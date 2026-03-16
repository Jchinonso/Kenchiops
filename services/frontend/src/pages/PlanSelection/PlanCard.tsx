import { useCallback } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatPeriod } from "./helpers";
import { PLAN_FEATURES, ENTERPRISE_MAILTO } from "./constants";
import type { PlanCardProps } from "./types";

export const PlanCard = ({ plan, isCurrent, isChanging, onSelect }: PlanCardProps) => {
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
        "relative bg-white dark:bg-zinc-800 rounded-2xl p-6 shadow-sm transition-shadow hover:shadow-lg flex flex-col",
        isCurrent
          ? "ring-2 ring-indigo-500 shadow-lg"
          : isHighlighted
            ? "ring-2 ring-indigo-300 dark:ring-indigo-700"
            : "border border-zinc-200 dark:border-zinc-700"
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
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          {plan.displayName}
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {formatPrice(plan.priceMonthlyCents)}
          </span>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">/ {formatPeriod(plan)}</span>
        </div>
      </div>

      <ul className="space-y-2.5 mb-6 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <div className="w-full text-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 cursor-default">
          Current Plan
        </div>
      ) : isEnterprise ? (
        <a
          href={ENTERPRISE_MAILTO}
          className="block w-full text-center px-5 py-2.5 rounded-lg text-sm font-semibold bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 transition-colors"
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
              ? "bg-zinc-100 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed"
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
