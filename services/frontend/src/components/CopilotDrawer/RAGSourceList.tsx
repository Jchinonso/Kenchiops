/**
 * RAGSourceList
 *
 * Collapsible section that displays RAG source citations used by the Copilot.
 * Appears between the message list and the input area.
 */

import { useState } from "react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatRAGSource } from "@/hooks/useCopilotChat";

interface RAGSourceListProps {
  readonly sources: readonly ChatRAGSource[];
}

const formatSimilarity = (similarity: number): string => `${Math.round(similarity * 100)}%`;

const RAGSourceItem = ({ source }: { readonly source: ChatRAGSource }) => (
  <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
    <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="truncate text-xs font-medium text-foreground">{source.title}</span>
      <div className="flex items-center gap-1.5">
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {source.docType}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {formatSimilarity(source.similarity)} match
        </span>
      </div>
    </div>
  </div>
);

export const RAGSourceList = ({ sources }: RAGSourceListProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { length: sourceCount } = sources;

  if (sourceCount === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-t">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-1.5">
          <span>Sources used</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            {sourceCount}
          </Badge>
        </div>
        <ChevronDown
          className={cn("size-3.5 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-1.5 px-4 pb-3">
          {sources.map((source) => (
            <RAGSourceItem key={`${source.title}-${source.docType}`} source={source} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
