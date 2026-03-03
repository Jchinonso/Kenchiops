import type { PendingInvitationRowProps } from "./types";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { TimeDisplay } from "@/components/TimeDisplay";
import { TableRow, TableCell } from "@/components/ui/table";
import { Mail, Clock, X } from "lucide-react";
import { getRoleBadgeStyle } from "./constants";

export const PendingInvitationRow = ({
  invitation,
  canRevoke,
  isRevoking,
  onRevoke,
}: PendingInvitationRowProps) => {
  const isExpired = new Date(invitation.expiresAt) < new Date();

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {invitation.email}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Invited <TimeDisplay dateTime={invitation.createdAt} />
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("text-xs", getRoleBadgeStyle(invitation.role))}>
          {titleCase(invitation.role)}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          <Clock className="w-3.5 h-3.5" />
          {isExpired ? (
            <span className="text-red-500 dark:text-red-400">Expired</span>
          ) : (
            <span>
              Expires <TimeDisplay dateTime={invitation.expiresAt} />
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        {canRevoke ? (
          <button
            type="button"
            disabled={isRevoking}
            onClick={() => onRevoke(invitation)}
            className="p-1.5 rounded-md text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            aria-label={`Revoke invitation for ${invitation.email}`}
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </TableCell>
    </TableRow>
  );
};
