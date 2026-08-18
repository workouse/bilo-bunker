# ─────────────────────────────────────────────────────────────────────────────
# Unified Production Dockerfile for Bilo Bunker
# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build Workspace (UI SPA & App Backend)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /workspace

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace configurations
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/app/package.json ./packages/app/
COPY packages/ui/package.json ./packages/ui/

# Install dependencies for all packages

RUN pnpm install --frozen-lockfile

# Copy full source tree
COPY . .

# Build UI and App packages
RUN pnpm --filter @bilo-bunker/ui build
RUN pnpm --filter @bilo-bunker/app build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production Runner
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Install su-exec for safe step-down to non-root user in entrypoint
RUN apk add --no-cache su-exec

# Create non-root user and persistent database volume directory
RUN addgroup -S bunker && adduser -S bunker -G bunker && \
    mkdir -p /data /app && chown -R bunker:bunker /data /app

WORKDIR /app

# Copy built package artifacts
COPY --from=builder /workspace/packages/app/package*.json ./
COPY --from=builder /workspace/packages/app/dist ./dist

# Copy built UI SPA static assets to /app/public
COPY --from=builder /workspace/packages/worker/public ./public

# Copy deployment and installer scripts
COPY --from=builder /workspace/scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Install production dependencies only
RUN npm install --omit=dev

# Fix permissions for bunker user
RUN chown -R bunker:bunker /app

# Persistent SQLite database mount
VOLUME ["/data"]

# Default environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/bunker.db

EXPOSE 3000

# Health check endpoint verification
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
