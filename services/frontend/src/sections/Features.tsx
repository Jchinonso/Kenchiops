import type { ReactNode } from "react";
import { Check, AlertTriangle, Search, Shield, Brain } from "lucide-react";
import { motion } from "motion/react";
import { CIAnalysisMockup } from "@/components/CIAnalysisMockup";
import { sectionContainerVariants, itemVariants, microSpring } from "@/lib/animations";

interface FeatureCardProps {
  readonly title: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly icon: ReactNode;
  readonly color: string;
  readonly mockup: ReactNode;
  readonly reversed?: boolean;
}

const FeatureCard = ({
  title,
  description,
  features,
  icon,
  color,
  mockup,
  reversed,
}: FeatureCardProps) => (
  <motion.div
    variants={itemVariants}
    whileHover={{ y: -4, transition: microSpring }}
    className="feature-card"
  >
    <div className={`grid lg:grid-cols-2 gap-0 ${reversed ? "direction-rtl" : ""}`}>
      {/* Left Content */}
      <div
        className={`p-8 lg:p-10 min-w-0 ${reversed ? "lg:order-2" : ""}`}
        style={{ direction: "ltr" }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
          <h3 className="text-xl font-display font-bold text-zinc-100">{title}</h3>
        </div>

        <p className="text-zinc-400 mb-6 leading-relaxed">{description}</p>

        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-amber-500" />
              </div>
              <span className="text-zinc-300 text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Right Mockup */}
      <div
        className={`bg-zinc-900/50 p-8 lg:p-10 flex items-center justify-center min-w-0 overflow-hidden border-t lg:border-t-0 ${reversed ? "lg:order-1 lg:border-r border-zinc-800/40" : "lg:border-l border-zinc-800/40"}`}
        style={{ direction: "ltr" }}
      >
        {mockup}
      </div>
    </div>
  </motion.div>
);

const RootCauseMockup = () => (
  <motion.div
    className="w-full max-w-md bg-zinc-900/80 rounded-xl shadow-2xl overflow-hidden border border-zinc-800/60"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.3 }}
    variants={sectionContainerVariants}
  >
    <motion.div variants={itemVariants} className="p-4 border-b border-zinc-800/60">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-zinc-200 text-sm">Root Cause Analysis</span>
        <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full font-mono font-medium border border-emerald-500/20">
          92% Confidence
        </span>
      </div>
    </motion.div>
    <div className="p-4 space-y-2.5">
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Search className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="font-medium text-zinc-200 text-sm">Pattern Match</div>
            <div className="text-xs text-zinc-500">Dependency conflict detected</div>
          </div>
        </div>
        <span className="text-sm font-mono font-medium text-amber-400">0.95</span>
      </motion.div>
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between p-3 bg-violet-500/5 border border-violet-500/10 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-500/15 rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <div className="font-medium text-zinc-200 text-sm">Historical Match</div>
            <div className="text-xs text-zinc-500">Similar to fix in PR #312</div>
          </div>
        </div>
        <span className="text-sm font-mono font-medium text-violet-400">0.88</span>
      </motion.div>
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500/15 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="font-medium text-zinc-200 text-sm">Log Signal</div>
            <div className="text-xs text-zinc-500">Stack trace analysis</div>
          </div>
        </div>
        <span className="text-sm font-mono font-medium text-emerald-400">0.91</span>
      </motion.div>
    </div>
  </motion.div>
);

const RiskMockup = () => (
  <motion.div
    className="w-full max-w-md bg-zinc-900/80 rounded-xl shadow-2xl overflow-hidden border border-zinc-800/60"
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.3 }}
    variants={sectionContainerVariants}
  >
    <motion.div variants={itemVariants} className="p-4 border-b border-zinc-800/60">
      <div className="font-semibold text-zinc-200 text-sm">PR Risk Assessment</div>
    </motion.div>
    <div className="p-4">
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              className="stroke-zinc-800"
              strokeWidth="12"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="12"
              initial={{ strokeDasharray: "0 251" }}
              whileInView={{ strokeDasharray: "150 251" }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-display font-bold text-zinc-100">Medium</span>
            <span className="text-xs text-zinc-500">Risk Level</span>
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        <motion.div variants={itemVariants} className="flex justify-between text-sm">
          <span className="text-zinc-500">Files Changed</span>
          <span className="font-mono font-medium text-zinc-300">12 files</span>
        </motion.div>
        <motion.div variants={itemVariants} className="flex justify-between text-sm">
          <span className="text-zinc-500">Lines Modified</span>
          <span className="font-mono font-medium text-amber-400">+847 / -203</span>
        </motion.div>
        <motion.div variants={itemVariants} className="flex justify-between text-sm">
          <span className="text-zinc-500">Past Failures</span>
          <span className="font-mono font-medium text-amber-500">3 similar</span>
        </motion.div>
      </div>
    </div>
  </motion.div>
);

