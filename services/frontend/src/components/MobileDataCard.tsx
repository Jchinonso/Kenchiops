/**
 * MobileDataCard
 *
 * Reusable card component for rendering data items on mobile screens.
 * Replaces table rows with a touch-friendly stacked layout.
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeDisplay } from "@/components/TimeDisplay";

interface MobileDataCardBadge {
  readonly label: string;
  readonly className: string;
}

interface MobileDataCardField {
  readonly label: string;
  readonly value: React.ReactNode;
}

interface MobileDataCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly timestamp?: string;
  readonly badges?: readonly MobileDataCardBadge[];
  readonly fields?: readonly MobileDataCardField[];
  readonly onClick?: () => void;
  readonly isExpanded?: boolean;
  readonly actions?: React.ReactNode;
  readonly expandedContent?: React.ReactNode;
  readonly className?: string;
}

export const MobileDataCard = ({
  title,
  subtitle,
  timestamp,
  badges,
  fields,
  onClick,
  isExpanded,
  actions,
  expandedContent,
  className,
}: MobileDataCardProps) => (
  <div
    className={cn(
      "border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 transition-colors",
      onClick && "cursor-pointer active:bg-zinc-50 dark:active:bg-zinc-800",
      className
    )}
  >
    <div
      className={cn("p-4", onClick && "min-h-[44px]")}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? "button" : undefined}
    >
      {/* Header row: title + timestamp + chevron */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{title}</p>
          {subtitle && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {timestamp && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              <TimeDisplay dateTime={timestamp} />
            </span>
          )}
          {onClick && (
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "w-4 h-4 text-zinc-400 transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          )}
        </div>
      </div>

      {/* Badges row */}
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {badges.map((badge, badgeIndex) => (
            <span
              key={`${badgeIndex}-${badge.label}`}
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                badge.className
              )}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {/* Key-value fields */}
      {fields && fields.length > 0 && (
        <div className="mt-2 space-y-1">
          {fields.map((field) => (
            <div key={field.label} className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0">{field.label}:</span>
              <span className="text-zinc-600 dark:text-zinc-300 truncate">{field.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions && <div className="mt-3 flex items-center gap-2">{actions}</div>}
    </div>

    {/* Expanded content */}
    {isExpanded && expandedContent && (
      <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-b-lg">
        {expandedContent}
      </div>
    )}
  </div>
);
