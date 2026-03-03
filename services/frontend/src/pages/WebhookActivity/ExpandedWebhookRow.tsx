import { useState, useCallback } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { titleCase, formatTimestamp } from "@/lib/formatters";
import { formatDuration } from "./helpers";
import type { ExpandedWebhookRowProps } from "./types";

export const ExpandedWebhookRow = ({ activity }: ExpandedWebhookRowProps) => {
  const hasError = activity.errorMessage !== null && activity.errorMessage.length > 0;
  const hasMetadata = Object.keys(activity.metadata).length > 0;
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyDeliveryId = useCallback(async () => {
    await navigator.clipboard.writeText(activity.deliveryId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }, [activity.deliveryId]);

  const details: ReadonlyArray<readonly [string, string]> = [
    ["Delivery ID", activity.deliveryId],
    ["Event Type", activity.eventType],
    ["Source", titleCase(activity.source)],
    ["Status", titleCase(activity.status)],
    ["Processing Time", formatDuration(activity.processingTimeMs)],
    ["Received At", formatTimestamp(activity.createdAt)],
  ];

  return (
    <TableRow className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
      <TableCell colSpan={7} className="bg-zinc-50 dark:bg-zinc-800/50 border-b p-0">
        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Delivery Details
              </h4>
              <button
                type="button"
                onClick={handleCopyDeliveryId}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-indigo-500 dark:text-zinc-500 dark:hover:text-indigo-400 transition-colors"
              >
                {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedId ? "Copied!" : "Copy ID"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {details.map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
                    {label}:
                  </span>
                  <span
                    className={cn(
                      "text-sm text-zinc-900 dark:text-zinc-100",
                      label === "Delivery ID" && "font-mono text-xs break-all"
                    )}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {hasError && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Error Message
              </h4>
              <p className="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap break-words">
                {(activity.errorMessage ?? "").length > 500
                  ? `${(activity.errorMessage ?? "").slice(0, 500)}...`
                  : activity.errorMessage}
              </p>
            </div>
          )}

          {hasMetadata && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Metadata
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {Object.entries(activity.metadata).map(([label, value]) => (
                  <div key={label} className="flex items-baseline gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">
                      {label}:
                    </span>
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">
                      {typeof value === "string" ? value : JSON.stringify(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};
