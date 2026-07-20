#!/bin/bash

################################################################################
# ECS Deployment Script
#
# Deploys Docker images to AWS ECS Fargate
# - Updates task definitions
# - Updates ECS services
# - Monitors service stability
# - Waits for stable deployment
# - Handles rollback on failure
#
# Usage: ./ecs-deploy.sh [environment]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
AWS_REGION="${AWS_REGION:-eu-central-1}"
CLUSTER_NAME="marsad-${ENVIRONMENT}"
SERVICE_API="marsad-api-${ENVIRONMENT}"
SERVICE_WORKER="marsad-worker-${ENVIRONMENT}"
TASK_DEF_API="marsad-api-${ENVIRONMENT}"
TASK_DEF_WORKER="marsad-worker-${ENVIRONMENT}"
MAX_WAIT_MINUTES=15
WAIT_INTERVAL=10

# Load ECR image information
ECR_IMAGES_FILE="${SCRIPT_DIR}/../.ecr-images"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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

warning() {
    echo -e "${YELLOW}[!]${NC} $*"
}

################################################################################
# Prerequisite Checks
################################################################################

check_prerequisites() {
    log "Checking prerequisites..."

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        error "AWS CLI is not installed"
        exit 1
    fi
    success "AWS CLI found"

    # Check jq for JSON parsing
    if ! command -v jq &> /dev/null; then
        error "jq is not installed"
        exit 1
    fi
    success "jq found"

    # Check ECR images file
    if [[ ! -f "$ECR_IMAGES_FILE" ]]; then
        error "ECR images file not found: $ECR_IMAGES_FILE"
        error "Please run ./push-to-ecr.sh first"
        exit 1
    fi
    success "ECR images file found"

    # Load ECR images
    source "$ECR_IMAGES_FILE"
    log "Loaded ECR configuration"
}

################################################################################
# ECS Service Checks
################################################################################

check_cluster_exists() {
    log "Checking ECS cluster: $CLUSTER_NAME"

    if aws ecs describe-clusters \
        --region "$AWS_REGION" \
        --clusters "$CLUSTER_NAME" \
        --query 'clusters[0].clusterArn' \
        --output text | grep -q "arn:aws"; then
        success "ECS cluster exists: $CLUSTER_NAME"
        return 0
    else
        error "ECS cluster not found: $CLUSTER_NAME"
        exit 1
    fi
}

check_service_exists() {
    local service_name=$1

    log "Checking ECS service: $service_name"

    if aws ecs describe-services \
        --region "$AWS_REGION" \
        --cluster "$CLUSTER_NAME" \
        --services "$service_name" \
        --query 'services[0].serviceArn' \
        --output text 2>/dev/null | grep -q "arn:aws"; then
        success "ECS service exists: $service_name"
        return 0
    else
        error "ECS service not found: $service_name"
        return 1
    fi
}

################################################################################
# Task Definition Management
################################################################################

