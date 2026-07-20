#!/bin/bash

################################################################################
# Marsad Deployment Orchestrator
#
# Production-ready deployment script for AWS/Vercel with:
# - Environment configuration
# - Database migrations
# - Health checks
# - Automated rollback
# - Deployment monitoring
# - Post-deployment validation
#
# Usage: ./deploy.sh [staging|production] [aws|vercel]
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_LOG="${SCRIPT_DIR}/../logs/deployment-$(date +%Y%m%d-%H%M%S).log"
DEPLOYMENT_STATE_FILE="${SCRIPT_DIR}/../.deployment-state"
ENVIRONMENT="${1:-staging}"
PLATFORM="${2:-aws}"
DEPLOYMENT_ID="deploy-$(date +%s)"
MAX_HEALTH_RETRIES=30
HEALTH_CHECK_INTERVAL=5

# Ensure logs directory exists
mkdir -p "$(dirname "$DEPLOYMENT_LOG")"

################################################################################
# Logging Functions
################################################################################

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$DEPLOYMENT_LOG"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*" | tee -a "$DEPLOYMENT_LOG"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" | tee -a "$DEPLOYMENT_LOG"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $*" | tee -a "$DEPLOYMENT_LOG"
}

log_section() {
    echo "" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${BLUE}→ $*${NC}" | tee -a "$DEPLOYMENT_LOG"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}" | tee -a "$DEPLOYMENT_LOG"
}

################################################################################
# Validation Functions
################################################################################

validate_environment() {
    log_section "VALIDATING DEPLOYMENT ENVIRONMENT"

    # Check required tools
    local required_tools=("node" "npm" "git")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
    log_success "All required tools found"

    # Validate environment
    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        log_error "Invalid environment: $ENVIRONMENT (must be staging or production)"
        exit 1
    fi
    log_success "Environment validated: $ENVIRONMENT"

    # Validate platform
    if [[ "$PLATFORM" != "aws" && "$PLATFORM" != "vercel" ]]; then
        log_error "Invalid platform: $PLATFORM (must be aws or vercel)"
        exit 1
    fi
    log_success "Platform validated: $PLATFORM"

    # Check git status
    if [[ $(cd "$PROJECT_ROOT" && git status --porcelain) ]]; then
        log_warning "Uncommitted changes detected in repository"
        log "Stashing uncommitted changes..."
        cd "$PROJECT_ROOT" && git stash
    fi
    log_success "Git status verified"
}

################################################################################
# Environment Configuration
################################################################################

setup_environment_config() {
    log_section "SETTING UP ENVIRONMENT CONFIGURATION"

    local env_file="${PROJECT_ROOT}/backend/.env.${ENVIRONMENT}"
    local example_file="${PROJECT_ROOT}/backend/.env.example"

    if [[ ! -f "$env_file" ]]; then
        log "Creating $ENVIRONMENT environment file from example..."
        cp "$example_file" "$env_file"
        log_warning "Please update $env_file with actual values for $ENVIRONMENT"

        # For staging, set some reasonable defaults
        if [[ "$ENVIRONMENT" == "staging" ]]; then
            sed -i "s/NODE_ENV=\"development\"/NODE_ENV=\"staging\"/g" "$env_file"
            sed -i "s/LOG_LEVEL=\"debug\"/LOG_LEVEL=\"info\"/g" "$env_file"
        fi

        # For production, enforce more strict settings
        if [[ "$ENVIRONMENT" == "production" ]]; then
            sed -i "s/NODE_ENV=\"development\"/NODE_ENV=\"production\"/g" "$env_file"
            sed -i "s/LOG_LEVEL=\"debug\"/LOG_LEVEL=\"warn\"/g" "$env_file"
            log_warning "⚠️  CRITICAL: Production .env file created but requires manual configuration!"
            log_warning "Do not proceed without setting all required values"
            return 1
        fi
    fi

    log_success "Environment configuration prepared: $env_file"
    return 0
}

################################################################################
# Build Functions
################################################################################

build_backend() {
    log_section "BUILDING BACKEND"

    cd "$PROJECT_ROOT/backend"

    log "Installing dependencies..."
    npm ci --silent
    log_success "Dependencies installed"

    log "Running TypeScript compilation..."
    npm run build
    log_success "Backend built successfully"
}

build_frontend() {
    log_section "BUILDING FRONTEND"

    cd "$PROJECT_ROOT" # Root has the frontend react config

    log "Installing dependencies..."
    npm ci --silent
    log_success "Dependencies installed"

    log "Building React application..."
    npm run build
    log_success "Frontend built successfully"
}

################################################################################
# Database Migration Functions
################################################################################

