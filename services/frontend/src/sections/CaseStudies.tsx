import { ArrowRight, Users, Zap, Clock, TrendingDown } from "lucide-react";

const CaseStudies = () => {
  const caseStudies = [
    {
      company: "FastShip",
      logo: (
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" />
        </div>
      ),
      badge: "120-person eng team",
      metric: "73%",
      metricLabel: "faster CI failure resolution",
      image:
        "bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30",
    },
    {
      company: "ScaleOps",
      logo: (
        <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
          <Clock className="w-5 h-5 text-white" />
        </div>
      ),
      badge: "Series B startup",
      metric: "6hrs",
      metricLabel: "saved per developer per week",
      image:
        "bg-gradient-to-br from-cyan-100 to-blue-100 dark:from-cyan-900/30 dark:to-blue-900/30",
    },
    {
      company: "DeployHQ",
      logo: (
        <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
          <TrendingDown className="w-5 h-5 text-white" />
        </div>
      ),
      badge: "Enterprise, 500+ devs",
      metric: "62%",
      metricLabel: "reduction in mean time to recovery",
      image:
        "bg-gradient-to-br from-violet-100 to-pink-100 dark:from-violet-900/30 dark:to-pink-900/30",
    },
  ];

  return (
    <section id="case-studies" className="py-20 bg-white dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Teams Shipping Faster with Kenchi
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            See how engineering teams are cutting their CI/CD debugging time dramatically
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {caseStudies.map((study, index) => (
            <div key={index} className="feature-card group hover:shadow-feature transition-shadow">
              {/* Header */}
              <div className="p-6 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {study.logo}
                    <span className="font-bold text-gray-900 dark:text-gray-100">
                      {study.company}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-3 py-1 rounded-full">
                    {study.badge}
                  </span>
                </div>
              </div>

              {/* Image Placeholder */}
              <div className={`h-48 ${study.image} flex items-center justify-center`}>
                <div className="flex -space-x-4">
                  {[1, 2, 3].map((avatarIndex) => (
                    <div
                      key={avatarIndex}
                      className="w-16 h-16 bg-white dark:bg-gray-800 rounded-full border-4 border-white dark:border-gray-800 shadow-lg flex items-center justify-center"
                    >
                      <Users className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Metrics */}
              <div className="p-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold text-indigo-500">{study.metric}</span>
                  <span className="text-gray-600 dark:text-gray-400">{study.metricLabel}</span>
                </div>
                <button className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group-hover:border-indigo-300 dark:group-hover:border-indigo-700">
                  READ FULL CASE STUDY
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CaseStudies;
