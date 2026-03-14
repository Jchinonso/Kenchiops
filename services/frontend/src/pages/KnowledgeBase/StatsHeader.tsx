import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Database } from "lucide-react";
import { formatSnakeCase } from "@/lib/formatters";

interface StatsHeaderProps {
  readonly totalDocuments: number;
  readonly documentsByType: Record<string, number>;
}

export const StatsHeader = ({ totalDocuments, documentsByType }: StatsHeaderProps) => {
  const topTypes = useMemo(() => {
    const entries = Object.entries(documentsByType);
    return [...entries].sort(([, countA], [, countB]) => countB - countA).slice(0, 6);
  }, [documentsByType]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 rounded-lg border border-indigo-200 dark:border-indigo-800">
        <Database className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
          {totalDocuments} document{totalDocuments !== 1 ? "s" : ""}
        </span>
      </div>
      {topTypes.map(([docType, count]) => (
        <Badge key={docType} variant="outline" className="text-xs text-zinc-600 dark:text-zinc-400">
          {formatSnakeCase(docType)}: {count}
        </Badge>
      ))}
    </div>
  );
};
