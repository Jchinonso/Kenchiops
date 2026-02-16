import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const CTA = () => (
  <section id="cta" className="py-20 bg-white dark:bg-gray-950">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-cta-gradient rounded-3xl p-12 md:p-16 text-center">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
          Stop debugging CI failures manually.
        </h2>
        <p className="text-lg text-white/80 max-w-xl mx-auto mb-8">
          Free for 14 days. No credit card needed. Get your first root cause analysis in minutes.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/login"
            className="group flex items-center gap-2 px-8 py-4 bg-white hover:bg-gray-100 text-indigo-600 font-semibold rounded-lg transition-all duration-200 shadow-lg"
          >
            START 14 DAYS FREE TRIAL
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="/#hero"
            className="flex items-center gap-2 px-8 py-4 bg-transparent hover:bg-white/10 text-white font-semibold rounded-lg border border-white/30 transition-all duration-200"
          >
            SCHEDULE A DEMO
          </a>
        </div>
      </div>
    </div>
  </section>
);

export default CTA;
