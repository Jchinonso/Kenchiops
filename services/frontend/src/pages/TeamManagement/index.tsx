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
import { titleCase } from "@/lib/formatters";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableHead, TableBody, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  useInvitations,
  useCreateInvitation,
  useRevokeInvitation,
  type InvitationDTO,
} from "@/hooks/useInvitations";
import { Users, ArrowLeft, UserPlus, Mail } from "lucide-react";
import { ASSIGNABLE_ROLES, ROLE_WEIGHT } from "./constants";
import { MemberRow } from "./MemberRow";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { PendingInvitationRow } from "./PendingInvitationRow";
import { TeamUsageGauge } from "./TeamUsageGauge";
import { InviteDialog } from "./InviteDialog";
import { RevokeDialog } from "./RevokeDialog";
import { RoleChangeDialog } from "./RoleChangeDialog";
import { RemoveMemberDialog } from "./RemoveMemberDialog";

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
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      return;
    }

    // Basic email format validation (defense-in-depth; server also validates)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const result = await createInvitation(trimmedEmail, inviteRole);

    if (result) {
      toast.success(`Invitation sent to ${trimmedEmail}`);
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

      <InviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        inviteEmail={inviteEmail}
        onEmailChange={setInviteEmail}
        inviteRole={inviteRole}
        onRoleChange={setInviteRole}
        assignableRoles={assignableRoles}
        isCreating={isCreatingInvitation}
        onClose={handleCloseInviteDialog}
        onConfirm={handleConfirmInvite}
      />

      <RevokeDialog
        revokeTarget={revokeTarget}
        isRevoking={isRevokingInvitation}
        onClose={handleCloseRevokeDialog}
        onConfirm={handleConfirmRevoke}
      />

      <RoleChangeDialog
        roleDialogTarget={roleDialogTarget}
        selectedRole={selectedRole}
        onRoleChange={setSelectedRole}
        assignableRoles={assignableRoles}
        isChangingRole={isChangingRole}
        onClose={handleCloseRoleDialog}
        onConfirm={handleConfirmRoleChange}
      />

      <RemoveMemberDialog
        removeDialogTarget={removeDialogTarget}
        isRemoving={isRemoving}
        onClose={handleCloseRemoveDialog}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
};
