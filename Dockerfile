# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json ./services/api/
COPY services/slack-bot/package.json ./services/slack-bot/
COPY services/github-app/package.json ./services/github-app/
COPY services/incident-triage/package.json ./services/incident-triage/

# Install dependencies (use npm install for workspaces compatibility)
# Skip prepare scripts (husky) in Docker builds
RUN npm install --ignore-scripts

# Copy source files
COPY . .

# Build all packages using TypeScript project references (guarantees correct order)
# --force ensures full rebuild even if tsbuildinfo files are stale
RUN npx tsc --build --force

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json ./services/api/
COPY services/slack-bot/package.json ./services/slack-bot/
COPY services/github-app/package.json ./services/github-app/
COPY services/incident-triage/package.json ./services/incident-triage/

# Install production dependencies only (use npm install for workspaces)
# Skip prepare scripts (husky) in Docker builds
RUN npm install --omit=dev --ignore-scripts

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/services/slack-bot/dist ./services/slack-bot/dist
COPY --from=builder /app/services/github-app/dist ./services/github-app/dist
COPY --from=builder /app/services/incident-triage/dist ./services/incident-triage/dist

# Copy necessary files
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/api/package.json ./services/api/
COPY --from=builder /app/services/slack-bot/package.json ./services/slack-bot/
COPY --from=builder /app/services/github-app/package.json ./services/github-app/
COPY --from=builder /app/services/incident-triage/package.json ./services/incident-triage/

# Default to API service, can be overridden
ENV SERVICE=api
ENV NODE_ENV=production

# Expose port (default 3000, can be overridden)
EXPOSE 3000

# Health check — uses /ready to verify DB + Redis connectivity
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT:-3000}/ready', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["sh", "-c", "cd services/${SERVICE} && node dist/index.js"]

