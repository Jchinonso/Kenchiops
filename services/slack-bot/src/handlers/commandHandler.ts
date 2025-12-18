/**
 * Handler for Slack slash commands.
 * Processes /kenchi commands and returns AI analysis.
 */

import type { SlashCommand, RespondFn } from '@slack/bolt';
import { logger, OpenAIClient, calculateConfidenceScore } from '@kenchi/shared';
import type { Event, Evidence, ActionProposal, ActionType } from '@kenchi/shared';
import { formatAnalysisMessage, formatActionButtons, formatErrorMessage } from '../formatters.js';
import type { SlackCommandPayload } from '../types/slackTypes.js';

/**
 * Creates an Event from a Slack command.
 * 
 * @param command - Slack command object
 * @returns Event object
 */
function createEventFromCommand(command: SlashCommand): Event {
  return {
    id: `evt_${Date.now()}_${command.user_id}`,
    type: 'MANUAL_TRIGGER',
    source: 'slack',
    timestamp: new Date().toISOString(),
    severity: 'medium',
    title: 'Slack Command Analysis',
    payload: {
      command: command.text,
      user_id: command.user_id,
      channel_id: command.channel_id,
    } as SlackCommandPayload,
    metadata: {
      triggeredBy: command.user_id,
    },
  };
}

/**
 * Creates minimal evidence for command analysis.
 * 
 * @param eventId - Event ID
 * @returns Evidence object
 */
function createMinimalEvidence(eventId: string): Evidence {
  return {
    eventId,
    collectedAt: new Date().toISOString(),
    logs: [],
  };
}

/**
 * Handles /kenchi slash command.
 * 
 * @param command - Slack command object
 * @param ack - Acknowledge function
 * @param respond - Respond function
 */
export async function handleKenchiCommand(
  command: SlashCommand,
  ack: () => Promise<void>,
  respond: RespondFn
): Promise<void> {
  await ack();

  logger.info('Slack command received', {
    command: command.text,
    user: command.user_id,
    channel: command.channel_id,
  });

  try {
    const event = createEventFromCommand(command);
    const evidence = createMinimalEvidence(event.id);

    const openaiClient = new OpenAIClient();
    const analysis = await openaiClient.analyzeIncident(event, evidence);
    const confidenceResult = calculateConfidenceScore(analysis, evidence);

    logger.info('Analysis completed', {
      eventId: event.id,
      confidence: confidenceResult.finalScore,
      gating: confidenceResult.gatingDecision,
    });

    const blocks: unknown[] = [...formatAnalysisMessage(analysis, confidenceResult)];

    if (analysis.recommendedActions && analysis.recommendedActions.length > 0) {
      const actionButtons = formatActionButtons(
        analysis.recommendedActions.map((action, idx): ActionProposal => ({
          id: `action_${idx}`,
          eventId: event.id,
          actionType: action.actionType as ActionType,
          description: action.description,
          safetyLevel: 'medium_risk' as const,
          status: 'proposed' as const,
          priority: action.priority,
          reasoning: action.reasoning || '',
          confidence: confidenceResult.finalScore,
          requiresApproval: true,
          createdAt: new Date().toISOString(),
        })),
        event.id
      );
      blocks.push(...actionButtons);
    }

    await respond({
      blocks: blocks as never,
      response_type: 'ephemeral',
    });
  } catch (error) {
    logger.error('Error processing Slack command', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    await respond({
      blocks: formatErrorMessage(error instanceof Error ? error : new Error('Unknown error')) as never,
      response_type: 'ephemeral',
    });
  }
}

