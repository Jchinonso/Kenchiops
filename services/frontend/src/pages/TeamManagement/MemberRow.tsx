import { usePermissions } from "@/hooks/usePermissions";
import type { MemberRowProps } from "./types";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { TimeDisplay } from "@/components/TimeDisplay";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ShieldCheck, UserMinus, Github } from "lucide-react";
import { MemberAvatar } from "./MemberAvatar";
import { getRoleBadgeStyle, ROLE_WEIGHT } from "./constants";

export const MemberRow = ({
  member,
  currentUserId,
  currentUserRole,
  onChangeRole,
  onRemove,
}: MemberRowProps) => {
  const { hasPermission } = usePermissions();
  const isSelf = member.userId === currentUserId;
  const canManage = !isSelf && hasPermission("team.manage");
  const canModify =
    canManage && (ROLE_WEIGHT[currentUserRole] ?? 0) >= (ROLE_WEIGHT[member.role] ?? 0);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
              {member.displayName}
              {isSelf && (
                <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">(you)</span>
              )}
            </p>
            {member.email && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{member.email}</p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          {member.providers.map((providerInfo) => (
            <Badge key={providerInfo.provider} variant="outline" className="text-xs gap-1">
              <Github className="w-3 h-3" />
              {providerInfo.username ?? titleCase(providerInfo.provider)}
            </Badge>
          ))}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("text-xs", getRoleBadgeStyle(member.role))}>
          {titleCase(member.role)}
        </Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          <TimeDisplay dateTime={member.joinedAt} />
        </span>
      </TableCell>
      <TableCell className="text-right">
        {canModify ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label={`Actions for ${member.displayName}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onChangeRole(member)}>
                <ShieldCheck className="w-4 h-4 mr-2" />
                Change Role
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onRemove(member)}
                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
              >
                <UserMinus className="w-4 h-4 mr-2" />
                Remove Member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  );
};
