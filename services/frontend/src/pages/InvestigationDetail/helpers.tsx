import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Clock } from "lucide-react";

const STATUS_ICONS: Readonly<Record<string, React.ReactNode>> = {
  completed: <CheckCircle2 className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
};

export const getStatusIcon = (status: string): React.ReactNode =>
  STATUS_ICONS[status] ?? <Clock className="w-4 h-4" />;

export const isActiveInvestigation = (status: string): boolean =>
  status === "queued" || status === "gathering" || status === "analyzing";

export const BackLink = () => (
  <Link
    to="/dashboard/incidents/investigations"
    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
  >
    <ArrowLeft className="w-4 h-4" />
    Back to Investigations
  </Link>
);
