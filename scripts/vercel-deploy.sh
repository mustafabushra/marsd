#!/bin/bash

################################################################################
# Vercel Deployment Script (Frontend)
#
# Deploys React frontend to Vercel
# - Authenticates with Vercel CLI
# - Deploys to Vercel edge network
# - Sets environment variables
# - Handles preview/production deploys
# - Monitors deployment status
#
# Usage: ./vercel-deploy.sh [environment]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
VERCEL_ORG_ID="${VERCEL_ORG_ID:-}"
VERCEL_PROJECT_ID="${VERCEL_PROJECT_ID:-}"
VERCEL_TOKEN="${VERCEL_TOKEN:-}"
PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-main}"

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
# Prerequisites
################################################################################

check_prerequisites() {
    log "Checking prerequisites..."

    # Check Vercel CLI
    if ! command -v vercel &> /dev/null; then
        log "Vercel CLI not found, installing..."
        npm install -g vercel
    fi
    success "Vercel CLI available"

    # Check Vercel token
    if [[ -z "${VERCEL_TOKEN}" ]]; then
        error "VERCEL_TOKEN environment variable not set"
        error "Set it with: export VERCEL_TOKEN=your_token_here"
        exit 1
    fi
    success "Vercel token configured"

    # Check Git
    if ! command -v git &> /dev/null; then
        error "Git is not installed"
        exit 1
    fi
    success "Git available"
}

################################################################################
# Environment Configuration
################################################################################

setup_environment_variables() {
    log "Setting up environment variables for Vercel..."

    local env_file="${PROJECT_ROOT}/backend/.env.${ENVIRONMENT}"

    if [[ ! -f "$env_file" ]]; then
        warning "Environment file not found: $env_file"
        return 0
    fi

    source "$env_file"

    # Build environment variables for Vercel
    local env_vars=""
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^# ]] && continue
        [[ -z "$line" ]] && continue

        # Extract key=value pairs
        local key=$(echo "$line" | cut -d= -f1)
        local value=$(echo "$line" | cut -d= -f2-)

        # Add to env vars (escaping quotes)
        env_vars+="$key=\"${value//\"/\\\"}\""$'\n'
    done < "$env_file"

    # Save to temporary file
    local temp_env_file="${SCRIPT_DIR}/../.vercel-env-${ENVIRONMENT}"
    echo "$env_vars" > "$temp_env_file"

    log "Environment variables prepared"
}

################################################################################
# Deployment
################################################################################

deploy_to_vercel() {
    log "Starting Vercel deployment for $ENVIRONMENT environment..."

    cd "$PROJECT_ROOT"

    # Determine deployment type
    local deploy_args="--token ${VERCEL_TOKEN}"
    local git_branch=$(git rev-parse --abbrev-ref HEAD)

    if [[ "$ENVIRONMENT" == "production" ]]; then
        if [[ "$git_branch" != "$PRODUCTION_BRANCH" ]]; then
            warning "Not on $PRODUCTION_BRANCH branch, deploying as preview instead"
            deploy_args+=" --archive=tar"
        else
            log "Deploying to production..."
            deploy_args+=" --prod"
        fi
    else
        log "Deploying to preview environment..."
    fi

    # Add organization and project IDs if available
    if [[ -n "$VERCEL_ORG_ID" ]]; then
        deploy_args+=" --scope $VERCEL_ORG_ID"
    fi

    # Run deployment
    log "Executing: vercel $deploy_args"

    local deployment_output=$(vercel $deploy_args 2>&1 || echo "")

    if echo "$deployment_output" | grep -q "Production:"; then
        local prod_url=$(echo "$deployment_output" | grep "Production:" | awk '{print $NF}')
        success "Deployment successful: $prod_url"
        echo "$prod_url" > "${SCRIPT_DIR}/../.vercel-url"
        return 0
    elif echo "$deployment_output" | grep -q "Preview:"; then
        local preview_url=$(echo "$deployment_output" | grep "Preview:" | awk '{print $NF}')
        success "Preview deployment successful: $preview_url"
        echo "$preview_url" > "${SCRIPT_DIR}/../.vercel-url"
        return 0
    else
        error "Deployment failed"
        echo "$deployment_output"
        return 1
    fi
}

################################################################################
# Deployment Verification
################################################################################

