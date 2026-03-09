import { Github, GitCommitHorizontal, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  sectionContainerVariants,
  itemVariants,
  scaleInVariants,
  microSpring,
} from "@/lib/animations";

const steps = [
  {
    number: "1",
    title: "Connect Your Repo",
    description: "Install the Kenchi GitHub App in one click. No code changes, no config files.",
    icon: <Github className="w-6 h-6" />,
  },
  {
    number: "2",
    title: "Push a Commit",
    description: "Kenchi automatically monitors your CI pipelines. No setup required on your end.",
    icon: <GitCommitHorizontal className="w-6 h-6" />,
  },
  {
    number: "3",
    title: "Get Your First Analysis",
    description:
      "When a build fails, Kenchi delivers a confidence-scored root cause report right to your PR.",
    icon: <Search className="w-6 h-6" />,
  },
] as const;

const GetStarted = () => (
  <section
    id="get-started"
    aria-label="Get started in 3 steps"
    className="py-24 bg-white dark:bg-zinc-950 relative"
  >
    <div className="absolute inset-x-0 top-0 section-divider" />

    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
          Quick Start
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-900 dark:text-zinc-100 mb-5"
        >
          Up and Running in Minutes
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500 max-w-2xl mx-auto">
          Three steps to your first CI failure analysis. No credit card required.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionContainerVariants}
      >
        {steps.map((step, index) => (
          <motion.div key={step.number} variants={itemVariants} className="relative text-center">
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-px bg-gradient-to-r from-zinc-200 dark:from-zinc-800 to-transparent" />
            )}

            <motion.div
              variants={scaleInVariants}
              className="relative inline-flex items-center justify-center w-20 h-20 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-amber-500 mb-6 mx-auto"
            >
              {step.icon}
              <span className="absolute -top-2 -right-2 w-7 h-7 bg-amber-500 text-zinc-950 text-sm font-bold rounded-full flex items-center justify-center">
                {step.number}
              </span>
            </motion.div>

            <h3 className="text-xl font-display font-bold text-zinc-900 dark:text-zinc-100 mb-3">
              {step.title}
            </h3>
            <p className="text-zinc-500 leading-relaxed">{step.description}</p>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className="text-center mt-14"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.5 }}
        variants={sectionContainerVariants}
      >
        <motion.div variants={itemVariants}>
          <motion.div
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={microSpring}
            className="inline-block"
          >
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:shadow-glow-amber-lg"
            >
              Get Started — It&apos;s Free
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  </section>
);

export default GetStarted;
