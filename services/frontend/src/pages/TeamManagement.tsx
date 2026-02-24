/**
 * Team Management Page
 *
 * Displays organization members with role management and removal capabilities.
 * Only owners and admins can modify roles or remove members.
 * Enforces role hierarchy and last-owner protection.
 */

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeamMembers,
  useChangeRole,
  useRemoveMember,
  type TeamMemberDTO,
} from "@/hooks/useTeamMembers";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { TimeDisplay } from "@/components/TimeDisplay";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "react-router-dom";
import { Users, MoreHorizontal, ShieldCheck, UserMinus, Github, ArrowLeft } from "lucide-react";

// ==================== Constants ====================

const ROLE_BADGE_STYLES: Readonly<Record<string, string>> = {
  owner:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  admin:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  member:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  viewer:
    "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
};

const getRoleBadgeStyle = (role: string): string =>
  ROLE_BADGE_STYLES[role] ?? ROLE_BADGE_STYLES.viewer;

const ASSIGNABLE_ROLES = ["owner", "admin", "member", "viewer"] as const;

const ROLE_WEIGHT: Readonly<Record<string, number>> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

// ==================== Sub-components ====================

interface MemberAvatarProps {
  readonly member: TeamMemberDTO;
}

const MemberAvatar = ({ member }: MemberAvatarProps) => {
  const initials = member.displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return member.avatarUrl ? (
    <img
      src={member.avatarUrl}
      alt={member.displayName}
      className="w-8 h-8 rounded-full flex-shrink-0"
    />
  ) : (
    <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
      <span className="text-white font-medium text-xs">{initials}</span>
    </div>
  );
};

interface MemberRowProps {
  readonly member: TeamMemberDTO;
  readonly currentUserId: string | undefined;
  readonly currentUserRole: string;
  readonly onChangeRole: (member: TeamMemberDTO) => void;
  readonly onRemove: (member: TeamMemberDTO) => void;
}

const MemberRow = ({
  member,
  currentUserId,
  currentUserRole,
  onChangeRole,
  onRemove,
}: MemberRowProps) => {
  const isSelf = member.userId === currentUserId;
  const canManage = !isSelf && (currentUserRole === "owner" || currentUserRole === "admin");
  const canModify =
    canManage && (ROLE_WEIGHT[currentUserRole] ?? 0) >= (ROLE_WEIGHT[member.role] ?? 0);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {member.displayName}
              {isSelf && (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">(you)</span>
              )}
            </p>
            {member.email && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
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
        <span className="text-sm text-gray-500 dark:text-gray-400">
          <TimeDisplay dateTime={member.joinedAt} />
        </span>
      </TableCell>
      <TableCell className="text-right">
        {canModify ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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

const LoadingSkeleton = () => (
  <div className="space-y-3 p-4">
    {Array.from({ length: 4 }, (_, index) => (
      <div key={index} className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
    ))}
  </div>
);

// ==================== Main Component ====================

export const TeamManagement = () => {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: members, isLoading, error } = useTeamMembers(refreshKey);
  const { changeRole, isLoading: isChangingRole, error: changeRoleError } = useChangeRole();
  const { removeMember, isLoading: isRemoving, error: removeError } = useRemoveMember();

  const [roleDialogTarget, setRoleDialogTarget] = useState<TeamMemberDTO | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [removeDialogTarget, setRemoveDialogTarget] = useState<TeamMemberDTO | null>(null);

  const currentUserRole = user?.role ?? "member";
  const memberCount = members?.length ?? 0;

  const handleOpenRoleDialog = useCallback((member: TeamMemberDTO) => {
    setRoleDialogTarget(member);
    setSelectedRole(member.role);
  }, []);

  const handleCloseRoleDialog = useCallback(() => {
    setRoleDialogTarget(null);
    setSelectedRole("");
  }, []);

  const handleConfirmRoleChange = useCallback(async () => {
    if (!roleDialogTarget || !selectedRole) {
      return;
    }

    const result = await changeRole(roleDialogTarget.userId, selectedRole);

    if (result) {
      toast.success(`${roleDialogTarget.displayName}'s role changed to ${titleCase(selectedRole)}`);
      setRefreshKey((prev) => prev + 1);
      handleCloseRoleDialog();
    } else {
      toast.error(changeRoleError ?? "Failed to change role");
    }
  }, [roleDialogTarget, selectedRole, changeRole, changeRoleError, handleCloseRoleDialog]);

  const handleOpenRemoveDialog = useCallback((member: TeamMemberDTO) => {
    setRemoveDialogTarget(member);
  }, []);

  const handleCloseRemoveDialog = useCallback(() => {
    setRemoveDialogTarget(null);
  }, []);

  const handleConfirmRemove = useCallback(async () => {
    if (!removeDialogTarget) {
      return;
    }

    const success = await removeMember(removeDialogTarget.userId);

    if (success) {
      toast.success(`${removeDialogTarget.displayName} has been removed from the organization`);
      setRefreshKey((prev) => prev + 1);
      handleCloseRemoveDialog();
    } else {
      toast.error(removeError ?? "Failed to remove member");
    }
  }, [removeDialogTarget, removeMember, removeError, handleCloseRemoveDialog]);

  // Filter roles that the current user can assign (cannot assign roles above their own)
  const assignableRoles = useMemo(
    () =>
      ASSIGNABLE_ROLES.filter(
        (role) => (ROLE_WEIGHT[currentUserRole] ?? 0) >= (ROLE_WEIGHT[role] ?? 0)
      ),
    [currentUserRole]
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          to="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Team</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {isLoading
            ? "Loading team members..."
            : `${memberCount} member${memberCount !== 1 ? "s" : ""} in your organization`}
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            <CardTitle>Members</CardTitle>
          </div>
          <CardDescription>
            People in your organization. Members join automatically via GitHub OAuth.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="p-6 text-center">
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            </div>
          ) : members && members.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden sm:table-cell">Provider</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead className="text-right w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    currentUserId={user?.id}
                    currentUserRole={currentUserRole}
                    onChangeRole={handleOpenRoleDialog}
                    onRemove={handleOpenRemoveDialog}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-6 text-center">
              <Users className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No members found
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Role Dialog */}
      <AlertDialog
        open={roleDialogTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseRoleDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Role</AlertDialogTitle>
            <AlertDialogDescription>
              Change the role for{" "}
              <strong className="text-gray-900 dark:text-gray-100">
                {roleDialogTarget?.displayName}
              </strong>
              . This will update their permissions within the organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {titleCase(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isChangingRole || !selectedRole || selectedRole === roleDialogTarget?.role}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmRoleChange();
              }}
              className={cn(
                selectedRole && selectedRole !== roleDialogTarget?.role && !isChangingRole
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed pointer-events-none"
              )}
            >
              {isChangingRole ? "Updating..." : "Update Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Dialog */}
      <AlertDialog
        open={removeDialogTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseRemoveDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <strong className="text-gray-900 dark:text-gray-100">
                {removeDialogTarget?.displayName}
              </strong>{" "}
              from the organization? They will lose access to all organization resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmRemove();
              }}
              className={cn(
                !isRemoving
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed pointer-events-none"
              )}
            >
              {isRemoving ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
