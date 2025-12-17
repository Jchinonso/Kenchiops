# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/*/package.json ./services/*/

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build all packages
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY services/*/package.json ./services/*/

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/services/*/dist ./services/*/dist

# Copy necessary files
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/services/*/package.json ./services/*/

# Default to API service, can be overridden
ENV SERVICE=api
ENV NODE_ENV=production

# Expose port (default 3000, can be overridden)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["sh", "-c", "cd services/${SERVICE} && node dist/index.js"]

