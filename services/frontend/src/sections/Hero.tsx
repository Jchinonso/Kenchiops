import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const Hero = () => (
  <section id="hero" className="relative overflow-hidden">
    {/* Background Gradient */}
    <div className="absolute inset-0 bg-hero-gradient" />
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white dark:via-gray-950/50 dark:to-gray-950" />

    {/* Content */}
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
      <div className="text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-950 rounded-full mb-8">
          <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
            AI-Powered CI/CD Intelligence
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-6">
          Fix CI/CD failures
          <br />
          <span className="gradient-text">before they slow you down</span>
        </h1>

        {/* Subheadline */}
        <p className="max-w-2xl mx-auto text-lg sm:text-xl text-gray-600 dark:text-gray-400 mb-10">
          Kenchi automatically analyzes your CI/CD failures, identifies root causes with confidence
          scoring, and delivers actionable fixes — right in your PR
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link
            to="/login"
            className="group flex items-center gap-2 px-8 py-4 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-indigo-500/25"
          >
            START FREE TRIAL
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded">NO CC REQUIRED</span>
          </Link>
          <a
            href="/#cta"
            className="flex items-center gap-2 px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-semibold rounded-lg border border-gray-200 dark:border-gray-700 transition-all duration-200"
          >
            BOOK A DEMO
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Trusted By */}
        <div className="pt-8 border-t border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Trusted by engineering teams everywhere
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
            {["Vercel", "LaunchDarkly", "CircleCI", "Buildkite", "Render", "Railway"].map(
              (name) => (
                <span
                  key={name}
                  className="text-gray-400 dark:text-gray-500 font-semibold text-lg tracking-tight"
                >
                  {name}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default Hero;
