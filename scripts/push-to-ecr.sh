#!/bin/bash

################################################################################
# ECR Push Script
#
# Pushes Docker images to AWS Elastic Container Registry (ECR)
# - Authenticates with ECR
# - Creates repositories if needed
# - Pushes images with multiple tags
# - Outputs image URIs for deployment
#
# Usage: ./push-to-ecr.sh [environment]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
AWS_REGION="${AWS_REGION:-eu-central-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null)}"
DOCKER_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
VCS_REF=$(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
IMAGE_TAG="${ENVIRONMENT}-${VCS_REF}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Output file
ECR_IMAGES_FILE="${SCRIPT_DIR}/../.ecr-images"

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

error() {
    echo -e "${RED}[✗]${NC} $*"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*"
}

################################################################################
# ECR Authentication
################################################################################

authenticate_ecr() {
    log "Authenticating with AWS ECR..."

    # Get login token and authenticate Docker
    local login_cmd=$(aws ecr get-login-password \
        --region "$AWS_REGION" | docker login \
        --username AWS \
        --password-stdin "$DOCKER_REGISTRY")

    if [[ $? -eq 0 ]]; then
        success "Successfully authenticated with ECR"
    else
        error "Failed to authenticate with ECR"
        exit 1
    fi
}

################################################################################
# Repository Management
################################################################################

ensure_repository_exists() {
    local repo_name=$1
    local repo_url="${DOCKER_REGISTRY}/${repo_name}"

    log "Checking ECR repository: $repo_name"

    # Check if repository exists
    if aws ecr describe-repositories \
        --region "$AWS_REGION" \
        --repository-names "$repo_name" \
        --output text > /dev/null 2>&1; then
        success "Repository exists: $repo_name"
        return 0
    fi

    # Create repository
    log "Creating ECR repository: $repo_name"

    local scan_on_push="true"
    if [[ "$ENVIRONMENT" == "production" ]]; then
        scan_on_push="true"
    fi

    aws ecr create-repository \
        --region "$AWS_REGION" \
        --repository-name "$repo_name" \
        --image-scanning-configuration "scanOnPush=$scan_on_push" \
        --encryption-configuration "encryptionType=AES" \
        --output text > /dev/null

    success "Repository created: $repo_name"

    # Set lifecycle policy to cleanup old images
    local lifecycle_policy='{
        "rules": [
            {
                "rulePriority": 1,
                "description": "Keep last 10 staging images",
                "selection": {
                    "tagStatus": "tagged",
                    "tagPrefixList": ["staging"],
                    "countType": "imageCountMoreThan",
                    "countNumber": 10
                },
                "action": {
                    "type": "expire"
                }
            },
            {
                "rulePriority": 2,
                "description": "Keep last 20 production images",
                "selection": {
                    "tagStatus": "tagged",
                    "tagPrefixList": ["production"],
                    "countType": "imageCountMoreThan",
                    "countNumber": 20
                },
                "action": {
                    "type": "expire"
                }
            }
        ]
    }'

    aws ecr put-lifecycle-policy \
        --region "$AWS_REGION" \
        --repository-name "$repo_name" \
        --lifecycle-policy-text "$lifecycle_policy" \
        --output text > /dev/null

    success "Lifecycle policy configured for $repo_name"
}

################################################################################
# Image Push
################################################################################

push_image() {
    local local_image=$1
    local repo_name=$2

    ensure_repository_exists "$repo_name"

    local remote_image="${DOCKER_REGISTRY}/${repo_name}"
    local full_tag="${remote_image}:${IMAGE_TAG}"
    local latest_tag="${remote_image}:latest"
    local environment_tag="${remote_image}:${ENVIRONMENT}"

    log "Pushing image: $local_image"
    log "Remote destination: $full_tag"

    # Tag local image
    docker tag "$local_image" "$full_tag"
    docker tag "$local_image" "$latest_tag"
    docker tag "$local_image" "$environment_tag"

    success "Local image tagged with multiple tags"

    # Push images
    log "Pushing $full_tag to ECR..."
    if docker push "$full_tag"; then
        success "Pushed: $full_tag"
    else
        error "Failed to push: $full_tag"
        return 1
    fi

    log "Pushing $environment_tag to ECR..."
    if docker push "$environment_tag"; then
        success "Pushed: $environment_tag"
    else
        error "Failed to push: $environment_tag"
        return 1
    fi

    log "Pushing $latest_tag to ECR..."
    if docker push "$latest_tag"; then
        success "Pushed: $latest_tag"
    else
        error "Failed to push: $latest_tag"
        return 1
    fi

    # Output image URL
    echo "$full_tag" >> "$ECR_IMAGES_FILE.tmp"
}

