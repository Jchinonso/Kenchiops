import { ArrowRight, Check, AlertTriangle, Search, Shield, Brain } from "lucide-react";

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
          <h3 className="text-2xl font-bold text-gray-900">{title}</h3>
          <ArrowRight className="w-5 h-5 text-indigo-500" />
        </div>

        <p className="text-gray-600 mb-6">{description}</p>

        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center gap-3">
              <Check className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              <span className="text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Right Mockup */}
      <div className="bg-gray-50 p-8 lg:p-10 flex items-center justify-center">{mockup}</div>
    </div>
  </div>
);

const CIAnalysisMockup = () => (
  <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
    <div className="bg-gray-900 px-4 py-3 flex items-center gap-2">
      <div className="flex gap-1.5">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <div className="w-3 h-3 rounded-full bg-yellow-500" />
        <div className="w-3 h-3 rounded-full bg-green-500" />
      </div>
      <span className="text-gray-400 text-sm ml-2">CI Build #4821 — Failed</span>
    </div>
    <div className="p-4 font-mono text-sm space-y-2">
      <div className="text-red-600 bg-red-50 p-2 rounded">
        <div className="font-semibold">Error: Module not found</div>
        <div className="text-xs text-red-500 mt-1">
          Cannot resolve &apos;@utils/auth&apos; in &apos;src/api/middleware.ts&apos;
        </div>
      </div>
      <div className="border-t border-gray-100 pt-2 mt-2" />
      <div className="text-indigo-600 bg-indigo-50 p-2 rounded">
        <div className="font-semibold text-xs uppercase tracking-wider text-indigo-500 mb-1">
          Kenchi Analysis
        </div>
        <div className="text-sm text-gray-700">
          Path alias &apos;@utils&apos; was removed in commit{" "}
          <span className="font-medium">a3f2c91</span>. Update import to
          &apos;../../utils/auth&apos;.
        </div>
      </div>
    </div>
  </div>
);

const RootCauseMockup = () => (
  <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
    <div className="p-4 border-b border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-900">Root Cause Analysis</span>
        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">
          92% Confidence
        </span>
      </div>
    </div>
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Search className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-medium text-gray-900">Pattern Match</div>
            <div className="text-sm text-gray-500">Dependency conflict detected</div>
          </div>
        </div>
        <span className="text-sm font-medium text-indigo-600">0.95</span>
      </div>
      <div className="flex items-center justify-between p-3 bg-cyan-50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-medium text-gray-900">Historical Match</div>
            <div className="text-sm text-gray-500">Similar to fix in PR #312</div>
          </div>
        </div>
        <span className="text-sm font-medium text-cyan-600">0.88</span>
      </div>
      <div className="flex items-center justify-between p-3 bg-violet-50 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-medium text-gray-900">Log Signal</div>
            <div className="text-sm text-gray-500">Stack trace analysis</div>
          </div>
        </div>
        <span className="text-sm font-medium text-violet-600">0.91</span>
      </div>
    </div>
  </div>
);

const RiskMockup = () => (
  <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
    <div className="p-4 border-b border-gray-100">
      <div className="font-semibold text-gray-900">PR Risk Assessment</div>
    </div>
    <div className="p-4">
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="12" />
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
            <span className="text-3xl font-bold text-gray-900">Medium</span>
            <span className="text-xs text-gray-500">Risk Level</span>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Files Changed</span>
          <span className="font-medium text-gray-900">12 files</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Lines Modified</span>
          <span className="font-medium text-orange-600">+847 / -203</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Past Failures</span>
          <span className="font-medium text-amber-600">3 similar</span>
        </div>
      </div>
    </div>
  </div>
);

const KnowledgeMockup = () => (
  <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
    <div className="p-4 border-b border-gray-100">
      <div className="font-semibold text-gray-900">Knowledge Base</div>
    </div>
    <div className="p-4 space-y-3">
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900">TypeScript Build Errors</div>
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            94% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500">127 patterns learned from 89 PRs</div>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900">Docker Build Failures</div>
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            91% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500">43 patterns learned from 31 PRs</div>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900">Test Suite Timeouts</div>
          <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
            78% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500">56 patterns learned from 42 PRs</div>
      </div>
      <div className="p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm font-medium text-gray-900">Dependency Conflicts</div>
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            96% resolved
          </span>
        </div>
        <div className="text-xs text-gray-500">82 patterns learned from 67 PRs</div>
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
    <section id="features" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            AI-Powered CI/CD Intelligence
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
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
