/**
 * Feature Locked Card
 *
 * Shown when plan usage limits are exceeded. Displays a centered card
 * with exceeded-limit details and upgrade CTA. Replaces page content
 * entirely (no blur overlay).
 *
 * Uses Kenchi's amber/gold brand palette with glass morphism styling,
 * matching the FeatureGate fallback for visual consistency.
 */

import { Link } from "react-router-dom";
import { Lock, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsageLimitDTO } from "@/hooks/useSubscription";
import type { ExceededLimit } from "./types";
import { extractExceededLimits } from "./helpers";

// ==================== Types ====================

interface FeatureLockedProps {
  readonly title?: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly usage?: {
    readonly repositories: UsageLimitDTO;
    readonly analysesThisMonth: UsageLimitDTO;
    readonly integrations: UsageLimitDTO;
    readonly teamMembers: UsageLimitDTO;
  };
  readonly children?: React.ReactNode;
}

// ==================== Sub-components ====================

interface LimitPillProps {
  readonly exceeded: ExceededLimit;
}

const LimitPill = ({ exceeded }: LimitPillProps) => (
  <div
    className={cn(
      "flex items-center justify-between gap-4 px-4 py-2.5 rounded-lg",
      "bg-red-950/40 border border-red-500/20"
    )}
  >
    <span className="text-xs font-medium text-red-200">{exceeded.label}</span>
    <span className="text-xs font-bold tabular-nums text-red-400">
      {exceeded.current}/{exceeded.limit}
    </span>
  </div>
);

// ==================== Component ====================

export const FeatureLocked = ({
  title = "Plan Limit Reached",
  description = "You have reached your plan's usage limits. Upgrade to continue using this feature.",
  actionLabel = "Upgrade Plan",
  actionHref = "/dashboard/settings/plan",
  usage,
}: FeatureLockedProps) => {
  const exceededLimits = extractExceededLimits(usage);

  return (
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

          <h2 className="text-lg font-bold text-zinc-100 mb-2 tracking-tight">{title}</h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{description}</p>

          {/* Exceeded limits detail */}
          {exceededLimits.length > 0 && (
            <div className="space-y-2 mb-6">
              {exceededLimits.map((exceeded) => (
                <LimitPill key={exceeded.label} exceeded={exceeded} />
              ))}
            </div>
          )}

          <Link
            to={actionHref}
            className={cn(
              "group inline-flex items-center gap-2 w-full justify-center",
              "px-6 py-3 text-sm font-semibold rounded-xl",
              "text-zinc-950 transition-all duration-200",
              "bg-amber-500 hover:bg-amber-400",
              "shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30"
            )}
          >
            <Zap className="w-4 h-4" />
            {actionLabel}
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};
