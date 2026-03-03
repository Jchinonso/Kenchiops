/**
 * Shared types for GitLab integration components.
 */

export interface GitLabConnectionStatus {
  readonly connected: boolean;
  readonly connectionId: string | null;
  readonly webhookUrl: string | null;
  readonly connectedAt: string | null;
  readonly instanceUrl: string | null;
}

export interface GitLabConnectResponse {
  readonly connectionId: string;
  readonly webhookUrl: string;
  readonly webhookSecret: string;
  readonly status: "connected";
}

export interface ConnectionCardProps {
  readonly name: string;
  readonly icon: React.ReactNode;
  readonly connected: boolean;
  readonly actionLabel: string;
  readonly actionHref: string;
  readonly external?: boolean;
}

export interface GitLabCardProps {
  readonly tenantId: string;
  readonly otherProviderConnected: boolean;
}

export interface GitLabSecretDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly webhookUrl: string;
  readonly webhookSecret: string;
}
