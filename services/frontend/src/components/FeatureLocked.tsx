/**
 * Feature Locked Overlay
 *
 * Full-page overlay shown when plan limits are exceeded. Blurs the page
 * content behind it and displays an animated lock card with exceeded-limit
 * details and upgrade CTA.
 *
 * Uses Kenchi's amber/gold brand palette with glass morphism styling.
 */

import { Link } from "react-router-dom";
import { Lock, ArrowRight, Zap } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { UsageLimitDTO } from "@/hooks/useSubscription";

// ==================== Types ====================

interface ExceededLimit {
  readonly label: string;
  readonly current: number;
  readonly limit: number;
}

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
  readonly children: React.ReactNode;
}

// ==================== Helpers ====================

const LIMIT_LABELS: Readonly<Record<string, string>> = {
  repositories: "Repositories",
  analysesThisMonth: "Monthly Analyses",
  integrations: "Integrations",
  teamMembers: "Team Members",
};

const extractExceededLimits = (usage: FeatureLockedProps["usage"]): readonly ExceededLimit[] => {
  if (!usage) {
    return [];
  }
  return Object.entries(usage)
    .filter(
      ([, detail]) => detail.limited && detail.limit !== null && detail.current >= detail.limit
    )
    .map(([key, detail]) => ({
      label: LIMIT_LABELS[key] ?? key,
      current: detail.current,
      limit: detail.limit ?? 0,
    }));
};

// ==================== Sub-components ====================

interface LimitPillProps {
  readonly exceeded: ExceededLimit;
  readonly index: number;
}

const LimitPill = ({ exceeded, index }: LimitPillProps) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.5 + index * 0.1, duration: 0.4, ease: "easeOut" }}
    className={cn(
      "flex items-center justify-between gap-4 px-4 py-2.5 rounded-lg",
      "bg-red-950/40 border border-red-500/20"
    )}
  >
    <span className="text-xs font-medium text-red-200">{exceeded.label}</span>
    <span className="text-xs font-bold tabular-nums text-red-400">
      {exceeded.current}/{exceeded.limit}
    </span>
  </motion.div>
);

// ==================== Component ====================

export const FeatureLocked = ({
  title = "Plan Limit Reached",
  description = "You have reached your plan's usage limits. Upgrade to continue using this feature.",
  actionLabel = "Upgrade Plan",
  actionHref = "/dashboard/settings/plan",
  usage,
  children,
}: FeatureLockedProps) => {
  const exceededLimits = extractExceededLimits(usage);

  return (
    <div className="relative min-h-[60vh]">
      {/* Blurred background content */}
      <div
        className="pointer-events-none select-none blur-[6px] opacity-30 saturate-50"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay with radial gradient vignette */}
      <div
        className="absolute inset-0 z-10 flex items-start justify-center pt-[12vh]"
        style={{
          background:
            "radial-gradient(ellipse at center 30%, transparent 0%, hsl(240 6% 4% / 0.6) 70%)",
        }}
      >
        {/* Glass card */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
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
              background:
                "linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.5), transparent)",
            }}
          />

          {/* Content */}
          <div className="px-8 pt-10 pb-8 w-full">
            {/* Animated lock icon with amber glow ring */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}
              className="relative mx-auto mb-6 w-16 h-16"
            >
              {/* Outer glow */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, transparent 70%)",
                  transform: "scale(2)",
                }}
              />
              {/* Ring */}
              <div
                className={cn(
                  "relative w-full h-full rounded-full flex items-center justify-center",
                  "border border-amber-500/30 bg-amber-500/10"
                )}
              >
                <Lock className="w-7 h-7 text-amber-400" />
              </div>
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="text-lg font-bold text-zinc-100 mb-2 tracking-tight"
            >
              {title}
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="text-sm text-zinc-400 mb-6 leading-relaxed"
            >
              {description}
            </motion.p>

            {/* Exceeded limits detail */}
            {exceededLimits.length > 0 && (
              <div className="space-y-2 mb-6">
                {exceededLimits.map((exceeded, index) => (
                  <LimitPill key={exceeded.label} exceeded={exceeded} index={index} />
                ))}
              </div>
            )}

            {/* CTA button */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
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
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
