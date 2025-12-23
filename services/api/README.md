# API Service

This service handles incoming webhooks and events from various sources.

## Features

- Generic webhook endpoint (`/webhook/:source`)
- Event ingestion endpoint (`/events`) with request validation
- Health check endpoint with detailed status
- Rate limiting (100 requests/minute per IP)
- Structured logging
- Error handling middleware

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment variables (see root `.env.example`)

3. Start the service:
   ```bash
   npm start
   ```

## TODO

- [ ] Implement webhook routing and handlers
- [ ] Add authentication/authorization middleware
- [ ] Implement event storage (database/vector store)
- [ ] Add more comprehensive event validation schemas
- [ ] Add API documentation (Swagger UI)
- [ ] Add integration tests

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects are handled by deterministic code after validation. Never execute LLM outputs directly.
