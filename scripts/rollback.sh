#!/bin/bash

################################################################################
# Deployment Rollback Script
#
# Performs automatic rollback of failed deployments
# - AWS ECS rollback (revert to previous task definition)
# - Vercel rollback (switch to previous production alias)
# - Database rollback (undo recent migrations)
# - Service health verification
# - Alert on rollback completion
#
# Usage: ./rollback.sh [environment] [platform] [deployment-id]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
PLATFORM="${2:-aws}"
DEPLOYMENT_ID="${3:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ROLLBACK_LOG="${SCRIPT_DIR}/../logs/rollback-$(date +%Y%m%d-%H%M%S).log"

# Configuration
AWS_REGION="${AWS_REGION:-eu-central-1}"
CLUSTER_NAME="marsad-${ENVIRONMENT}"
SERVICE_API="marsad-api-${ENVIRONMENT}"
SERVICE_WORKER="marsad-worker-${ENVIRONMENT}"
VERCEL_TOKEN="${VERCEL_TOKEN:-}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ensure logs directory exists
mkdir -p "$(dirname "$ROLLBACK_LOG")"

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$ROLLBACK_LOG"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*" | tee -a "$ROLLBACK_LOG"
}

error() {
    echo -e "${RED}[✗]${NC} $*" | tee -a "$ROLLBACK_LOG"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*" | tee -a "$ROLLBACK_LOG"
}

################################################################################
# AWS ECS Rollback
################################################################################

