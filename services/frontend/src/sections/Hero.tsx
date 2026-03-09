import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CIAnalysisMockup } from "@/components/CIAnalysisMockup";
import {
  sectionContainerVariants,
  heroVariants,
  itemVariants,
  microSpring,
} from "@/lib/animations";

const TRUSTED_BY = [
  "Vercel",
  "LaunchDarkly",
  "CircleCI",
  "Buildkite",
  "Render",
  "Railway",
] as const;

const Hero = () => (
  <section
    id="hero"
    aria-label="Hero"
    className="relative overflow-hidden bg-white dark:bg-zinc-950"
  >
    {/* Radial gradient glow from top */}
    <div className="absolute inset-0 bg-hero-gradient" />

    {/* Dot grid texture */}
    <div className="absolute inset-0 dot-grid opacity-40" />

    {/* Noise overlay */}
    <div className="absolute inset-0 noise-overlay" />

    {/* Ambient orbs */}
    <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/[0.06] rounded-full blur-[120px] pointer-events-none" />
    <div className="absolute bottom-[-100px] right-[-100px] w-[400px] h-[400px] bg-amber-600/[0.04] rounded-full blur-[100px] pointer-events-none" />

    {/* Content */}
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-28 pb-24">
      <motion.div
        className="text-center"
        variants={sectionContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Badge */}
        <motion.div
          variants={heroVariants}
          className="inline-flex items-center gap-2.5 px-4 py-2 bg-zinc-100/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-full mb-10"
        >
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" aria-hidden="true" />
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            AI-Powered CI/CD Intelligence
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={heroVariants}
          className="font-display text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 mb-8 leading-[0.95]"
        >
          Fix CI/CD failures
          <br />
          <span className="gradient-text">before they slow</span>
          <br className="hidden sm:block" />
          <span className="gradient-text"> you down</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          variants={heroVariants}
          className="max-w-2xl mx-auto text-lg sm:text-xl text-zinc-500 mb-12 leading-relaxed"
        >
          Kenchi automatically analyzes your CI/CD failures, identifies root causes with confidence
          scoring, and delivers actionable fixes — right in your PR.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          variants={heroVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4"
        >
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={microSpring}
          >
            <Link
              to="/login"
              className="group flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/20 hover:shadow-glow-amber-lg whitespace-nowrap"
            >
              START FREE TRIAL
              <span className="text-xs bg-zinc-950/15 px-2 py-0.5 rounded hidden sm:inline font-semibold">
                NO CC
              </span>
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={microSpring}
          >
            <a
              href="/#cta"
              className="flex items-center gap-2 px-8 py-4 bg-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all duration-200"
            >
              BOOK A DEMO
              <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>
        </motion.div>
        <motion.p
          variants={itemVariants}
          className="text-sm text-zinc-400 dark:text-zinc-600 sm:hidden mb-14"
        >
          No credit card required
        </motion.p>
        <div className="hidden sm:block mb-14" />

        {/* Product Preview */}
        <motion.div variants={heroVariants} className="max-w-lg mx-auto mb-20 relative">
          {/* Glow behind mockup */}
          <div className="absolute inset-0 bg-amber-500/[0.06] rounded-3xl blur-2xl scale-110 pointer-events-none" />
          <div className="relative">
            <CIAnalysisMockup />
          </div>
        </motion.div>

        {/* Trusted By */}
        <motion.div
          variants={heroVariants}
          className="pt-10 border-t border-zinc-200/60 dark:border-zinc-800/60"
        >
          <p className="text-xs font-medium text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mb-8">
            Trusted by engineering teams everywhere
          </p>
          <motion.div
            className="flex flex-wrap items-center justify-center gap-x-14 gap-y-6"
            variants={sectionContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {TRUSTED_BY.map((name) => (
              <motion.span
                key={name}
                variants={itemVariants}
                className="text-zinc-300 dark:text-zinc-700 font-display font-bold text-lg tracking-tight uppercase select-none hover:text-zinc-500 transition-colors"
              >
                {name}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  </section>
);

export default Hero;
