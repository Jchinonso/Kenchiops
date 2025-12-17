# GitHub App Service

This service handles GitHub webhook events for PRs, CI checks, and other repository events.

## Features

- Pull request webhook handling
- CI check run webhook handling
- GitHub API integration for posting comments

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (see root `.env.example`):
   - `GITHUB_APP_ID`
   - `GITHUB_APP_PRIVATE_KEY`
   - `GITHUB_INSTALLATION_ID` (can be extracted from webhook payload)

3. Configure GitHub App webhook URL to point to this service

4. Start the service:
   ```bash
   npm start
   ```

## TODO

- [ ] Implement OpenAI integration for PR analysis
- [ ] Implement CI failure analysis with OpenAI
- [ ] Add confidence scoring before posting comments
- [ ] Extract installation ID from webhook payloads
- [ ] Add retry logic for GitHub API calls
- [ ] Implement issue creation for critical failures
- [ ] Add integration tests

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects (like posting comments or creating issues) are handled by deterministic code after validation. Never execute LLM outputs directly.

