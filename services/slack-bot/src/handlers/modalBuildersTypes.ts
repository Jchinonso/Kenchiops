/**
 * Modal Builders Types
 *
 * Type definitions for Slack modal view builders.
 */

/**
 * Repository option for selection
 */
export interface RepositoryOption {
  readonly fullName: string;
  readonly name: string;
}

/**
 * Repository mapping for unconfigure modal
 */
export interface RepositoryMapping {
  readonly repository: string;
  readonly channelId: string;
  readonly channelName: string | null;
}
