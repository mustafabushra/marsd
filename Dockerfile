# ============================================================================
# MARSAD FRONTEND - VITE DOCKERFILE
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

# Install dependencies
RUN npm ci

# ============================================================================
# STAGE 2: BUILDER
# Build Vite application for production
# ============================================================================
FROM node:18-alpine AS builder
WORKDIR /app

# Copy dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and configuration
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY src ./src
COPY public ./public 2>/dev/null || true

# Build application
RUN npm run build

# ============================================================================
# STAGE 3: RUNTIME - PRODUCTION
# Production image with Nginx serving the built application
# ============================================================================
FROM nginx:1.25-alpine AS production
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy Nginx configuration for SPA
COPY nginx.conf /etc/nginx/nginx.conf
COPY nginx-default.conf /etc/nginx/conf.d/default.conf

# Copy built application from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user for security
RUN addgroup -g 101 -S nginx 2>/dev/null || true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]

# ============================================================================
# STAGE 4: DEVELOPMENT
# Development image with hot-reload capabilities using Vite dev server
# ============================================================================
FROM node:18-alpine AS development
WORKDIR /app

# Install development tools
RUN apk add --no-cache \
    git \
    curl

# Copy dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy source code and configuration
COPY package*.json ./
COPY vite.config.js ./
COPY index.html ./
COPY src ./src
COPY public ./public 2>/dev/null || true

# Create non-root user
RUN addgroup -g 1001 -S node && \
    adduser -S node -u 1001

RUN chown -R node:node /app

USER node

# Expose port for dev server
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Start Vite dev server
CMD ["npm", "run", "dev"]
