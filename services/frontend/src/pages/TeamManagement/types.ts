import type { InvitationDTO } from "@/hooks/useInvitations";
import type { TeamMemberDTO } from "@/hooks/useTeamMembers";

export interface MemberAvatarProps {
  readonly member: TeamMemberDTO;
}

export interface MemberRowProps {
  readonly member: TeamMemberDTO;
  readonly currentUserId: string | undefined;
  readonly currentUserRole: string;
  readonly onChangeRole: (member: TeamMemberDTO) => void;
  readonly onRemove: (member: TeamMemberDTO) => void;
}

export interface InviteDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly inviteEmail: string;
  readonly onEmailChange: (value: string) => void;
  readonly inviteRole: string;
  readonly onRoleChange: (value: string) => void;
  readonly assignableRoles: readonly string[];
  readonly isCreating: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export interface RevokeDialogProps {
  readonly revokeTarget: InvitationDTO | null;
  readonly isRevoking: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export interface RoleChangeDialogProps {
  readonly roleDialogTarget: TeamMemberDTO | null;
  readonly selectedRole: string;
  readonly onRoleChange: (value: string) => void;
  readonly assignableRoles: readonly string[];
  readonly isChangingRole: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export interface RemoveMemberDialogProps {
  readonly removeDialogTarget: TeamMemberDTO | null;
  readonly isRemoving: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export interface PendingInvitationRowProps {
  readonly invitation: InvitationDTO;
  readonly canRevoke: boolean;
  readonly isRevoking: boolean;
  readonly onRevoke: (invitation: InvitationDTO) => void;
}

export interface TeamUsageGaugeProps {
  readonly current: number;
  readonly limit: number | null;
}
