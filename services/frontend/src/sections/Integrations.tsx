import { Github, MessageSquare, Brain, Clock } from "lucide-react";
import { motion } from "motion/react";
import { sectionContainerVariants, itemVariants, microSpring } from "@/lib/animations";

const activeIntegrations = [
  {
    name: "GitHub",
    description: "PR comments, check runs, CI failure detection",
    icon: <Github className="w-7 h-7" />,
    color: "bg-zinc-100",
    iconColor: "text-zinc-900",
  },
  {
    name: "Slack",
    description: "Real-time alerts and failure notifications",
    icon: <MessageSquare className="w-7 h-7" />,
    color: "bg-violet-500",
    iconColor: "text-white",
  },
  {
    name: "OpenRouter",
    description: "Multi-model AI backbone for analysis",
    icon: <Brain className="w-7 h-7" />,
    color: "bg-amber-500",
    iconColor: "text-zinc-950",
  },
] as const;

const comingSoon = [
  { name: "GitLab" },
  { name: "Bitbucket" },
  { name: "Teams" },
  { name: "Discord" },
  { name: "Datadog" },
  { name: "PagerDuty" },
] as const;

const Integrations = () => (
  <section id="integrations" aria-label="Integrations" className="py-24 bg-zinc-900/50">
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
          Integrations
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl font-display font-bold text-zinc-100 mb-5"
        >
          Works Where You Work
        </motion.h2>
        <motion.p variants={itemVariants} className="text-lg text-zinc-500 max-w-2xl mx-auto">
          Kenchi plugs into your existing CI/CD workflow. No migration, no disruption.
        </motion.p>
      </motion.div>

      {/* Active Integrations */}
      <motion.div
        className="grid sm:grid-cols-3 gap-6 mb-14"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionContainerVariants}
      >
        {activeIntegrations.map((integration) => (
          <motion.div
            key={integration.name}
            variants={itemVariants}
            whileHover={{ y: -4, scale: 1.02, transition: microSpring }}
            className="flex flex-col items-center gap-4 p-8 bg-zinc-900/60 border border-zinc-800/60 rounded-2xl hover:border-amber-500/20 transition-all duration-300 group"
          >
            <div
              className={`w-14 h-14 ${integration.color} rounded-xl flex items-center justify-center ${integration.iconColor} group-hover:scale-110 transition-transform`}
            >
              {integration.icon}
            </div>
            <span className="text-lg font-display font-bold text-zinc-100">{integration.name}</span>
            <span className="text-sm text-zinc-500 text-center leading-relaxed">
              {integration.description}
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Coming Soon */}
      <motion.div
        className="text-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={sectionContainerVariants}
      >
        <motion.div
          variants={itemVariants}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900/80 border border-zinc-800 rounded-full mb-6"
        >
          <Clock className="w-4 h-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-500">Coming Soon</span>
        </motion.div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {comingSoon.map((item, index) => (
            <motion.span
              key={item.name}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: 0.3 + index * 0.06,
                type: "spring",
                stiffness: 200,
                damping: 25,
              }}
              className="px-4 py-2 bg-zinc-900/40 border border-zinc-800/40 rounded-lg text-sm font-medium text-zinc-600"
            >
              {item.name}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);

export default Integrations;
