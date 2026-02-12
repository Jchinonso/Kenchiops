/**
 * Repository Select Handler Types
 *
 * Type definitions for repository selection and unconfiguration modals.
 */

/**
 * Private metadata stored in the modal
 */
export interface ModalMetadata {
  readonly channelId: string;
  readonly channelName: string;
  readonly messageTs?: string;
}

/**
 * View submission payload values
 */
export interface ViewValues {
  readonly repo_select_block?: {
    readonly [key: string]:
      | {
          readonly selected_option?: {
            readonly value: string;
          };
        }
      | undefined;
  };
}

/**
 * Simplified view submission args type
 */
export interface ViewSubmissionArgs {
  ack: () => Promise<void>;
  view: {
    private_metadata: string;
    id: string;
    state: {
      values: ViewValues;
    };
  };
  client: {
    auth: {
      test: () => Promise<{ team_id?: string }>;
    };
    chat: {
      postMessage: (args: { channel: string; text: string; mrkdwn?: boolean }) => Promise<void>;
      update: (args: {
        channel: string;
        ts: string;
        text: string;
        blocks?: unknown[];
      }) => Promise<void>;
    };
  };
  body: {
    user: {
      id: string;
    };
  };
}

/**
 * Unconfigure view submission values
 */
export interface UnconfigureViewValues {
  readonly unconfigure_select_block?: {
    readonly [key: string]:
      | {
          readonly selected_option?: {
            readonly value: string;
          };
        }
      | undefined;
  };
}

/**
 * View handler type that accepts unknown args.
 * This is necessary for Slack Bolt library interop.
 */
export type ViewHandler = (args: unknown) => Promise<void>;

/**
 * Slack app type for view handler registration.
 * Uses type assertion for Slack Bolt library interop.
 */
export interface SlackAppWithViews {
  readonly view: (callbackId: string, handler: ViewHandler) => void;
}
