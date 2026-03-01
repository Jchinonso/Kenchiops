/**
 * Team Management Page
 *
 * Displays organization members with role management and removal capabilities.
 * Only owners and admins can modify roles or remove members.
 * Enforces role hierarchy and last-owner protection.
 */

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useTeamMembers,
  useChangeRole,
  useRemoveMember,
  type TeamMemberDTO,
} from "@/hooks/useTeamMembers";
import { useSubscriptionUsage } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/formatters";
import { Progress } from "@/components/ui/progress";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  type InvitationDTO,
} from "@/hooks/useInvitations";
import {
  Users,
  MoreHorizontal,
  ShieldCheck,
  UserMinus,
  Github,
  ArrowLeft,
  UserPlus,
  Mail,
  Clock,
  X,
} from "lucide-react";

// ==================== Constants ====================

const ROLE_BADGE_STYLES: Readonly<Record<string, string>> = {
  owner:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  admin:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  member:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  viewer:
    "bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
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

// ==================== Pending Invitation Row ====================

interface PendingInvitationRowProps {
  readonly invitation: InvitationDTO;
  readonly canRevoke: boolean;
  readonly isRevoking: boolean;
  readonly onRevoke: (invitation: InvitationDTO) => void;
}

const PendingInvitationRow = ({
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

// ==================== Team Usage Gauge ====================

const UPGRADE_THRESHOLD = 90;

interface TeamUsageGaugeProps {
  readonly current: number;
  readonly limit: number | null;
}

const TeamUsageGauge = ({ current, limit }: TeamUsageGaugeProps) => {
  // Unlimited plan — no gauge needed
  if (limit === null || limit === 0) {
    return null;
  }

  const percent = Math.min(Math.round((current / limit) * 100), 100);
  const atLimit = current >= limit;
  const nearLimit = percent >= UPGRADE_THRESHOLD;

  const barColor = atLimit
    ? "[&>[data-slot=progress-indicator]]:bg-red-500"
    : nearLimit
      ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
      : "[&>[data-slot=progress-indicator]]:bg-indigo-500";

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Team Members</span>
        <span
          className={cn(
            "text-sm font-semibold",
            atLimit
              ? "text-red-600 dark:text-red-400"
              : nearLimit
                ? "text-amber-600 dark:text-amber-400"
                : "text-zinc-600 dark:text-zinc-400"
          )}
        >
          {current} / {limit}
        </span>
      </div>
      <Progress value={percent} className={cn("h-2", barColor)} />
      {nearLimit && (
        <div className="mt-3 flex items-center justify-between">
          <p
            className={cn(
              "text-xs",
              atLimit ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
            )}
          >
            {atLimit
              ? "You've reached the member limit for your plan."
              : `${percent}% of your member limit used.`}
          </p>
          <Link
            to="/dashboard/settings/plan"
            className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            Upgrade
          </Link>
        </div>
      )}
    </div>
  );
};

// ==================== Main Component ====================

export const TeamManagement = () => {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: members, isLoading, error } = useTeamMembers(refreshKey);
  const { changeRole, isLoading: isChangingRole, error: changeRoleError } = useChangeRole();
  const { removeMember, isLoading: isRemoving, error: removeError } = useRemoveMember();
  const { data: usage } = useSubscriptionUsage(refreshKey);

  // Invitation hooks
  const canInvite = hasPermission("members.invite");
  const canRevoke = hasPermission("members.remove");
  const { data: invitations } = useInvitations(refreshKey, canInvite);
  const {
    createInvitation,
    isLoading: isCreatingInvitation,
    error: createError,
  } = useCreateInvitation();
  const {
    revokeInvitation,
    isLoading: isRevokingInvitation,
    error: revokeError,
  } = useRevokeInvitation();

  const [roleDialogTarget, setRoleDialogTarget] = useState<TeamMemberDTO | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [removeDialogTarget, setRemoveDialogTarget] = useState<TeamMemberDTO | null>(null);

  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  // Revoke confirmation state
  const [revokeTarget, setRevokeTarget] = useState<InvitationDTO | null>(null);

  const currentUserRole = user?.role ?? "member";
  const memberCount = members?.length ?? 0;
  const pendingInvitations = invitations ?? [];

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

  // Invite dialog handlers
  const handleOpenInviteDialog = useCallback(() => {
    setInviteEmail("");
    setInviteRole("member");
    setInviteDialogOpen(true);
  }, []);

  const handleCloseInviteDialog = useCallback(() => {
    setInviteDialogOpen(false);
    setInviteEmail("");
    setInviteRole("member");
  }, []);

  const handleConfirmInvite = useCallback(async () => {
    if (!inviteEmail.trim()) {
      return;
    }

    const result = await createInvitation(inviteEmail.trim(), inviteRole);

    if (result) {
      toast.success(`Invitation sent to ${inviteEmail.trim()}`);
      setRefreshKey((prev) => prev + 1);
      handleCloseInviteDialog();
    } else {
      toast.error(createError ?? "Failed to send invitation");
    }
  }, [inviteEmail, inviteRole, createInvitation, createError, handleCloseInviteDialog]);

  // Revoke invitation handlers
  const handleOpenRevokeDialog = useCallback((invitation: InvitationDTO) => {
    setRevokeTarget(invitation);
  }, []);

  const handleCloseRevokeDialog = useCallback(() => {
    setRevokeTarget(null);
  }, []);

  const handleConfirmRevoke = useCallback(async () => {
    if (!revokeTarget) {
      return;
    }

    const success = await revokeInvitation(revokeTarget.id);

    if (success) {
      toast.success(`Invitation to ${revokeTarget.email} has been revoked`);
      setRefreshKey((prev) => prev + 1);
      handleCloseRevokeDialog();
    } else {
      toast.error(revokeError ?? "Failed to revoke invitation");
    }
  }, [revokeTarget, revokeInvitation, revokeError, handleCloseRevokeDialog]);

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
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-zinc-900 dark:text-zinc-100">
          Team
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {isLoading
            ? "Loading team members..."
            : `${memberCount} member${memberCount !== 1 ? "s" : ""} in your organization`}
        </p>
      </div>

      {usage && (
        <TeamUsageGauge
          current={usage.usage.teamMembers.current}
          limit={usage.usage.teamMembers.limit}
        />
      )}

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              <CardTitle>Members</CardTitle>
            </div>
            {canInvite && (
              <Button size="sm" onClick={handleOpenInviteDialog}>
                <UserPlus className="w-4 h-4" />
                Invite Member
              </Button>
            )}
          </div>
          <CardDescription>
            People in your organization. Members join automatically when they sign in via GitHub,
            GitLab, Bitbucket, or Azure DevOps.
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
              <Users className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                No members found
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations Section */}
      {canInvite && pendingInvitations.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-500" />
              <CardTitle>Pending Invitations</CardTitle>
            </div>
            <CardDescription>
              {pendingInvitations.length} pending invitation
              {pendingInvitations.length !== 1 ? "s" : ""} waiting for a response.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Expires</TableHead>
                  <TableHead className="text-right w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvitations.map((invitation) => (
                  <PendingInvitationRow
                    key={invitation.id}
                    invitation={invitation}
                    canRevoke={canRevoke}
                    isRevoking={isRevokingInvitation}
                    onRevoke={handleOpenRevokeDialog}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a Team Member</DialogTitle>
            <DialogDescription>
              Send an email invitation to join your organization. They will receive a link to accept
              the invitation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && inviteEmail.trim()) {
                    void handleConfirmInvite();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-role" className="w-full">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseInviteDialog}>
              Cancel
            </Button>
            <Button
              disabled={isCreatingInvitation || !inviteEmail.trim()}
              onClick={() => {
                handleConfirmInvite();
              }}
            >
              {isCreatingInvitation ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Invitation Dialog */}
      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseRevokeDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the invitation for{" "}
              <strong className="text-zinc-900 dark:text-zinc-100">{revokeTarget?.email}</strong>?
              They will no longer be able to join the organization with this invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRevokingInvitation}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmRevoke();
              }}
              className={cn(
                !isRevokingInvitation
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
              )}
            >
              {isRevokingInvitation ? "Revoking..." : "Revoke Invitation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <strong className="text-zinc-900 dark:text-zinc-100">
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
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
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
              <strong className="text-zinc-900 dark:text-zinc-100">
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
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed pointer-events-none"
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
