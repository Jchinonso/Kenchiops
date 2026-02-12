import { Zap, Target, Clock, TrendingUp } from "lucide-react";

const Stats = () => {
  const stats = [
    {
      value: "70%",
      label: "Faster Failure Resolution",
      icon: <Zap className="w-6 h-6" />,
    },
    {
      value: "10K+",
      label: "CI Failures Analyzed",
      icon: <Target className="w-6 h-6" />,
    },
    {
      value: "<2min",
      label: "Average Analysis Time",
      icon: <Clock className="w-6 h-6" />,
    },
    {
      value: "95%",
      label: "Root Cause Accuracy",
      sublabel: "Confidence-scored diagnostics",
      icon: <TrendingUp className="w-6 h-6" />,
    },
  ];

  return (
    <section id="stats" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            How Kenchi Transforms Your CI/CD Workflow
          </h2>
        </div>

        {/* Stats Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-indigo-50 rounded-xl text-indigo-500 mb-4">
                {stat.icon}
              </div>
              <div className="text-4xl sm:text-5xl font-bold text-indigo-500 mb-2">
                {stat.value}
              </div>
              <div className="text-gray-900 font-medium mb-1">{stat.label}</div>
              {stat.sublabel && <div className="text-sm text-gray-500">{stat.sublabel}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
