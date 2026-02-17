import { Github, GitCommitHorizontal, Search } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  {
    number: "1",
    title: "Connect Your Repo",
    description: "Install the Kenchi GitHub App in one click. No code changes, no config files.",
    icon: <Github className="w-6 h-6" />,
  },
  {
    number: "2",
    title: "Push a Commit",
    description: "Kenchi automatically monitors your CI pipelines. No setup required on your end.",
    icon: <GitCommitHorizontal className="w-6 h-6" />,
  },
  {
    number: "3",
    title: "Get Your First Analysis",
    description:
      "When a build fails, Kenchi delivers a confidence-scored root cause report right to your PR.",
    icon: <Search className="w-6 h-6" />,
  },
] as const;

const GetStarted = () => (
  <section
    id="get-started"
    aria-label="Get started in 3 steps"
    className="py-20 bg-white dark:bg-gray-950"
  >
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Up and Running in Minutes
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Three steps to your first CI failure analysis. No credit card required.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
        {steps.map((step, index) => (
          <div key={step.number} className="relative text-center">
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-px bg-gray-200 dark:bg-gray-700" />
            )}

            <div className="relative inline-flex items-center justify-center w-20 h-20 bg-indigo-50 dark:bg-indigo-950 rounded-2xl text-indigo-500 mb-6 mx-auto">
              {step.icon}
              <span className="absolute -top-2 -right-2 w-7 h-7 bg-indigo-500 text-white text-sm font-bold rounded-full flex items-center justify-center">
                {step.number}
              </span>
            </div>

            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              {step.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">{step.description}</p>
          </div>
        ))}
      </div>

      <div className="text-center mt-12">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-8 py-4 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-indigo-500/25"
        >
          Get Started — It&apos;s Free
        </Link>
      </div>
    </div>
  </section>
);

export default GetStarted;
