#!/bin/bash

################################################################################
# Docker Build Script
#
# Builds Docker images for Marsad services
# - Backend API (NestJS)
# - Frontend (React/Next.js)
# - Worker (BullMQ)
#
# Usage: ./docker-build.sh [environment]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
VCS_REF=$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Configuration
AWS_REGION="${AWS_REGION:-eu-central-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com}"
IMAGE_TAG="${ENVIRONMENT}-${VCS_REF}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

error() {
    echo -e "${RED}[✗]${NC} $*"
}

################################################################################
# Docker Configuration
################################################################################

# Common build args for all images
COMMON_BUILD_ARGS="
  --build-arg BUILD_DATE=$BUILD_DATE
  --build-arg VCS_REF=$VCS_REF
  --build-arg VERSION=1.0.0
  --label org.opencontainers.image.created=$BUILD_DATE
  --label org.opencontainers.image.revision=$VCS_REF
"

################################################################################
# Backend API Image
################################################################################

build_backend_image() {
    log "Building backend API image..."

    local dockerfile="$PROJECT_ROOT/backend/Dockerfile"
    local image_name="marsad-api"
    local image_url="${DOCKER_REGISTRY}/${image_name}"
    local full_image_tag="${image_url}:${IMAGE_TAG}"
    local latest_tag="${image_url}:latest"

    # Create Dockerfile if it doesn't exist
    if [[ ! -f "$dockerfile" ]]; then
        log "Creating Dockerfile for backend..."
        cat > "$dockerfile" <<'EOF'
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build application
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Entrypoint
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
EOF
        success "Dockerfile created for backend"
    fi

    log "Building Docker image: $full_image_tag"

    docker build \
        --progress=plain \
        $COMMON_BUILD_ARGS \
        --label org.opencontainers.image.title="Marsad API" \
        --label org.opencontainers.image.description="Marsad Business Platform Backend API" \
        -t "$full_image_tag" \
        -t "$latest_tag" \
        -f "$dockerfile" \
        "$PROJECT_ROOT/backend"

    success "Backend API image built: $full_image_tag"
}

################################################################################
# Frontend Image
################################################################################

build_frontend_image() {
    log "Building frontend image..."

    local dockerfile="$PROJECT_ROOT/Dockerfile.frontend"
    local image_name="marsad-web"
    local image_url="${DOCKER_REGISTRY}/${image_name}"
    local full_image_tag="${image_url}:${IMAGE_TAG}"
    local latest_tag="${image_url}:latest"

    # Create Dockerfile if it doesn't exist
    if [[ ! -f "$dockerfile" ]]; then
        log "Creating Dockerfile for frontend..."
        cat > "$dockerfile" <<'EOF'
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY . .

# Build application
RUN npm run build

# Runtime stage (using static server)
FROM node:20-alpine

WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install dumb-init and serve package
RUN apk add --no-cache dumb-init && \
    npm install -g serve

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Use non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Entrypoint
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["serve", "-s", "dist", "-l", "3001"]
EOF
        success "Dockerfile created for frontend"
    fi

    log "Building Docker image: $full_image_tag"

    docker build \
        --progress=plain \
        $COMMON_BUILD_ARGS \
        --label org.opencontainers.image.title="Marsad Web" \
        --label org.opencontainers.image.description="Marsad Business Platform Frontend" \
        -t "$full_image_tag" \
        -t "$latest_tag" \
        -f "$dockerfile" \
        "$PROJECT_ROOT"

    success "Frontend image built: $full_image_tag"
}

################################################################################
# Worker Image
################################################################################

build_worker_image() {
    log "Building worker image..."

    local dockerfile="$PROJECT_ROOT/backend/Dockerfile.worker"
    local image_name="marsad-worker"
    local image_url="${DOCKER_REGISTRY}/${image_name}"
    local full_image_tag="${image_url}:${IMAGE_TAG}"
    local latest_tag="${image_url}:latest"

    # Create Dockerfile if it doesn't exist
    if [[ ! -f "$dockerfile" ]]; then
        log "Creating Dockerfile for worker..."
        cat > "$dockerfile" <<'EOF'
FROM node:20-alpine

WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install dumb-init
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build application
RUN npm run build

# Use non-root user
USER nodejs

# Entrypoint
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["node", "dist/worker/worker.js"]
EOF
        success "Dockerfile created for worker"
    fi

    log "Building Docker image: $full_image_tag"

    docker build \
        --progress=plain \
        $COMMON_BUILD_ARGS \
        --label org.opencontainers.image.title="Marsad Worker" \
        --label org.opencontainers.image.description="Marsad Background Job Worker" \
        -t "$full_image_tag" \
        -t "$latest_tag" \
        -f "$dockerfile" \
        "$PROJECT_ROOT/backend"

    success "Worker image built: $full_image_tag"
}

################################################################################
# Image Scanning
################################################################################

scan_images() {
    log "Scanning Docker images for vulnerabilities..."

    if command -v trivy &> /dev/null; then
        local images=(
            "${DOCKER_REGISTRY}/marsad-api:${IMAGE_TAG}"
            "${DOCKER_REGISTRY}/marsad-web:${IMAGE_TAG}"
            "${DOCKER_REGISTRY}/marsad-worker:${IMAGE_TAG}"
        )

        for image in "${images[@]}"; do
            log "Scanning: $image"
            if trivy image --severity HIGH,CRITICAL "$image"; then
                success "No critical vulnerabilities found in $image"
            else
                error "Vulnerabilities detected in $image"
                return 1
            fi
        done
    else
        log "Trivy not installed, skipping image scanning"
        log "Install trivy for automated security scanning: https://github.com/aquasecurity/trivy"
    fi
}

################################################################################
# Summary
################################################################################

print_summary() {
    log "=================================================="
    log "Docker Build Summary"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Registry: $DOCKER_REGISTRY"
    log "Image Tag: $IMAGE_TAG"
    log ""
    log "Built Images:"
    log "  - ${DOCKER_REGISTRY}/marsad-api:${IMAGE_TAG}"
    log "  - ${DOCKER_REGISTRY}/marsad-web:${IMAGE_TAG}"
    log "  - ${DOCKER_REGISTRY}/marsad-worker:${IMAGE_TAG}"
    log ""
    log "Next step: Push images to ECR"
    log "Command: ./push-to-ecr.sh $ENVIRONMENT"
}

################################################################################
# Main Flow
################################################################################

main() {
    log "=================================================="
    log "Starting Docker Builds"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "AWS Region: $AWS_REGION"
    log "Registry: $DOCKER_REGISTRY"

    # Check Docker is running
    if ! docker ps > /dev/null 2>&1; then
        error "Docker is not running or not accessible"
        exit 1
    fi
    success "Docker daemon is running"

    # Check AWS credentials if using ECR
    if [[ -n "$AWS_ACCOUNT_ID" ]]; then
        log "Verifying AWS credentials..."
        if ! aws sts get-caller-identity --region "$AWS_REGION" > /dev/null 2>&1; then
            error "AWS credentials not valid or not configured"
            exit 1
        fi
        success "AWS credentials verified"
    fi

    # Build images
    build_backend_image
    build_frontend_image
    build_worker_image

    # Scan for vulnerabilities
    scan_images

    # Print summary
    print_summary

    success "All Docker images built successfully"
    exit 0
}

main "$@"