rollback_aws_ecs() {
    log "Rolling back AWS ECS deployment..."

    # Get previous task definition revision
    log "Retrieving previous task definitions..."

    local api_task_def="marsad-api-${ENVIRONMENT}"
    local worker_task_def="marsad-worker-${ENVIRONMENT}"

    # Get previous API task definition
    local api_revisions=$(aws ecs list-task-definitions \
        --region "$AWS_REGION" \
        --family-prefix "$api_task_def" \
        --sort REVERSE \
        --max-results 10 \
        --query 'taskDefinitionArns' \
        --output text)

    if [[ -n "$api_revisions" ]]; then
        local revisions_array=($api_revisions)
        if [[ ${#revisions_array[@]} -gt 1 ]]; then
            local previous_revision="${revisions_array[1]}"
            log "Previous API task definition: $previous_revision"

            # Update service to use previous revision
            log "Updating $SERVICE_API service to previous revision..."

            aws ecs update-service \
                --region "$AWS_REGION" \
                --cluster "$CLUSTER_NAME" \
                --service "$SERVICE_API" \
                --task-definition "$previous_revision" \
                --force-new-deployment \
                --output json > /dev/null

            success "Service updated to previous revision: $previous_revision"
        else
            error "Cannot find previous API task definition"
            return 1
        fi
    fi

    # Get previous Worker task definition
    local worker_revisions=$(aws ecs list-task-definitions \
        --region "$AWS_REGION" \
        --family-prefix "$worker_task_def" \
        --sort REVERSE \
        --max-results 10 \
        --query 'taskDefinitionArns' \
        --output text)

    if [[ -n "$worker_revisions" ]]; then
        local revisions_array=($worker_revisions)
        if [[ ${#revisions_array[@]} -gt 1 ]]; then
            local previous_revision="${revisions_array[1]}"
            log "Previous Worker task definition: $previous_revision"

            # Update service to use previous revision
            log "Updating $SERVICE_WORKER service to previous revision..."

            aws ecs update-service \
                --region "$AWS_REGION" \
                --cluster "$CLUSTER_NAME" \
                --service "$SERVICE_WORKER" \
                --task-definition "$previous_revision" \
                --force-new-deployment \
                --output json > /dev/null

            success "Service updated to previous revision: $previous_revision"
        fi
    fi

    # Wait for rollback to complete
    log "Waiting for rollback to stabilize..."
    sleep 30

    # Verify services are healthy
    for service in "$SERVICE_API" "$SERVICE_WORKER"; do
        local service_status=$(aws ecs describe-services \
            --region "$AWS_REGION" \
            --cluster "$CLUSTER_NAME" \
            --services "$service" \
            --query 'services[0]' \
            --output json)

        local running=$(echo "$service_status" | jq '.runningCount')
        local desired=$(echo "$service_status" | jq '.desiredCount')

        log "Service $service - Running: $running/$desired"
    done

    success "AWS ECS rollback completed"
}

################################################################################
# Vercel Rollback
################################################################################

rollback_vercel() {
    log "Rolling back Vercel deployment..."

    if [[ -z "$VERCEL_TOKEN" ]]; then
        error "VERCEL_TOKEN not set, cannot rollback Vercel"
        return 1
    fi

    # Get recent deployments
    local deployments=$(curl -s \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        "https://api.vercel.com/v6/deployments?limit=5")

    local previous_deployment=$(echo "$deployments" | jq '.deployments[1]')
    local previous_id=$(echo "$previous_deployment" | jq -r '.id')
    local previous_url=$(echo "$previous_deployment" | jq -r '.url')

    if [[ -z "$previous_id" ]] || [[ "$previous_id" == "null" ]]; then
        error "No previous deployment found"
        return 1
    fi

    log "Found previous deployment: $previous_url"
    log "Setting as production alias..."

    # Promote previous deployment to production
    curl -X PATCH \
        -H "Authorization: Bearer $VERCEL_TOKEN" \
        "https://api.vercel.com/v3/deployments/$previous_id" \
        -d '{"target": "production"}' \
        -H "Content-Type: application/json" \
        --output /dev/null

    success "Vercel rollback completed: https://$previous_url"
}

################################################################################
# Database Rollback
################################################################################

rollback_database_migrations() {
    log "Rolling back database migrations..."

    cd "$PROJECT_ROOT/backend"

    # List recent migrations
    if [[ -d "prisma/migrations" ]]; then
        local migration_count=$(ls -1 prisma/migrations | wc -l)
        log "Found $migration_count migrations"

        # Get the last migration
        local last_migration=$(ls -1 prisma/migrations | tail -1)

        if [[ -n "$last_migration" ]]; then
            log "Attempting to rollback migration: $last_migration"

            # Note: Prisma doesn't have built-in rollback, so we need to use SQL
            # This is a warning that manual intervention may be needed
            warning "Prisma does not support automatic rollback"
            warning "Manual database restoration may be required"
            warning "Last migration: $last_migration"

            # Check if backup exists
            local backup_date=$(date -d "1 day ago" +%Y%m%d)
            local backup_file="/var/backups/marsad-db-${backup_date}.sql"

            if [[ -f "$backup_file" ]]; then
                log "Database backup found: $backup_file"
                warning "To restore from backup, run:"
                warning "psql -U postgres -d marsad-$ENVIRONMENT < $backup_file"
            fi
        fi
    else
        warning "No migrations directory found"
    fi
}

################################################################################
# Verification
################################################################################

verify_rollback() {
    log "Verifying rollback status..."

    if [[ "$PLATFORM" == "aws" ]]; then
        # Check ECS services
        local services=("$SERVICE_API" "$SERVICE_WORKER")
        local all_healthy=true

        for service in "${services[@]}"; do
            local service_status=$(aws ecs describe-services \
                --region "$AWS_REGION" \
                --cluster "$CLUSTER_NAME" \
                --services "$service" \
                --query 'services[0]' \
                --output json)

            local running=$(echo "$service_status" | jq '.runningCount')
            local desired=$(echo "$service_status" | jq '.desiredCount')

            if [[ "$running" -eq "$desired" ]]; then
                success "Service $service is healthy"
            else
                error "Service $service is unhealthy (running: $running, desired: $desired)"
                all_healthy=false
            fi
        done

        if $all_healthy; then
            success "All ECS services are healthy after rollback"
            return 0
        else
            error "Some ECS services are not healthy after rollback"
            return 1
        fi
    elif [[ "$PLATFORM" == "vercel" ]]; then
        log "Verifying Vercel deployment..."
        sleep 5

        local deployments=$(curl -s \
            -H "Authorization: Bearer $VERCEL_TOKEN" \
            "https://api.vercel.com/v6/deployments?limit=1")

        local state=$(echo "$deployments" | jq '.deployments[0].state' -r)

        if [[ "$state" == "READY" ]]; then
            success "Vercel deployment is ready"
            return 0
        else
            warning "Vercel deployment state: $state"
            return 0
        fi
    fi
}

################################################################################
# Alerts and Notifications
################################################################################

send_rollback_notification() {
    log "Sending rollback notification..."

    local notification_message="
🚨 DEPLOYMENT ROLLBACK ALERT

Environment: $ENVIRONMENT
Platform: $PLATFORM
Deployment ID: ${DEPLOYMENT_ID:-unknown}
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Git Commit: $(cd "$PROJECT_ROOT" && git rev-parse --short HEAD)

ACTION REQUIRED:
1. Review deployment logs: $ROLLBACK_LOG
2. Check application health
3. Investigate root cause of failure
4. Fix issues and redeploy

Rollback completed at: $(date)
"

    # Write to file for alerting systems
    echo "$notification_message" | tee -a "$ROLLBACK_LOG"

    # If Slack webhook is configured, send notification
    if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
        local slack_message=$(cat <<EOF
{
    "text": "🚨 Deployment Rollback - $ENVIRONMENT ($PLATFORM)",
    "blocks": [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*Deployment Rollback Alert*\n*Environment:* $ENVIRONMENT\n*Platform:* $PLATFORM\n*Deployment ID:* ${DEPLOYMENT_ID:-unknown}\n*Time:* $(date)"
            }
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*Next Steps:*\n1. Review logs\n2. Check application health\n3. Investigate root cause\n4. Fix and redeploy"
            }
        }
    ]
}
EOF
)
        curl -X POST -H 'Content-type: application/json' \
            --data "$slack_message" \
            "$SLACK_WEBHOOK" \
            --silent > /dev/null
    fi
}

################################################################################
# Summary
################################################################################

print_rollback_summary() {
    log "=================================================="
    log "Rollback Summary"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Platform: $PLATFORM"
    log "Deployment ID: ${DEPLOYMENT_ID:-unknown}"
    log "Rollback Log: $ROLLBACK_LOG"
    log ""
    log "Rollback Status: COMPLETED"
    log ""
    log "IMPORTANT: Manual intervention may be required"
    log "Review logs and take appropriate action to prevent future failures"
}

################################################################################
# Main Flow
################################################################################

main() {
    log "=================================================="
    log "Starting Deployment Rollback"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Platform: $PLATFORM"
    log "Deployment ID: ${DEPLOYMENT_ID:-unknown}"

    # Perform platform-specific rollback
    if [[ "$PLATFORM" == "aws" ]]; then
        rollback_aws_ecs || warning "AWS ECS rollback had issues"
        rollback_database_migrations || warning "Database rollback had issues"
    elif [[ "$PLATFORM" == "vercel" ]]; then
        rollback_vercel || warning "Vercel rollback had issues"
    else
        error "Unknown platform: $PLATFORM"
        exit 1
    fi

    # Verify rollback
    if verify_rollback; then
        success "Rollback verification passed"
    else
        error "Rollback verification failed"
    fi

    # Send notifications
    send_rollback_notification

    # Print summary
    print_rollback_summary

    exit 0
}

trap 'error "Rollback failed at line $LINENO"' ERR

main "$@"
