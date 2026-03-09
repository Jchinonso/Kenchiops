import { AlertCircle, FileSearch, FileText, MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { sectionContainerVariants, itemVariants, scaleInVariants } from "@/lib/animations";

const points = [
  {
    number: "01",
    title: "CI Failure Detected",
    description:
      "Kenchi monitors your GitHub Actions, CircleCI, or any CI provider and catches failures the moment they happen.",
    icon: <AlertCircle className="w-6 h-6" />,
  },
  {
    number: "02",
    title: "Log Analysis",
    description:
      "Logs are chunked, extracted, and analyzed using a multi-model AI pipeline for maximum accuracy.",
    icon: <FileSearch className="w-6 h-6" />,
  },
  {
    number: "03",
    title: "Root Cause Report",
    description:
      "A confidence-scored diagnosis with factor breakdown, suggested fix, and links to similar past failures.",
    icon: <FileText className="w-6 h-6" />,
  },
  {
    number: "04",
    title: "PR Comment & Slack Alert",
    description:
      "Results posted directly to your pull request and Slack channel — no context-switching needed.",
    icon: <MessageSquare className="w-6 h-6" />,
  },
] as const;

const IntegrationPoints = () => (
  <section
    id="how-it-works"
    aria-label="How Kenchi works"
    className="py-24 bg-zinc-100/50 dark:bg-zinc-900/50"
  >
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
          How It Works
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-900 dark:text-zinc-100 mb-5"
        >
          From Failure to Fix in Minutes
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500 max-w-2xl mx-auto">
          Not hours — minutes. Here&apos;s how.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionContainerVariants}
      >
        {points.map((point) => (
          <motion.div
            key={point.number}
            variants={itemVariants}
            className="relative bg-white/60 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl p-8 hover:border-amber-500/20 transition-all duration-300 group"
          >
            {/* Number */}
            <motion.div
              variants={scaleInVariants}
              className="absolute -top-4 -left-2 w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center text-zinc-950 font-mono font-bold text-sm shadow-lg shadow-amber-500/20"
            >
              {point.number}
            </motion.div>

            {/* Icon */}
            <div className="w-14 h-14 bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-300/40 dark:border-zinc-700/40 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-400 mb-6 group-hover:text-amber-400 group-hover:border-amber-500/30 transition-all duration-300">
              {point.icon}
            </div>

            {/* Content */}
            <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-zinc-100 mb-3">
              {point.title}
            </h3>
            <p className="text-zinc-500 text-sm leading-relaxed">{point.description}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default IntegrationPoints;