################################################################################
# Image Verification
################################################################################

verify_pushed_images() {
    log "Verifying pushed images in ECR..."

    local repos=("marsad-api" "marsad-web" "marsad-worker")

    for repo in "${repos[@]}"; do
        log "Verifying repository: $repo"

        local images=$(aws ecr list-images \
            --region "$AWS_REGION" \
            --repository-name "$repo" \
            --filter "tagStatus=TAGGED" \
            --query 'imageIds[*].imageTag' \
            --output text)

        if echo "$images" | grep -q "$IMAGE_TAG"; then
            success "Image verified in ECR: $repo:$IMAGE_TAG"
        else
            error "Image not found in ECR: $repo:$IMAGE_TAG"
            return 1
        fi
    done

    success "All images verified in ECR"
}

################################################################################
# Image Metadata
################################################################################

save_image_metadata() {
    log "Saving image metadata..."

    cat > "$ECR_IMAGES_FILE" <<EOF
# ECR Images for $ENVIRONMENT environment
# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Git Commit: $(cd "$PROJECT_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")

ECR_REGISTRY=${DOCKER_REGISTRY}
IMAGE_TAG=${IMAGE_TAG}
ENVIRONMENT=${ENVIRONMENT}

# Image URIs
API_IMAGE=${DOCKER_REGISTRY}/marsad-api:${IMAGE_TAG}
WEB_IMAGE=${DOCKER_REGISTRY}/marsad-web:${IMAGE_TAG}
WORKER_IMAGE=${DOCKER_REGISTRY}/marsad-worker:${IMAGE_TAG}

# Also available with these tags
# - ${DOCKER_REGISTRY}/marsad-api:${ENVIRONMENT}
# - ${DOCKER_REGISTRY}/marsad-api:latest
# - ${DOCKER_REGISTRY}/marsad-web:${ENVIRONMENT}
# - ${DOCKER_REGISTRY}/marsad-web:latest
# - ${DOCKER_REGISTRY}/marsad-worker:${ENVIRONMENT}
# - ${DOCKER_REGISTRY}/marsad-worker:latest
EOF

    success "Image metadata saved to: $ECR_IMAGES_FILE"
}

################################################################################
# Summary
################################################################################

print_summary() {
    log "=================================================="
    log "ECR Push Summary"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "AWS Region: $AWS_REGION"
    log "AWS Account: $AWS_ACCOUNT_ID"
    log "Registry: $DOCKER_REGISTRY"
    log "Image Tag: $IMAGE_TAG"
    log ""
    log "Pushed Images:"
    log "  API:    ${DOCKER_REGISTRY}/marsad-api:${IMAGE_TAG}"
    log "  Web:    ${DOCKER_REGISTRY}/marsad-web:${IMAGE_TAG}"
    log "  Worker: ${DOCKER_REGISTRY}/marsad-worker:${IMAGE_TAG}"
    log ""
    log "Image metadata saved to: $ECR_IMAGES_FILE"
    log ""
    log "Next step: Deploy to ECS"
    log "Command: ./ecs-deploy.sh $ENVIRONMENT"
}

################################################################################
# Cleanup
################################################################################

cleanup_old_images() {
    log "Cleaning up old local images..."

    # Remove dangling images
    docker image prune -f --filter "dangling=true" > /dev/null 2>&1

    success "Local image cleanup complete"
}

################################################################################
# Main Flow
################################################################################

main() {
    log "=================================================="
    log "Starting ECR Push"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "AWS Region: $AWS_REGION"

    # Initialize
    rm -f "$ECR_IMAGES_FILE.tmp"
    mkdir -p "$(dirname "$ECR_IMAGES_FILE")"

    # Authenticate
    authenticate_ecr

    # Push images
    local images=(
        "marsad-api:staging-${VCS_REF}"
        "marsad-web:staging-${VCS_REF}"
        "marsad-worker:staging-${VCS_REF}"
    )

    for image_local_tag in "${images[@]}"; do
        local repo_name=$(echo "$image_local_tag" | cut -d: -f1)
        push_image "$image_local_tag" "$repo_name"
    done

    # Verify
    verify_pushed_images

    # Save metadata
    save_image_metadata

    # Cleanup
    cleanup_old_images

    # Summary
    print_summary

    success "All images pushed to ECR successfully"
    exit 0
}

# Error handling
trap 'error "Push failed at line $LINENO"' ERR

main "$@"
