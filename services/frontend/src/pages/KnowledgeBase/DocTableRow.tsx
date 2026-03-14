import { TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { formatTimestamp, formatSnakeCase, truncateText } from "@/lib/formatters";
import { isSafeUrl } from "@/lib/urlSafety";
import type { KnowledgeDocDTO } from "@/hooks/useKnowledgeBase";

interface DocTableRowProps {
  readonly doc: KnowledgeDocDTO;
}

export const DocTableRow = ({ doc }: DocTableRowProps) => (
  <TableRow>
    <TableCell className="max-w-[300px]">
      <div className="flex items-center gap-2">
        <span
          className="text-sm text-zinc-900 dark:text-zinc-100"
          title={truncateText(doc.title, 100)}
        >
          {truncateText(doc.title, 60)}
        </span>
        {/* SECURITY (VULN-703): Validate URL protocol before rendering as link */}
        {doc.sourceUrl && isSafeUrl(doc.sourceUrl) && (
          <a
            href={doc.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open source for ${truncateText(doc.title, 30)} in new tab`}
            className="text-zinc-400 hover:text-indigo-500 transition-colors flex-shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </TableCell>
    <TableCell>
      <Badge variant="secondary" className="text-xs">
        {formatSnakeCase(doc.docType)}
      </Badge>
    </TableCell>
    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
      {doc.repository ?? "--"}
    </TableCell>
    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 max-w-[200px]">
      <span title={truncateText(doc.content, 100)}>{truncateText(doc.content, 50)}</span>
    </TableCell>
    <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
      {formatTimestamp(doc.createdAt)}
    </TableCell>
  </TableRow>
);
