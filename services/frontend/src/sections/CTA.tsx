import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { sectionContainerVariants, itemVariants, microSpring } from "@/lib/animations";

const CTA = () => (
  <section id="cta" aria-label="Get started" className="py-24 bg-white dark:bg-zinc-950">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <motion.div
        className="relative rounded-3xl p-12 md:p-20 text-center overflow-hidden border border-zinc-200/40 dark:border-zinc-800/40"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={sectionContainerVariants}
      >
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-zinc-100 dark:via-zinc-900 to-violet-500/10" />

        {/* Ambient orbs */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/[0.08] rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-violet-500/[0.06] rounded-full blur-[100px] pointer-events-none" />

        {/* Dot grid */}
        <div className="absolute inset-0 dot-grid opacity-20" />

        <motion.h2
          variants={itemVariants}
          className="relative text-3xl sm:text-4xl md:text-5xl font-display font-extrabold text-zinc-900 dark:text-zinc-100 mb-5 tracking-tight"
        >
          Stop debugging CI failures manually.
        </motion.h2>
        <motion.p
          variants={itemVariants}
          className="relative text-lg text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto mb-10"
        >
          Free for 14 days. No credit card needed. Get your first root cause analysis in minutes.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="relative flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={microSpring}
          >
            <Link
              to="/login"
              className="group flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/20 hover:shadow-glow-amber-lg"
            >
              START 14 DAYS FREE TRIAL
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={microSpring}
          >
            <a
              href="mailto:hello@kenchi.dev?subject=Schedule a Demo"
              className="flex items-center gap-2 px-8 py-4 bg-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 font-semibold rounded-xl border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all duration-200"
            >
              SCHEDULE A DEMO
            </a>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  </section>
);

export default CTA;
