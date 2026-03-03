/**
 * Investigation Evidence Component
 *
 * Renders a collapsible list of evidence items grouped by source type.
 * Each item shows title, summary, relevance score, and timestamp.
 */

import { useState, useMemo } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSafeUrl } from "@/lib/urlSafety";
import { getEvidenceSourceLabel, formatTimestamp } from "@/lib/formatters";
import type { InvestigationEvidenceItem } from "@/hooks/useInvestigationData";

// ==================== Types ====================

interface InvestigationEvidenceProps {
  readonly evidence: readonly InvestigationEvidenceItem[];
}

interface EvidenceGroup {
  readonly source: string;
  readonly label: string;
  readonly items: readonly InvestigationEvidenceItem[];
}

// ==================== Helpers ====================

const groupEvidenceBySources = (
  evidence: readonly InvestigationEvidenceItem[]
): readonly EvidenceGroup[] => {
  const grouped = evidence.reduce<Readonly<Record<string, readonly InvestigationEvidenceItem[]>>>(
    (acc, item) => ({
      ...acc,
      [item.source]: [...(acc[item.source] ?? []), item],
    }),
    {}
  );

  return Object.entries(grouped).map(
    ([source, items]): EvidenceGroup => ({
      source,
      label: getEvidenceSourceLabel(source),
      items,
    })
  );
};

// ==================== Sub-components ====================

interface EvidenceItemCardProps {
  readonly item: InvestigationEvidenceItem;
}

const EvidenceItemCard = ({ item }: EvidenceItemCardProps) => {
  const relevancePercent = Math.round(item.relevance * 100);
  const relevanceColor =
    relevancePercent >= 80
      ? "text-green-600 dark:text-green-400"
      : relevancePercent >= 50
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-500 dark:text-zinc-400";

  return (
    <div className="px-4 py-3 border border-zinc-100 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.title}</h4>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 leading-relaxed">
            {item.summary}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={cn("text-xs font-medium", relevanceColor)}>{relevancePercent}%</span>
          {typeof item.metadata?.url === "string" && isSafeUrl(item.metadata.url) && (
            <a
              href={item.metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-indigo-500 transition-colors"
              onClick={(clickEvent) => clickEvent.stopPropagation()}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
      <div className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        {formatTimestamp(item.timestamp)}
      </div>
    </div>
  );
};

interface EvidenceGroupSectionProps {
  readonly group: EvidenceGroup;
}

const EvidenceGroupSection = ({ group }: EvidenceGroupSectionProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const { items, label, source } = group;
  const { length: itemCount } = items;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <ChevronRight
          className={cn(
            "w-4 h-4 text-zinc-400 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">({itemCount})</span>
      </button>
      {isOpen && (
        <div className="ml-6 space-y-2">
          {items.map((item) => (
            <EvidenceItemCard key={`${source}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== Main Component ====================

export const InvestigationEvidence = ({ evidence }: InvestigationEvidenceProps) => {
  const groups = useMemo(() => groupEvidenceBySources(evidence), [evidence]);
  const { length: evidenceCount } = evidence;

  if (evidenceCount < 1) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">No evidence collected yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <EvidenceGroupSection key={group.source} group={group} />
      ))}
    </div>
  );
};
