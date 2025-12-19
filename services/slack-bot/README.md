# Slack Bot Service

This service handles Slack interactions for the AI-driven DevOps assistant.

## Features

- Slash command handler (`/kenchi`)
- Message event handling
- App mention handling

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables (see root `.env.example`):
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`

3. Start the service:
   ```bash
   npm start
   ```

## TODO

- [ ] Implement actual OpenAI integration for command/message analysis
- [ ] Add confidence scoring before executing actions
- [ ] Implement deterministic action execution based on LLM suggestions
- [ ] Add channel filtering and permission checks
- [ ] Add retry logic for external API calls
- [ ] Add integration tests

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects (like running commands or altering state) are handled by deterministic code after validation. Never execute LLM outputs directly.
