import { AlertCircle, FileSearch, FileText, MessageSquare } from "lucide-react";

const IntegrationPoints = () => {
  const points = [
    {
      number: "01",
      title: "CI Failure Detected",
      description:
        "Kenchi monitors your GitHub Actions, CircleCI, or any CI provider and catches failures the moment they happen.",
      icon: <AlertCircle className="w-6 h-6" />,
    },
    {
      number: "02",
      title: "Log Analysis",
      description:
        "Logs are chunked, extracted, and analyzed using a multi-model AI pipeline for maximum accuracy.",
      icon: <FileSearch className="w-6 h-6" />,
    },
    {
      number: "03",
      title: "Root Cause Report",
      description:
        "A confidence-scored diagnosis with factor breakdown, suggested fix, and links to similar past failures.",
      icon: <FileText className="w-6 h-6" />,
    },
    {
      number: "04",
      title: "PR Comment & Slack Alert",
      description:
        "Results posted directly to your pull request and Slack channel — no context-switching needed.",
      icon: <MessageSquare className="w-6 h-6" />,
    },
  ];

  return (
    <section id="how-it-works" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">How Kenchi Works</h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            From failure to fix in minutes, not hours
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {points.map((point, index) => (
            <div
              key={index}
              className="relative bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-all duration-300 group"
            >
              {/* Number */}
              <div className="absolute -top-4 -left-2 w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-lg">
                {point.number}
              </div>

              {/* Icon */}
              <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 mb-6 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                {point.icon}
              </div>

              {/* Content */}
              <h3 className="text-xl font-bold text-gray-900 mb-3">{point.title}</h3>
              <p className="text-gray-600">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default IntegrationPoints;