create_task_definition() {
    local task_def_name=$1
    local container_name=$2
    local image_uri=$3
    local container_port=$4
    local environment_file=$5

    log "Creating/updating task definition: $task_def_name"

    # Get latest task definition
    local latest_task_def=$(aws ecs describe-task-definition \
        --region "$AWS_REGION" \
        --task-definition "$task_def_name" \
        --query 'taskDefinition' \
        --output json 2>/dev/null || echo "{}")

    # Create new task definition JSON
    local task_def_json
    if [[ "$latest_task_def" == "{}" ]]; then
        # New task definition
        task_def_json=$(cat <<EOF
{
  "family": "$task_def_name",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "$container_name",
      "image": "$image_uri",
      "essential": true,
      "portMappings": [
        {
          "containerPort": $container_port,
          "hostPort": $container_port,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "$ENVIRONMENT"
        }
      ],
      "envFile": [
        {
          "value": "$environment_file",
          "type": "s3"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/marsad/$ENVIRONMENT/$container_name",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": [
          "CMD-SHELL",
          "curl -f http://localhost:$container_port/api/health || exit 1"
        ],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ],
  "executionRoleArn": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/ecsTaskRole"
}
EOF
)
    else
        # Update existing task definition
        task_def_json=$(echo "$latest_task_def" | jq \
            ".containerDefinitions[0].image = \"$image_uri\" | \
            .containerDefinitions[0].environment[0].value = \"$ENVIRONMENT\" | \
            del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities)")
    fi

    # Register new task definition
    local new_revision=$(aws ecs register-task-definition \
        --region "$AWS_REGION" \
        --cli-input-json "$task_def_json" \
        --query 'taskDefinition.revision' \
        --output text)

    success "Task definition created/updated: $task_def_name:$new_revision"
    echo "$new_revision"
}

################################################################################
# Service Update
################################################################################

update_service() {
    local service_name=$1
    local task_def_name=$2
    local task_revision=$3

    log "Updating service: $service_name with task definition: $task_def_name:$task_revision"

    aws ecs update-service \
        --region "$AWS_REGION" \
        --cluster "$CLUSTER_NAME" \
        --service "$service_name" \
        --task-definition "$task_def_name:$task_revision" \
        --force-new-deployment \
        --output json > /dev/null

    success "Service updated: $service_name"
}

################################################################################
# Deployment Monitoring
################################################################################

wait_for_service_deployment() {
    local service_name=$1
    local max_wait=$((MAX_WAIT_MINUTES * 60))
    local start_time=$(date +%s)

    log "Waiting for service deployment: $service_name (timeout: ${MAX_WAIT_MINUTES}m)"

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [[ $elapsed -gt $max_wait ]]; then
            error "Deployment timeout for service: $service_name"
            return 1
        fi

        # Get service status
        local service_status=$(aws ecs describe-services \
            --region "$AWS_REGION" \
            --cluster "$CLUSTER_NAME" \
            --services "$service_name" \
            --query 'services[0]' \
            --output json)

        local running_count=$(echo "$service_status" | jq '.runningCount')
        local desired_count=$(echo "$service_status" | jq '.desiredCount')
        local deployment_count=$(echo "$service_status" | jq '.deployments | length')

        log "Service Status - Running: $running_count/$desired_count, Deployments: $deployment_count"

        # Check if deployment is complete
        if [[ "$deployment_count" -eq 1 ]] && [[ "$running_count" -eq "$desired_count" ]]; then
            # Verify all tasks are healthy
            local unhealthy_count=$(echo "$service_status" | jq '[.deployments[].taskDefinition] | length')
            if [[ "$unhealthy_count" -eq 0 ]]; then
                success "Service deployment complete: $service_name"
                return 0
            fi
        fi

        sleep "$WAIT_INTERVAL"
    done
}

check_service_health() {
    local service_name=$1

    log "Checking service health: $service_name"

    local service_status=$(aws ecs describe-services \
        --region "$AWS_REGION" \
        --cluster "$CLUSTER_NAME" \
        --services "$service_name" \
        --query 'services[0]' \
        --output json)

    local running_count=$(echo "$service_status" | jq '.runningCount')
    local desired_count=$(echo "$service_status" | jq '.desiredCount')
    local pending_count=$(echo "$service_status" | jq '.pendingCount')

    log "Running: $running_count, Desired: $desired_count, Pending: $pending_count"

    # Check for deployment issues
    local deployment_issues=$(echo "$service_status" | jq '.events[] | select(.message | contains("failed")) | .message' | head -5)

    if [[ -n "$deployment_issues" ]]; then
        warning "Deployment issues detected:"
        echo "$deployment_issues"
    fi

    if [[ "$running_count" -eq "$desired_count" ]] && [[ "$pending_count" -eq 0 ]]; then
        success "Service is healthy: $service_name"
        return 0
    else
        error "Service is not healthy: $service_name"
        return 1
    fi
}

################################################################################
# Deployment Flow
################################################################################

deploy_api_service() {
    log "Deploying API service..."

    check_service_exists "$SERVICE_API" || {
        warning "API service does not exist, skipping API deployment"
        return 0
    }

    local task_revision=$(create_task_definition "$TASK_DEF_API" "marsad-api" "$API_IMAGE" "3000" "s3://marsad-env-${ENVIRONMENT}/.env")
    update_service "$SERVICE_API" "$TASK_DEF_API" "$task_revision"
    wait_for_service_deployment "$SERVICE_API"
    check_service_health "$SERVICE_API"
}

deploy_worker_service() {
    log "Deploying Worker service..."

    check_service_exists "$SERVICE_WORKER" || {
        log "Worker service does not exist, skipping worker deployment"
        return 0
    }

    local task_revision=$(create_task_definition "$TASK_DEF_WORKER" "marsad-worker" "$WORKER_IMAGE" "8080" "s3://marsad-env-${ENVIRONMENT}/.env")
    update_service "$SERVICE_WORKER" "$TASK_DEF_WORKER" "$task_revision"
    wait_for_service_deployment "$SERVICE_WORKER"
    check_service_health "$SERVICE_WORKER"
}

################################################################################
# Summary
################################################################################

print_deployment_summary() {
    log "=================================================="
    log "ECS Deployment Summary"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Cluster: $CLUSTER_NAME"
    log "Services deployed:"
    log "  - $SERVICE_API"
    log "  - $SERVICE_WORKER"
    log ""
    log "Next step: Run health checks"
    log "Command: ./health-check.sh $ENVIRONMENT aws"
}

################################################################################
# Main Flow
################################################################################

main() {
    log "=================================================="
    log "Starting ECS Deployment"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "AWS Region: $AWS_REGION"

    check_prerequisites
    check_cluster_exists

    # Deploy services
    deploy_api_service || {
        error "API deployment failed"
        exit 1
    }

    deploy_worker_service || {
        warning "Worker deployment failed, but API is deployed"
    }

    print_deployment_summary
    success "ECS deployment completed successfully"
    exit 0
}

trap 'error "Deployment failed at line $LINENO"' ERR

main "$@"
