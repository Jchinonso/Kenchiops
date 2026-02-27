import { Server, Activity, Wrench, Code2, HardDrive, TestTube } from "lucide-react";
import { motion } from "motion/react";
import { sectionContainerVariants, itemVariants, microSpring } from "@/lib/animations";

const teams = [
  {
    title: "Platform Engineering",
    description:
      "Keep your CI/CD infrastructure reliable with role-based access control. Kenchi surfaces recurring failure patterns so you can fix the platform, not just the symptoms.",
    icon: <Server className="w-6 h-6" />,
  },
  {
    title: "SRE",
    description:
      "Reduce MTTR with instant root cause analysis and a real-time dashboard. Kenchi turns hours of log diving into a 2-minute diagnosis.",
    icon: <Activity className="w-6 h-6" />,
  },
  {
    title: "DevOps",
    description:
      "Automate the feedback loop. Kenchi posts analysis directly to PRs and Slack, keeping your pipeline moving.",
    icon: <Wrench className="w-6 h-6" />,
  },
  {
    title: "Backend Engineering",
    description:
      "Stop context-switching to debug CI. Get actionable fixes with confidence scores right where you code.",
    icon: <Code2 className="w-6 h-6" />,
  },
  {
    title: "Infrastructure",
    description:
      "Identify infra-related failures — Docker build issues, resource limits, network timeouts — before they cascade.",
    icon: <HardDrive className="w-6 h-6" />,
  },
  {
    title: "QA & Release",
    description:
      "Understand test failures at scale. Kenchi distinguishes flaky tests from real regressions, saving your team hours.",
    icon: <TestTube className="w-6 h-6" />,
  },
] as const;

const BuiltForTeams = () => (
  <section id="teams" aria-label="Built for engineering teams" className="py-24 bg-zinc-900/50">
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
          For Every Team
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-100 mb-5"
        >
          Built for Every Engineering Team
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500 max-w-2xl mx-auto">
          Whether you run the platform or ship features on it — Kenchi helps your team move faster
          with confidence.
        </motion.p>
      </motion.div>

      <motion.div
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        variants={sectionContainerVariants}
      >
        {teams.map((team) => (
          <motion.div
            key={team.title}
            variants={itemVariants}
            whileHover={{ y: -4, transition: microSpring }}
            className="bg-zinc-900/60 border border-zinc-800/60 rounded-2xl p-8 hover:border-amber-500/20 transition-all duration-300 group"
          >
            <div className="w-14 h-14 bg-zinc-800/60 border border-zinc-700/40 rounded-xl flex items-center justify-center text-zinc-400 mb-6 group-hover:text-amber-400 group-hover:border-amber-500/30 transition-all duration-300">
              {team.icon}
            </div>
            <h3 className="text-lg font-display font-bold text-zinc-100 mb-3">{team.title}</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">{team.description}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default BuiltForTeams;
