# ============================================================================
# MARSAD BACKEND - NESTJS DOCKERFILE
# Multi-stage build with development and production configurations
# ============================================================================

# ============================================================================
# STAGE 1: DEPENDENCIES
# Install dependencies in an isolated layer for better caching
# ============================================================================
FROM node:18-alpine AS dependencies
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci --only=production && \
    cp -R node_modules /prod_node_modules && \
    npm ci

# ============================================================================
# STAGE 2: BUILDER
# Build TypeScript and prepare production assets
# ============================================================================
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/prisma ./prisma

# Copy source code
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Generate Prisma client
RUN npx prisma generate

# ============================================================================
# STAGE 3: RUNTIME - PRODUCTION
# Final production image with only necessary files
# ============================================================================
FROM node:18-alpine AS production
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Copy production dependencies
COPY --from=dependencies /prod_node_modules ./node_modules

# Copy Prisma files
COPY --from=builder /app/prisma ./prisma

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Change ownership of app files
RUN chown -R nestjs:nodejs /app

USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/main.js"]

EXPOSE 3000

# ============================================================================
# STAGE 4: DEVELOPMENT
# Development image with hot-reload and debugging capabilities
# ============================================================================
FROM node:18-alpine AS development
WORKDIR /app

# Install development tools
RUN apk add --no-cache \
    git \
    dumb-init \
    curl

# Set environment to development
ENV NODE_ENV=development
ENV PORT=3000

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy Prisma files
COPY prisma ./prisma

# Copy source code and config
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

RUN chown -R nestjs:nodejs /app

USER nestjs

# Expose ports for app and debugging
EXPOSE 3000 9229

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Start with ts-node for development with hot-reload
CMD ["npm", "run", "start:dev"]
