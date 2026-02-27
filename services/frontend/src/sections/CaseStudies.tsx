import { ArrowRight, Zap, Clock, TrendingDown } from "lucide-react";
import { motion } from "motion/react";
import {
  sectionContainerVariants,
  itemVariants,
  scaleInVariants,
  microSpring,
} from "@/lib/animations";

interface CaseStudyAvatar {
  readonly initials: string;
  readonly color: string;
}

const caseStudies = [
  {
    company: "FastShip",
    logo: (
      <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
        <Zap className="w-5 h-5 text-zinc-950" />
      </div>
    ),
    badge: "120-person eng team",
    metric: "73%",
    metricLabel: "faster CI failure resolution",
    gradient: "from-amber-500/5 to-violet-500/5",
    avatars: [
      { initials: "SC", color: "bg-amber-500" },
      { initials: "JL", color: "bg-violet-500" },
      { initials: "AR", color: "bg-emerald-500" },
    ] as readonly CaseStudyAvatar[],
  },
  {
    company: "ScaleOps",
    logo: (
      <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
        <Clock className="w-5 h-5 text-white" />
      </div>
    ),
    badge: "Series B startup",
    metric: "6hrs",
    metricLabel: "saved per developer per week",
    gradient: "from-violet-500/5 to-emerald-500/5",
    avatars: [
      { initials: "MK", color: "bg-violet-500" },
      { initials: "DP", color: "bg-blue-500" },
      { initials: "TN", color: "bg-emerald-500" },
    ] as readonly CaseStudyAvatar[],
  },
  {
    company: "DeployHQ",
    logo: (
      <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
        <TrendingDown className="w-5 h-5 text-white" />
      </div>
    ),
    badge: "Enterprise, 500+ devs",
    metric: "62%",
    metricLabel: "reduction in mean time to recovery",
    gradient: "from-emerald-500/5 to-amber-500/5",
    avatars: [
      { initials: "RW", color: "bg-emerald-500" },
      { initials: "EH", color: "bg-pink-500" },
      { initials: "KS", color: "bg-amber-500" },
    ] as readonly CaseStudyAvatar[],
  },
] as const;

const CaseStudies = () => (
  <section id="case-studies" aria-label="Customer case studies" className="py-24 bg-zinc-950">
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
          Case Studies
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-100 mb-5"
        >
          Teams Shipping Faster with Kenchi
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500 max-w-2xl mx-auto">
          See how engineering teams are cutting their CI/CD debugging time dramatically
        </motion.p>
      </motion.div>

      <motion.div
        className="grid md:grid-cols-3 gap-6"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionContainerVariants}
      >
        {caseStudies.map((study) => (
          <motion.div
            key={study.company}
            variants={itemVariants}
            whileHover={{ y: -6, transition: microSpring }}
            className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl overflow-hidden hover:border-amber-500/20 transition-all duration-300 group"
          >
            {/* Header */}
            <div className="p-6 border-b border-zinc-800/40">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {study.logo}
                  <span className="font-display font-bold text-zinc-100">{study.company}</span>
                </div>
                <span className="text-xs font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                  {study.badge}
                </span>
              </div>
            </div>

            {/* Team Avatars */}
            <div
              className={`h-44 bg-gradient-to-br ${study.gradient} flex items-center justify-center`}
            >
              <div className="flex -space-x-4">
                {study.avatars.map((avatar) => (
                  <div
                    key={avatar.initials}
                    className={`w-16 h-16 ${avatar.color} rounded-full border-4 border-zinc-900 shadow-lg flex items-center justify-center`}
                  >
                    <span className="text-white font-bold text-lg">{avatar.initials}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Metrics */}
            <div className="p-6">
              <div className="flex items-baseline gap-2 mb-3">
                <motion.span
                  variants={scaleInVariants}
                  className="text-4xl font-display font-extrabold text-amber-500"
                >
                  {study.metric}
                </motion.span>
                <span className="text-zinc-500 text-sm">{study.metricLabel}</span>
              </div>
              <a
                href="/#cta"
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 border border-zinc-800 rounded-lg text-sm font-medium text-zinc-400 hover:text-amber-400 hover:border-amber-500/30 transition-colors"
              >
                READ FULL CASE STUDY
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default CaseStudies;
