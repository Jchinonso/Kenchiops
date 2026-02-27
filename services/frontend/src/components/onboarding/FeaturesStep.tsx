/**
 * Onboarding Step 2 — What You'll Get
 * Animated feature showcase with mini mockup visuals.
 */

import { motion } from "motion/react";
import { Zap, Shield, BarChart3, ArrowRight, ArrowLeft } from "lucide-react";
import { containerVariants, itemVariants, microSpring } from "@/lib/animations";
import { FeaturePreviewCard } from "./FeaturePreviewCard";

interface FeaturesStepProps {
  readonly onNext: () => void;
  readonly onBack: () => void;
}

/** Mini terminal mockup for AI Analysis feature */
const AnalysisMockup = () => (
  <div className="rounded-md bg-gray-900 dark:bg-gray-950 p-2.5 text-[10px] font-mono space-y-1">
    <div className="flex items-center gap-1.5 mb-2">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
    </div>
    <p className="text-red-400">ERROR: Build failed at step 3/7</p>
    <p className="text-gray-500">Analyzing root cause...</p>
    <p className="text-green-400">✓ Dependency conflict: react@19 + next@14</p>
  </div>
);

/** Mini severity badges for Incident Triage feature */
const TriageMockup = () => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-red-50 dark:bg-red-950/30 border border-red-200/50 dark:border-red-800/30">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
      <span className="text-[10px] font-medium text-red-700 dark:text-red-300">Critical</span>
      <span className="text-[10px] text-red-500/70 ml-auto">P0</span>
    </div>
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30">
      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">Warning</span>
      <span className="text-[10px] text-amber-500/70 ml-auto">P1</span>
    </div>
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-green-50 dark:bg-green-950/30 border border-green-200/50 dark:border-green-800/30">
      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
      <span className="text-[10px] font-medium text-green-700 dark:text-green-300">Resolved</span>
      <span className="text-[10px] text-green-500/70 ml-auto">-</span>
    </div>
  </div>
);

/** Mini chart for Dashboard feature */
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
      className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2"
    >
      What you&apos;ll get
    </motion.h2>
    <motion.p
      variants={itemVariants}
      className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6"
    >
      Kenchi starts working the moment you connect.
    </motion.p>

    <div className="space-y-3">
      <FeaturePreviewCard
        icon={<Zap className="w-3.5 h-3.5 text-white" />}
        title="AI Failure Analysis"
        description="Automatic root cause diagnosis for every CI/CD failure. No more digging through logs."
        mockup={<AnalysisMockup />}
        accentColor="bg-amber-500"
      />
      <FeaturePreviewCard
        icon={<Shield className="w-3.5 h-3.5 text-white" />}
        title="Incident Triage"
        description="Alert deduplication, severity scoring, and correlation across your pipelines."
        mockup={<TriageMockup />}
        accentColor="bg-indigo-500"
      />
      <FeaturePreviewCard
        icon={<BarChart3 className="w-3.5 h-3.5 text-white" />}
        title="Failure Dashboard"
        description="Track failure trends, flaky tests, and team recovery time at a glance."
        mockup={<DashboardMockup />}
        accentColor="bg-violet-500"
      />
    </div>

    {/* Navigation */}
    <motion.div variants={itemVariants} className="flex items-center justify-between mt-8">
      <motion.button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        whileTap={{ scale: 0.97 }}
        transition={microSpring}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </motion.button>
      <motion.button
        type="button"
        onClick={onNext}
        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600 transition-colors shadow-md shadow-indigo-500/20"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={microSpring}
      >
        Continue
        <ArrowRight className="w-4 h-4" />
      </motion.button>
    </motion.div>
  </motion.div>
);
