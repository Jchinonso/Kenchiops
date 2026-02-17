import { Check, AlertTriangle, Search, Shield, Brain } from "lucide-react";
import { CIAnalysisMockup } from "@/components/CIAnalysisMockup";

interface FeatureCardProps {
  readonly title: string;
  readonly description: string;
  readonly features: readonly string[];
  readonly icon: React.ReactNode;
  readonly color: string;
  readonly mockup: React.ReactNode;
}

const FeatureCard = ({ title, description, features, icon, color, mockup }: FeatureCardProps) => (
  <div className="feature-card">
    <div className="grid lg:grid-cols-2 gap-0">
      {/* Left Content */}
      <div className="p-8 lg:p-10">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center`}>
            {icon}
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        </div>

        <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>

        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-3">
              <Check className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Right Mockup */}
      <div className="bg-gray-50 dark:bg-gray-800 p-8 lg:p-10 flex items-center justify-center">
        {mockup}
      </div>
    </div>
  </div>
);

const RootCauseMockup = () => (
  <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
    <div className="p-4 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900 dark:text-gray-100">Root Cause Analysis</span>
        <span className="px-2 py-1 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 text-xs rounded-full font-medium">
          92% Confidence
        </span>
      </div>
    </div>
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Search className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">Pattern Match</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Dependency conflict detected
            </div>
          </div>
        </div>
        <span className="text-sm font-medium text-indigo-600">0.95</span>
      </div>
      <div className="flex items-center justify-between p-3 bg-cyan-50 dark:bg-cyan-950 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">Historical Match</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Similar to fix in PR #312
            </div>
          </div>
        </div>
        <span className="text-sm font-medium text-cyan-600">0.88</span>
      </div>
      <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">Log Signal</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Stack trace analysis</div>
          </div>
        </div>
        <span className="text-sm font-medium text-violet-600">0.91</span>
      </div>
    </div>
  </div>
);

const RiskMockup = () => (
  <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
    <div className="p-4 border-b border-gray-100 dark:border-gray-800">
      <div className="font-semibold text-gray-900 dark:text-gray-100">PR Risk Assessment</div>
    </div>
    <div className="p-4">
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="12"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="12"
              strokeDasharray="150 251"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">Medium</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Risk Level</span>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Files Changed</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">12 files</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Lines Modified</span>
          <span className="font-medium text-orange-600 dark:text-orange-400">+847 / -203</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Past Failures</span>
          <span className="font-medium text-amber-600 dark:text-amber-400">3 similar</span>
        </div>
      </div>
    </div>
  </div>
);

const KnowledgeMockup = () => (
  <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
    <div className="p-4 border-b border-gray-100 dark:border-gray-800">
      <div className="font-semibold text-gray-900 dark:text-gray-100">Knowledge Base</div>
    </div>
    <div className="p-4 space-y-3">
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            TypeScript Build Errors
          </div>
          <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
            94% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          127 patterns learned from 89 PRs
        </div>
      </div>
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Docker Build Failures
          </div>
          <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
            91% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          43 patterns learned from 31 PRs
        </div>
      </div>
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Test Suite Timeouts
          </div>
          <span className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 px-2 py-0.5 rounded-full">
            78% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          56 patterns learned from 42 PRs
        </div>
      </div>
      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Dependency Conflicts
          </div>
          <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
            96% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          82 patterns learned from 67 PRs
        </div>
      </div>
    </div>
  </div>
);

const Features = () => {
  const features = [
    {
      title: "CI/CD Analysis",
      description:
        "Stop wasting hours debugging failed builds. Kenchi analyzes your CI logs automatically and tells you exactly what went wrong.",
      features: [
        "Intelligent log chunking pipeline",
        "Multi-model analysis for accuracy",
        "Automatic pattern recognition",
      ],
      icon: <AlertTriangle className="w-5 h-5 text-white" />,
      color: "bg-indigo-500",
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
      icon: <Search className="w-5 h-5 text-white" />,
      color: "bg-cyan-500",
      mockup: <RootCauseMockup />,
    },
    {
      title: "Risk Assessment",
      description:
        "Catch risky changes before they break production. Know which PRs need extra attention.",
      features: ["Custom rule engine", "PR risk scoring", "Automated GitHub check runs"],
      icon: <Shield className="w-5 h-5 text-white" />,
      color: "bg-amber-500",
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
      icon: <Brain className="w-5 h-5 text-white" />,
      color: "bg-violet-500",
      mockup: <KnowledgeMockup />,
    },
  ];

  return (
    <section
      id="features"
      aria-label="Product features"
      className="py-20 bg-white dark:bg-gray-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            AI-Powered CI/CD Intelligence
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            From failure detection to root cause analysis — Kenchi automates the debugging workflow
            so your team ships faster.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="space-y-8">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
