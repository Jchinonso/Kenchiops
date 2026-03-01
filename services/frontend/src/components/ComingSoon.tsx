import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ComingSoonProps {
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
}

export const ComingSoon = ({ title, description, icon, ctaLabel, ctaHref }: ComingSoonProps) => (
  <div className="flex flex-col items-center justify-center py-16 sm:py-20 px-4">
    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-950 dark:to-violet-950 rounded-2xl flex items-center justify-center text-indigo-500 mb-6">
      {icon}
    </div>
    <Badge variant="secondary" className="mb-3 text-xs">
      Coming Soon
    </Badge>
    <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2 text-center">
      {title}
    </h2>
    <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 text-center max-w-md mb-6">
      {description}
    </p>
    <div className="flex flex-col sm:flex-row items-center gap-3">
      {ctaLabel && ctaHref && (
        <Link
          to={ctaHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {ctaLabel}
        </Link>
      )}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Overview
      </Link>
    </div>
  </div>
);
