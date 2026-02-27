import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { sectionContainerVariants, heroVariants } from "@/lib/animations";
import { CIAnalysisMockup } from "@/components/CIAnalysisMockup";
import { KenchiLogo } from "./KenchiLogo";

const TRUSTED_BY = ["Vercel", "CircleCI", "Buildkite", "Railway"] as const;

export const LoginShowcase = () => (
  <aside
    className="hidden lg:flex lg:w-[45%] relative overflow-hidden"
    aria-label="Product highlights"
  >
    {/* Atmospheric layers */}
    <div className="absolute inset-0 bg-zinc-100 dark:bg-zinc-950" />
    <div className="absolute inset-0 dot-grid opacity-40" />
    <div className="absolute inset-0 noise-overlay" />

    {/* Ambient orbs */}
    <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-amber-500/[0.08] rounded-full blur-[120px] pointer-events-none" />
    <div className="absolute bottom-[-80px] right-[-80px] w-[350px] h-[350px] bg-violet-500/[0.06] rounded-full blur-[100px] pointer-events-none" />

    {/* Amber edge glow on right border */}
    <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-amber-500/15 dark:via-amber-500/30 to-transparent" />

    {/* Content */}
    <motion.div
      className="relative z-10 flex flex-col justify-between p-10 xl:p-12 w-full"
      variants={sectionContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Logo */}
      <motion.div variants={heroVariants}>
        <Link to="/" className="flex items-center gap-2.5 group" aria-label="Kenchi home">
          <KenchiLogo />
          <span className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Kenchi
          </span>
        </Link>
      </motion.div>

      {/* Hero moment */}
      <div className="space-y-6">
        {/* Badge */}
        <motion.div
          variants={heroVariants}
          className="inline-flex items-center gap-2.5 px-4 py-2 bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-full"
        >
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" aria-hidden="true" />
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            AI-Powered CI/CD Intelligence
          </span>
        </motion.div>

        {/* Headline */}
        <motion.div variants={heroVariants}>
          <h2 className="font-display text-3xl xl:text-4xl font-extrabold text-zinc-900 dark:text-zinc-100 leading-tight mb-3">
            Stop debugging CI failures <span className="gradient-text">manually</span>.
          </h2>
          <p className="text-zinc-600 dark:text-zinc-500 text-base leading-relaxed max-w-sm">
            Kenchi analyzes your pipeline failures in seconds, not hours.
          </p>
        </motion.div>

        {/* CIAnalysisMockup with glow backdrop */}
        <motion.div variants={heroVariants} className="relative mt-2">
          <div className="absolute inset-0 bg-amber-500/[0.06] rounded-3xl blur-2xl scale-110 pointer-events-none" />
          <div className="relative">
            <CIAnalysisMockup />
          </div>
        </motion.div>
      </div>

      {/* Trusted by */}
      <motion.div variants={heroVariants}>
        <p className="text-zinc-400 dark:text-zinc-700 text-[10px] mb-3 uppercase tracking-[0.2em] font-mono font-medium">
          Trusted by teams at
        </p>
        <div className="flex items-center gap-6">
          {TRUSTED_BY.map((name) => (
            <span
              key={name}
              className="text-zinc-500 dark:text-zinc-700 font-display font-bold text-sm tracking-tight uppercase select-none hover:text-zinc-700 dark:hover:text-zinc-500 transition-colors"
            >
              {name}
            </span>
          ))}
        </div>
      </motion.div>
    </motion.div>
  </aside>
);