run_database_migrations() {
    log_section "RUNNING DATABASE MIGRATIONS"

    cd "$PROJECT_ROOT/backend"

    # Check Prisma migrations
    if [[ -d "prisma/migrations" ]]; then
        log "Running Prisma migrations..."
        npm run prisma:generate
        npm run prisma:migrate
        log_success "Prisma migrations completed"
    fi

    # Run SQL migrations if they exist
    if [[ -d "migrations" ]] && [[ $(ls migrations/*.sql 2>/dev/null | wc -l) -gt 0 ]]; then
        log "Running SQL migrations..."
        bash "$SCRIPT_DIR/migrate-database.sh" "$ENVIRONMENT"
        log_success "SQL migrations completed"
    fi
}

seed_database() {
    log_section "SEEDING DATABASE"

    cd "$PROJECT_ROOT/backend"

    if [[ "$ENVIRONMENT" == "staging" ]]; then
        log "Seeding staging database..."
        npm run prisma:seed
        log_success "Database seeded"
    else
        log "Skipping seed for production environment"
    fi
}

################################################################################
# Health Check Functions
################################################################################

health_check_database() {
    log_section "CHECKING DATABASE HEALTH"

    cd "$PROJECT_ROOT/backend"

    log "Verifying database connectivity..."

    # Run a simple health check query via Node
    npm run test:smoke || {
        log_error "Database health check failed"
        return 1
    }

    log_success "Database health verified"
}

health_check_services() {
    log_section "CHECKING SERVICE HEALTH"

    local max_attempts=$MAX_HEALTH_RETRIES
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        attempt=$((attempt + 1))
        log "Health check attempt $attempt/$max_attempts..."

        if bash "$SCRIPT_DIR/health-check.sh" "$ENVIRONMENT" "$PLATFORM"; then
            log_success "All services are healthy"
            return 0
        fi

        if [[ $attempt -lt $max_attempts ]]; then
            log "Waiting ${HEALTH_CHECK_INTERVAL}s before retry..."
            sleep "$HEALTH_CHECK_INTERVAL"
        fi
    done

    log_error "Health checks failed after $max_attempts attempts"
    return 1
}

################################################################################
# AWS Deployment Functions
################################################################################

deploy_to_aws() {
    log_section "DEPLOYING TO AWS (ECS)"

    cd "$PROJECT_ROOT/backend"

    # Build Docker images
    log "Building Docker images..."
    bash "$SCRIPT_DIR/docker-build.sh" "$ENVIRONMENT"
    log_success "Docker images built"

    # Push to ECR
    log "Pushing to AWS ECR..."
    bash "$SCRIPT_DIR/push-to-ecr.sh" "$ENVIRONMENT"
    log_success "Images pushed to ECR"

    # Update ECS services
    log "Updating ECS services..."
    bash "$SCRIPT_DIR/ecs-deploy.sh" "$ENVIRONMENT"
    log_success "ECS services updated"

    # Record deployment state
    save_deployment_state "$ENVIRONMENT" "aws"
}

################################################################################
# Vercel Deployment Functions
################################################################################

deploy_to_vercel() {
    log_section "DEPLOYING TO VERCEL"

    log "Deploying frontend to Vercel..."
    bash "$SCRIPT_DIR/vercel-deploy.sh" "$ENVIRONMENT"
    log_success "Frontend deployed to Vercel"

    log "Deploying backend to Vercel Serverless Functions..."
    bash "$SCRIPT_DIR/vercel-backend-deploy.sh" "$ENVIRONMENT"
    log_success "Backend deployed to Vercel Functions"

    # Record deployment state
    save_deployment_state "$ENVIRONMENT" "vercel"
}

################################################################################
# State Management Functions
################################################################################

save_deployment_state() {
    local env=$1
    local platform=$2

    cat > "$DEPLOYMENT_STATE_FILE" <<EOF
{
  "deployment_id": "$DEPLOYMENT_ID",
  "environment": "$env",
  "platform": "$platform",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_commit": "$(cd "$PROJECT_ROOT" && git rev-parse HEAD)",
  "git_branch": "$(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD)",
  "version": "1.0.0"
}
EOF

    log_success "Deployment state saved"
}

get_deployment_state() {
    if [[ -f "$DEPLOYMENT_STATE_FILE" ]]; then
        cat "$DEPLOYMENT_STATE_FILE"
    fi
}

################################################################################
# Rollback Functions
################################################################################

rollback_deployment() {
    log_section "INITIATING ROLLBACK"

    local state=$(get_deployment_state)

    if [[ -z "$state" ]]; then
        log_error "No previous deployment state found. Cannot rollback."
        return 1
    fi

    log "Previous deployment info:"
    echo "$state" | tee -a "$DEPLOYMENT_LOG"

    bash "$SCRIPT_DIR/rollback.sh" "$ENVIRONMENT" "$PLATFORM" "$DEPLOYMENT_ID"
}

################################################################################
# Post-Deployment Functions
################################################################################

run_post_deployment_tests() {
    log_section "RUNNING POST-DEPLOYMENT TESTS"

    bash "$SCRIPT_DIR/post-deploy-tests.sh" "$ENVIRONMENT" "$PLATFORM"
}

run_smoke_tests() {
    log_section "RUNNING SMOKE TESTS"

    cd "$PROJECT_ROOT/backend"
    log "Running smoke tests..."
    npm run test:smoke
    log_success "Smoke tests passed"
}

################################################################################
# Monitoring Functions
################################################################################

start_deployment_monitoring() {
    log_section "STARTING DEPLOYMENT MONITORING"

    bash "$SCRIPT_DIR/monitor-deployment.sh" "$ENVIRONMENT" "$PLATFORM" "$DEPLOYMENT_ID" &
    local monitor_pid=$!

    log_success "Monitoring started (PID: $monitor_pid)"
    echo "$monitor_pid" > "${SCRIPT_DIR}/../.monitor-pid"
}

################################################################################
# Error Handling
################################################################################

cleanup_on_error() {
    local line_number=$1
    log_error "Deployment failed at line $line_number"

    log_section "ATTEMPTING AUTOMATIC ROLLBACK"
    rollback_deployment || log_warning "Rollback also failed - manual intervention may be required"

    log_section "DEPLOYMENT SUMMARY"
    deployment_summary

    exit 1
}

trap 'cleanup_on_error ${LINENO}' ERR

################################################################################
# Deployment Summary
################################################################################

deployment_summary() {
    log_section "DEPLOYMENT SUMMARY"

    log "Environment: $ENVIRONMENT"
    log "Platform: $PLATFORM"
    log "Deployment ID: $DEPLOYMENT_ID"
    log "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log "Git Commit: $(cd "$PROJECT_ROOT" && git rev-parse --short HEAD)"
    log "Git Branch: $(cd "$PROJECT_ROOT" && git rev-parse --abbrev-ref HEAD)"
    log "Log File: $DEPLOYMENT_LOG"

    if [[ -f "$DEPLOYMENT_STATE_FILE" ]]; then
        log "Deployment State:"
        cat "$DEPLOYMENT_STATE_FILE" | tee -a "$DEPLOYMENT_LOG"
    fi
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    log_section "STARTING DEPLOYMENT"
    log "Environment: $ENVIRONMENT"
    log "Platform: $PLATFORM"
    log "Deployment ID: $DEPLOYMENT_ID"

    # Pre-deployment checks
    validate_environment
    setup_environment_config || {
        if [[ "$ENVIRONMENT" == "production" ]]; then
            log_error "Production environment requires manual configuration"
            exit 1
        fi
    }

    # Build phase
    build_backend
    build_frontend

    # Database phase
    health_check_database
    run_database_migrations
    seed_database

    # Deployment phase
    if [[ "$PLATFORM" == "aws" ]]; then
        deploy_to_aws
    elif [[ "$PLATFORM" == "vercel" ]]; then
        deploy_to_vercel
    fi

    # Post-deployment phase
    health_check_services
    run_smoke_tests
    run_post_deployment_tests

    # Start monitoring
    start_deployment_monitoring

    # Success
    log_section "✅ DEPLOYMENT COMPLETED SUCCESSFULLY"
    deployment_summary

    exit 0
}

# Show usage if requested
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    cat <<EOF
Marsad Deployment Orchestrator

Usage: $(basename "$0") [ENVIRONMENT] [PLATFORM]

Arguments:
  ENVIRONMENT  Target environment (default: staging)
               - staging: Staging environment
               - production: Production environment

  PLATFORM     Deployment platform (default: aws)
               - aws: AWS ECS with RDS/ElastiCache
               - vercel: Vercel Serverless + Next.js

Examples:
  # Deploy staging to AWS
  $(basename "$0") staging aws

  # Deploy production to Vercel
  $(basename "$0") production vercel

  # Deploy staging to Vercel
  $(basename "$0") staging vercel

Environment Variables:
  AWS_REGION           AWS region (default: eu-central-1)
  AWS_PROFILE          AWS CLI profile
  VERCEL_TOKEN         Vercel API token (required for Vercel deployments)
  DATABASE_URL         Database connection string
  SLACK_WEBHOOK        Optional: Slack webhook for notifications

EOF
    exit 0
fi

# Run main deployment
main
