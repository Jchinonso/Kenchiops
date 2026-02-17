import { Github, MessageSquare, Brain, Clock } from "lucide-react";

const Integrations = () => {
  const activeIntegrations = [
    {
      name: "GitHub",
      description: "PR comments, check runs, CI failure detection",
      icon: <Github className="w-8 h-8" />,
      color: "bg-gray-900",
    },
    {
      name: "Slack",
      description: "Real-time alerts and failure notifications",
      icon: <MessageSquare className="w-8 h-8" />,
      color: "bg-purple-600",
    },
    {
      name: "OpenRouter",
      description: "Multi-model AI backbone for analysis",
      icon: <Brain className="w-8 h-8" />,
      color: "bg-indigo-500",
    },
  ];

  const comingSoon = [
    { name: "GitLab" },
    { name: "Bitbucket" },
    { name: "Teams" },
    { name: "Discord" },
    { name: "Datadog" },
    { name: "PagerDuty" },
  ];

  return (
    <section
      id="integrations"
      aria-label="Integrations"
      className="py-20 bg-gray-50 dark:bg-gray-900"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Works Where You Work
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Kenchi plugs into your existing CI/CD workflow. No migration, no disruption.
          </p>
        </div>

        {/* Active Integrations */}
        <div className="grid sm:grid-cols-3 gap-6 mb-12">
          {activeIntegrations.map((integration, index) => (
            <div
              key={index}
              className="flex flex-col items-center gap-3 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow group"
            >
              <div
                className={`w-14 h-14 ${integration.color} rounded-xl flex items-center justify-center text-white group-hover:scale-110 transition-transform`}
              >
                {integration.icon}
              </div>
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {integration.name}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400 text-center">
                {integration.description}
              </span>
            </div>
          ))}
        </div>

        {/* Coming Soon */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950 rounded-full mb-6">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
              Coming Soon
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {comingSoon.map((item, index) => (
              <span
                key={index}
                className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-500 dark:text-gray-400"
              >
                {item.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Integrations;
