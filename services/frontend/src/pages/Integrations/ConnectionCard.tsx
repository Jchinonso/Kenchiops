/**
 * Generic connection card for displaying an integration's status and action button.
 */

import { CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import type { ConnectionCardProps } from "./types";

export const ConnectionCard = ({
  name,
  icon,
  connected,
  actionLabel,
  actionHref,
  external,
}: ConnectionCardProps) => (
  <div className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
    <div className="flex items-center gap-3">
      {icon}
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {connected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs text-green-600 dark:text-green-400">Connected</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Not connected</span>
            </>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2">
      {external ? (
        <a
          href={actionHref}
          target={actionHref.startsWith("http") ? "_blank" : undefined}
          rel={actionHref.startsWith("http") ? "noopener noreferrer" : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          {actionLabel}
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        !connected && <span className="text-xs text-zinc-400">Coming soon</span>
      )}
    </div>
  </div>
);