const KnowledgeMockup = () => {
  const items: ReadonlyArray<{
    readonly title: string;
    readonly pct: string;
    readonly patterns: string;
    readonly warn?: boolean;
  }> = [
    { title: "TypeScript Build Errors", pct: "94%", patterns: "127 patterns from 89 PRs" },
    { title: "Docker Build Failures", pct: "91%", patterns: "43 patterns from 31 PRs" },
    { title: "Test Suite Timeouts", pct: "78%", patterns: "56 patterns from 42 PRs", warn: true },
    { title: "Dependency Conflicts", pct: "96%", patterns: "82 patterns from 67 PRs" },
  ];

  return (
    <motion.div
      className="w-full max-w-md bg-zinc-900/80 rounded-xl shadow-2xl overflow-hidden border border-zinc-800/60"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={sectionContainerVariants}
    >
      <motion.div variants={itemVariants} className="p-4 border-b border-zinc-800/60">
        <div className="font-semibold text-zinc-200 text-sm">Knowledge Base</div>
      </motion.div>
      <div className="p-4 space-y-2.5">
        {items.map((item) => (
          <motion.div
            key={item.title}
            variants={itemVariants}
            className="p-3 bg-zinc-800/30 border border-zinc-800/40 rounded-lg"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-sm font-medium text-zinc-300">{item.title}</div>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                  item.warn
                    ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                }`}
              >
                {item.pct}
              </span>
            </div>
            <div className="text-xs text-zinc-600">{item.patterns}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

const featureCards: readonly FeatureCardProps[] = [
  {
    title: "CI/CD Analysis",
    description:
      "Stop wasting hours debugging failed builds. Kenchi analyzes your CI logs automatically and tells you exactly what went wrong.",
    features: [
      "Intelligent log chunking pipeline",
      "Multi-model analysis for accuracy",
      "Automatic pattern recognition",
    ],
    icon: <AlertTriangle className="w-5 h-5 text-zinc-950" />,
    color: "bg-amber-500",
    mockup: <CIAnalysisMockup />,
  },
  {
    title: "Root Cause Detection",
    description:
      "Get confidence-scored root causes, not guesswork. Every diagnosis backed by evidence.",
    features: [
      "Confidence scoring (0-1 scale)",
      "Factor breakdown per diagnosis",
      "Historical pattern matching",
    ],
    icon: <Search className="w-5 h-5 text-zinc-950" />,
    color: "bg-violet-500",
    mockup: <RootCauseMockup />,
    reversed: true,
  },
  {
    title: "Risk Assessment",
    description:
      "Catch risky changes before they break production. Know which PRs need extra attention.",
    features: ["Custom rule engine", "PR risk scoring", "Automated GitHub check runs"],
    icon: <Shield className="w-5 h-5 text-zinc-950" />,
    color: "bg-emerald-500",
    mockup: <RiskMockup />,
  },
  {
    title: "RAG-Enhanced Learning",
    description:
      "Kenchi learns from your team's past fixes to get smarter over time. The more you use it, the better it gets.",
    features: [
      "Team-specific knowledge base",
      "Historical analysis patterns",
      "Continuous improvement loop",
    ],
    icon: <Brain className="w-5 h-5 text-zinc-950" />,
    color: "bg-amber-400",
    mockup: <KnowledgeMockup />,
    reversed: true,
  },
];

const Features = () => (
  <section id="features" aria-label="Product features" className="py-24 bg-zinc-950 relative">
    {/* Subtle grid */}
    <div className="absolute inset-0 dot-grid opacity-20" />

    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <motion.div
        className="text-center mb-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={sectionContainerVariants}
      >
        <motion.span
          variants={itemVariants}
          className="text-amber-500 text-sm font-mono font-medium uppercase tracking-widest mb-4 block"
        >
          Features
        </motion.span>
        <motion.h2
          variants={itemVariants}
          className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-zinc-100 mb-5"
        >
          AI-Powered CI/CD Intelligence
        </motion.h2>
        <motion.p
          variants={itemVariants}
          className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed"
        >
          From failure detection to root cause analysis — Kenchi automates the debugging workflow so
          your team ships faster.
        </motion.p>
      </motion.div>

      {/* Feature Cards */}
      <motion.div
        className="space-y-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.1 }}
        variants={sectionContainerVariants}
      >
        {featureCards.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </motion.div>
    </div>
  </section>
);

export default Features;
