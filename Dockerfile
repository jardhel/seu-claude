# seu-claude Dockerfile
# Multi-stage build for minimal production image

# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

# Build TypeScript
RUN npm run build

# Download grammars
RUN npm run download-grammars || true

# Stage 2: Production
FROM node:20-slim AS production

# Security: Run as non-root user
RUN groupadd --gid 1000 nodejs \
    && useradd --uid 1000 --gid nodejs --shell /bin/bash --create-home nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/languages ./languages

# Copy documentation
COPY README.md LICENSE CHANGELOG.md ./

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Entry point
ENTRYPOINT ["node", "dist/index.js"]

# Labels
LABEL org.opencontainers.image.title="seu-claude"
LABEL org.opencontainers.image.description="Local Codebase RAG MCP Server for Claude Code"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/jardhel/seu-claude"
LABEL org.opencontainers.image.licenses="MIT"
