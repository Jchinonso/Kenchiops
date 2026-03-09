import type { ReactNode } from "react";
import { Zap, Target, Clock, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import {
  sectionContainerVariants,
  itemVariants,
  scaleInVariants,
  microSpring,
} from "@/lib/animations";

interface StatItem {
  readonly value: string;
  readonly label: string;
  readonly sublabel?: string;
  readonly icon: ReactNode;
}

const stats: readonly StatItem[] = [
  {
    value: "70%",
    label: "Faster Failure Resolution",
    icon: <Zap className="w-5 h-5" />,
  },
  {
    value: "10K+",
    label: "CI Failures Analyzed",
    icon: <Target className="w-5 h-5" />,
  },
  {
    value: "<2min",
    label: "Average Analysis Time",
    icon: <Clock className="w-5 h-5" />,
  },
  {
    value: "95%",
    label: "Root Cause Accuracy",
    sublabel: "Confidence-scored diagnostics",
    icon: <TrendingUp className="w-5 h-5" />,
  },
];

const Stats = () => (
  <section
    id="stats"
    aria-label="Platform statistics"
    className="relative py-24 bg-white dark:bg-zinc-950"
  >
    {/* Subtle horizontal line accents */}
    <div className="absolute inset-x-0 top-0 section-divider" />
    <div className="absolute inset-x-0 bottom-0 section-divider" />

    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <motion.div
        className="text-center mb-16"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={sectionContainerVariants}
      >
        <motion.span
          variants={itemVariants}
          className="text-amber-500 text-sm font-mono font-medium uppercase tracking-widest mb-4 block"
        >
          By the Numbers
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-900 dark:text-zinc-100"
        >
          How Kenchi Transforms Your CI/CD Workflow
        </motion.h2>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionContainerVariants}
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.value}
            variants={itemVariants}
            whileHover={{ y: -3, transition: microSpring }}
            className="text-center group"
          >
            <motion.div
              variants={scaleInVariants}
              className="inline-flex items-center justify-center w-14 h-14 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-amber-500 mb-5 group-hover:border-amber-500/30 group-hover:shadow-glow-amber transition-all duration-300"
            >
              {stat.icon}
            </motion.div>
            <div className="text-4xl sm:text-5xl font-display font-extrabold text-zinc-900 dark:text-zinc-100 mb-2 tracking-tight">
              {stat.value}
            </div>
            <div className="text-zinc-700 dark:text-zinc-300 font-medium text-sm mb-1">
              {stat.label}
            </div>
            {stat.sublabel && (
              <div className="text-xs text-zinc-400 dark:text-zinc-600">{stat.sublabel}</div>
            )}
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default Stats;
