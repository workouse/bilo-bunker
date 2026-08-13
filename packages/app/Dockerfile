# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — builder
# Compiles TypeScript to JavaScript. Nothing from this stage ends up in the
# final image except the compiled output in /build/dist.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Install dependencies first so this layer is cached when only src changes.
COPY package*.json ./
RUN npm install

# Copy source and compile.
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runner
# Minimal production image. Only production deps + compiled dist are included.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# Non-root user for container security.
RUN addgroup -S bunker && adduser -S bunker -G bunker

WORKDIR /app

# Install production dependencies only.
COPY package*.json ./
RUN npm install --omit=dev

# Pull the compiled output from the builder stage.
COPY --from=builder /build/dist ./dist

# SQLite database lives here. Mount a named volume so data persists across
# container rebuilds and deployments.
VOLUME ["/data"]

# Node.js HTTP server port (matches PORT env var default).
EXPOSE 3000

# Lightweight health check used by Docker and the deploy script.
# wget is available on alpine; curl is not installed by default.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Drop root privileges before starting the process.
USER bunker

CMD ["node", "dist/index.js"]
