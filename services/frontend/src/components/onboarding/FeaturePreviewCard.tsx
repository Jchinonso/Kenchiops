/**
 * Feature preview card with a mini mockup visual for the onboarding features step.
 * Each card shows a tiny representation of what the feature looks like in practice.
 */

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { itemVariants } from "@/lib/animations";

interface FeaturePreviewCardProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly mockup: ReactNode;
  readonly accentColor: string;
}

export const FeaturePreviewCard = ({
  icon,
  title,
  description,
  mockup,
  accentColor,
}: FeaturePreviewCardProps) => (
  <motion.div
    variants={itemVariants}
    whileHover={{ y: -3 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 backdrop-blur-sm overflow-hidden"
  >
    {/* Mini mockup area */}
    <div
      className={cn(
        "px-4 pt-4 pb-3 bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700/50"
      )}
    >
      {mockup}
    </div>

    {/* Content */}
    <div className="p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", accentColor)}>
          {icon}
        </div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  </motion.div>
);
