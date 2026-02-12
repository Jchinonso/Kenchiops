/**
 * OAuth State Operations
 *
 * CSRF state token management for OAuth flows.
 *
 * @module database/user/oauthState
 */

import crypto from "node:crypto";
import {
  query,
  createLogger,
  getErrorMessage,
  validateNonEmptyString,
  OAUTH_STATE_QUERIES,
} from "../common.js";
import { OAUTH_STATE_CONFIG } from "../../constants/index.js";
import type { OAuthStateRow, OAuthState, OAuthStateInput } from "./types.js";
import { extractOAuthState } from "./helpers.js";

const logger = createLogger("oauth-state");

export const createOAuthState = async (input: OAuthStateInput): Promise<string> => {
  const stateToken = crypto.randomBytes(OAUTH_STATE_CONFIG.STATE_TOKEN_BYTES).toString("hex");

  try {
    await query<OAuthStateRow>(OAUTH_STATE_QUERIES.INSERT, [
      stateToken,
      input.provider,
      input.instanceUrl,
      input.redirectAfter,
      JSON.stringify(input.metadata ?? {}),
    ]);

    logger.debug("OAuth state created", {
      provider: input.provider,
      instanceUrl: input.instanceUrl ? "[self-hosted]" : null,
    });

    return stateToken;
  } catch (error) {
    logger.error("Failed to create OAuth state", {
      provider: input.provider,
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const consumeOAuthState = async (stateToken: string): Promise<OAuthState | null> => {
  validateNonEmptyString(stateToken, "stateToken");

  try {
    const result = await query<OAuthStateRow>(OAUTH_STATE_QUERIES.CONSUME, [stateToken]);
    const state = extractOAuthState(result.rows);

    if (state) {
      logger.debug("OAuth state consumed", {
        provider: state.provider,
      });
    } else {
      logger.warn("OAuth state not found or expired", {
        stateTokenPrefix: stateToken.slice(0, 8),
      });
    }

    return state;
  } catch (error) {
    logger.error("Failed to consume OAuth state", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};

export const cleanupExpiredStates = async (): Promise<number> => {
  try {
    const result = await query(OAUTH_STATE_QUERIES.CLEANUP_EXPIRED, []);
    const count = result.rowCount ?? 0;

    if (count > 0) {
      logger.info("Cleaned up expired OAuth states", { count });
    }

    return count;
  } catch (error) {
    logger.error("Failed to cleanup expired OAuth states", {
      error: getErrorMessage(error),
    });
    throw error;
  }
};
