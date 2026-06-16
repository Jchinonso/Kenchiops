/**
 * Onboarding Step 2 — Features.
 *
 * Three feature preview cards with tiny mockups so users get a sense
 * of what they'll see in the product. Animations stagger via parent
 * containerVariants.
 */

import { motion } from "motion/react";
import { Zap, Shield, BarChart3, ArrowRight, ArrowLeft } from "lucide-react";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";
import { FeaturePreviewCard } from "./FeaturePreviewCard";

interface FeaturesStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const AnalysisMockup = () => (
  <div className="rounded-md bg-zinc-900 dark:bg-zinc-950 p-2.5 text-[10px] font-mono space-y-1">
    <div className="flex items-center gap-1.5 mb-2">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
    </div>
    <p className="text-red-400">ERROR: build failed at step 3/7</p>
    <p className="text-zinc-500">analyzing root cause…</p>
    <p className="text-green-400">dependency conflict: react@19 vs next@14</p>
  </div>
);

const TRIAGE_ITEMS = [
  {
    label: "Critical",
    priority: "P0",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200/50 dark:border-red-800/30",
    text: "text-red-700 dark:text-red-300",
    dot: "bg-red-500",
    priorityText: "text-red-500/70",
  },
  {
    label: "Warning",
    priority: "P1",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200/50 dark:border-amber-800/30",
    text: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
    priorityText: "text-amber-500/70",
  },
  {
    label: "Resolved",
    priority: "—",
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-200/50 dark:border-green-800/30",
    text: "text-green-700 dark:text-green-300",
    dot: "bg-green-500",
    priorityText: "text-green-500/70",
  },
] as const;

const TriageMockup = () => (
  <div className="space-y-1.5">
    {TRIAGE_ITEMS.map((item) => (
      <div
        key={item.label}
        className={`flex items-center gap-2 px-2 py-1 rounded ${item.bg} border ${item.border}`}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
        <span className={`text-[10px] font-medium ${item.text}`}>{item.label}</span>
        <span className={`text-[10px] ${item.priorityText} ml-auto`}>{item.priority}</span>
      </div>
    ))}
  </div>
);

const BAR_HEIGHTS = [40, 65, 35, 80, 55, 70, 45, 90, 60, 50] as const;

const DashboardMockup = () => (
  <div className="flex items-end gap-1 h-12 px-1">
    {BAR_HEIGHTS.map((height, index) => (
      <motion.div
        key={`bar-${String(index)}`}
        className="flex-1 rounded-t-sm bg-indigo-500/70 dark:bg-indigo-400/60"
        initial={{ height: "0%" }}
        animate={{ height: `${String(height)}%` }}
        transition={{ delay: 0.3 + index * 0.05, type: "spring", stiffness: 200, damping: 20 }}
      />
    ))}
  </div>
);

export const FeaturesStep = ({ onNext, onBack }: FeaturesStepProps) => (
  <motion.div variants={containerVariants} initial="hidden" animate="visible">
    <motion.h2
      variants={itemVariants}
      className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 text-center mb-2"
    >
      What you&apos;ll get
    </motion.h2>
    <motion.p
      variants={itemVariants}
      className="text-sm text-zinc-600 dark:text-zinc-400 text-center mb-6"
    >
      Kenchi starts working the moment your first pipeline runs.
    </motion.p>

    <div className="space-y-3">
      <FeaturePreviewCard
        icon={<Zap className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
        title="AI failure analysis"
        description="Root-cause diagnosis on every CI/CD failure — no log spelunking."
        mockup={<AnalysisMockup />}
        accentColor="bg-amber-500"
      />
      <FeaturePreviewCard
        icon={<Shield className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
        title="Incident triage"
        description="Dedup alerts, score severity, correlate across pipelines."
        mockup={<TriageMockup />}
        accentColor="bg-indigo-500"
      />
      <FeaturePreviewCard
        icon={<BarChart3 className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
        title="Failure dashboard"
        description="Trends, flaky tests, and team recovery time at a glance."
        mockup={<DashboardMockup />}
        accentColor="bg-violet-500"
      />
    </div>

    <motion.div variants={itemVariants} className="flex items-center justify-between mt-8">
      <motion.button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-md transition-colors"
        whileTap={{ scale: 0.97 }}
        transition={microSpring}
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Back
      </motion.button>
      <motion.button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 dark:focus-visible:ring-offset-zinc-950 transition-colors shadow-md shadow-indigo-500/20"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={microSpring}
      >
        Continue
        <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </motion.button>
    </motion.div>
  </motion.div>
);
