import { Server, Activity, Wrench, Code2, HardDrive, TestTube } from "lucide-react";

const BuiltForTeams = () => {
  const teams = [
    {
      title: "Platform Engineering",
      description:
        "Keep your CI/CD infrastructure reliable. Kenchi surfaces recurring failure patterns so you can fix the platform, not just the symptoms.",
      icon: <Server className="w-6 h-6" />,
    },
    {
      title: "SRE",
      description:
        "Reduce MTTR with instant root cause analysis. Kenchi turns hours of log diving into a 2-minute diagnosis.",
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
  ];

  return (
    <section
      id="teams"
      aria-label="Built for engineering teams"
      className="py-20 bg-white dark:bg-gray-950"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Built for Every Engineering Team
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Whether you run the platform or ship features on it — Kenchi helps your team move faster
            with confidence.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team, index) => (
            <div
              key={index}
              className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8 hover:shadow-lg transition-all duration-300 group"
            >
              <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950 rounded-xl flex items-center justify-center text-indigo-500 mb-6 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                {team.icon}
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                {team.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">{team.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BuiltForTeams;