verify_deployment() {
    log "Verifying Vercel deployment..."

    if [[ ! -f "${SCRIPT_DIR}/../.vercel-url" ]]; then
        error "Deployment URL not found"
        return 1
    fi

    local deploy_url=$(cat "${SCRIPT_DIR}/../.vercel-url")
    log "Deployment URL: $deploy_url"

    # Check deployment status via API
    if [[ -n "${VERCEL_TOKEN}" ]]; then
        log "Checking deployment status..."

        local deployments=$(curl -s \
            -H "Authorization: Bearer ${VERCEL_TOKEN}" \
            "https://api.vercel.com/v6/deployments?limit=1" | jq '.deployments[0]')

        if [[ -n "$deployments" ]]; then
            local state=$(echo "$deployments" | jq -r '.state')
            local url=$(echo "$deployments" | jq -r '.url')

            log "Deployment state: $state"
            log "Deployment URL: https://$url"

            if [[ "$state" == "READY" ]]; then
                success "Deployment is ready"
                return 0
            elif [[ "$state" == "BUILDING" ]]; then
                warning "Deployment is still building, this may take a few minutes"
                return 0
            else
                error "Deployment state: $state"
                return 1
            fi
        fi
    fi

    # Verify via HTTP request
    log "Verifying HTTP connectivity to $deploy_url"
    if curl -sf --max-time 10 "$deploy_url" > /dev/null; then
        success "Vercel deployment is accessible"
        return 0
    else
        error "Cannot access Vercel deployment"
        return 1
    fi
}

################################################################################
# Rollback
################################################################################

rollback_vercel_deployment() {
    log "Rolling back Vercel deployment..."

    if [[ -z "${VERCEL_TOKEN}" ]]; then
        error "VERCEL_TOKEN not set, cannot rollback"
        return 1
    fi

    # Get previous deployment
    local previous_deployment=$(curl -s \
        -H "Authorization: Bearer ${VERCEL_TOKEN}" \
        "https://api.vercel.com/v6/deployments?limit=2" | jq '.deployments[1]')

    if [[ -z "$previous_deployment" ]] || [[ "$previous_deployment" == "null" ]]; then
        error "No previous deployment found to rollback to"
        return 1
    fi

    local previous_url=$(echo "$previous_deployment" | jq -r '.url')
    local deployment_id=$(echo "$previous_deployment" | jq -r '.id')

    log "Rolling back to: https://$previous_url"

    # Re-deploy production alias to previous deployment
    if [[ "$ENVIRONMENT" == "production" ]]; then
        curl -X PATCH \
            -H "Authorization: Bearer ${VERCEL_TOKEN}" \
            "https://api.vercel.com/v3/deployments/$deployment_id" \
            -d '{"target": "production"}' \
            -H "Content-Type: application/json"

        success "Rolled back to previous production deployment"
    fi
}

################################################################################
# Summary
################################################################################

print_deployment_summary() {
    log "=================================================="
    log "Vercel Deployment Summary"
    log "=================================================="
    log "Environment: $ENVIRONMENT"

    if [[ -f "${SCRIPT_DIR}/../.vercel-url" ]]; then
        local deploy_url=$(cat "${SCRIPT_DIR}/../.vercel-url")
        log "Deployment URL: $deploy_url"
    fi

    log ""
    log "Next steps:"
    log "1. Verify deployment: Visit the deployment URL"
    log "2. Run health checks: ./health-check.sh $ENVIRONMENT vercel"
    log "3. Run post-deployment tests: ./post-deploy-tests.sh $ENVIRONMENT vercel"
}

################################################################################
# Main Flow
################################################################################

main() {
    log "=================================================="
    log "Starting Vercel Deployment"
    log "=================================================="
    log "Environment: $ENVIRONMENT"

    check_prerequisites
    setup_environment_variables

    # Deploy to Vercel
    if deploy_to_vercel; then
        success "Vercel deployment completed"

        # Verify deployment
        sleep 5  # Give Vercel a moment to initialize
        if verify_deployment; then
            print_deployment_summary
            exit 0
        else
            warning "Deployment verification had issues, but deployment may still be successful"
            print_deployment_summary
            exit 0
        fi
    else
        error "Vercel deployment failed"
        exit 1
    fi
}

trap 'error "Deployment failed at line $LINENO"' ERR

main "$@"
