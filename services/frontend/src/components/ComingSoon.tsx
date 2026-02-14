import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface ComingSoonProps {
  readonly title: string;
  readonly description: string;
  readonly icon: React.ReactNode;
}

export const ComingSoon = ({ title, description, icon }: ComingSoonProps) => (
  <div className="flex flex-col items-center justify-center py-20 px-4">
    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 mb-6">
      {icon}
    </div>
    <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
    <p className="text-gray-500 text-center max-w-md mb-8">{description}</p>
    <Link
      to="/dashboard"
      className="inline-flex items-center gap-2 text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to Overview
    </Link>
  </div>
);
