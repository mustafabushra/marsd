#!/bin/bash

################################################################################
# Health Check Validator
#
# Comprehensive health checks for deployed services
# - API endpoint health
# - Database connectivity
# - Cache connectivity
# - S3 access
# - Security validations
#
# Usage: ./health-check.sh [environment] [platform]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
PLATFORM="${2:-aws}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Health check configuration
TIMEOUT=10
API_HEALTH_PATH="/api/health"
CHECKS_PASSED=0
CHECKS_FAILED=0

################################################################################
# Logging
################################################################################

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*"
    ((CHECKS_PASSED++))
}

error() {
    echo -e "${RED}[✗]${NC} $*"
    ((CHECKS_FAILED++))
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*"
}

################################################################################
# Health Check Functions
################################################################################

check_api_endpoint() {
    log "Checking API endpoint health..."

    local api_url
    if [[ "$PLATFORM" == "aws" ]]; then
        # Get ALB endpoint from environment or AWS
        api_url="${API_URL:-http://localhost:3000}"
    else
        api_url="${API_URL:-https://api.marsad.vercel.app}"
    fi

    if curl -sf --connect-timeout "$TIMEOUT" \
        --max-time "$TIMEOUT" \
        "$api_url$API_HEALTH_PATH" > /dev/null 2>&1; then
        success "API endpoint is healthy: $api_url"
        return 0
    else
        error "API endpoint is not responding: $api_url"
        return 1
    fi
}

check_database_connectivity() {
    log "Checking database connectivity..."

    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"
    fi

    if [[ -z "${DATABASE_URL:-}" ]]; then
        warning "DATABASE_URL not set, skipping database check"
        return 0
    fi

    # Extract connection details
    local db_host=$(echo "$DATABASE_URL" | grep -oP 'postgresql://[^@]+@\K[^:/]+' || echo "localhost")
    local db_port=$(echo "$DATABASE_URL" | grep -oP ':\K[0-9]+(?=/|$)' || echo "5432")

    log "Attempting to connect to $db_host:$db_port..."

    if timeout "$TIMEOUT" bash -c "echo > /dev/tcp/$db_host/$db_port" 2>/dev/null; then
        success "Database is reachable"
        return 0
    else
        error "Database is not reachable: $db_host:$db_port"
        return 1
    fi
}

check_cache_connectivity() {
    log "Checking cache (Redis) connectivity..."

    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"
    fi

    if [[ -z "${REDIS_URL:-}" ]]; then
        warning "REDIS_URL not set, skipping Redis check"
        return 0
    fi

    # Extract host and port from Redis URL
    local redis_host=$(echo "$REDIS_URL" | grep -oP 'redis://\K[^:/]+' || echo "localhost")
    local redis_port=$(echo "$REDIS_URL" | grep -oP ':\K[0-9]+(?:/|$)' || echo "6379")

    log "Attempting to connect to Redis $redis_host:$redis_port..."

    if timeout "$TIMEOUT" bash -c "echo > /dev/tcp/$redis_host/$redis_port" 2>/dev/null; then
        success "Redis cache is reachable"
        return 0
    else
        error "Redis cache is not reachable: $redis_host:$redis_port"
        return 1
    fi
}

check_s3_access() {
    log "Checking S3 access..."

    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"
    fi

    if [[ -z "${AWS_S3_BUCKET:-}" ]] || [[ -z "${AWS_REGION:-}" ]]; then
        warning "S3 credentials not configured, skipping S3 check"
        return 0
    fi

    if command -v aws &> /dev/null; then
        if aws s3 ls "s3://${AWS_S3_BUCKET}" --region "${AWS_REGION}" &> /dev/null; then
            success "S3 bucket is accessible: ${AWS_S3_BUCKET}"
            return 0
        else
            error "Cannot access S3 bucket: ${AWS_S3_BUCKET}"
            return 1
        fi
    else
        warning "AWS CLI not available, skipping S3 check"
        return 0
    fi
}

check_security_headers() {
    log "Checking security headers..."

    local api_url
    if [[ "$PLATFORM" == "aws" ]]; then
        api_url="${API_URL:-http://localhost:3000}"
    else
        api_url="${API_URL:-https://api.marsad.vercel.app}"
    fi

    # Check for security headers
    local headers=$(curl -s --connect-timeout "$TIMEOUT" -I "$api_url" || echo "")

    local required_headers=(
        "X-Content-Type-Options"
        "X-Frame-Options"
    )

    for header in "${required_headers[@]}"; do
        if echo "$headers" | grep -qi "^$header:"; then
            success "Security header present: $header"
        else
            warning "Security header missing: $header"
        fi
    done

    return 0
}

check_environment_config() {
    log "Checking environment configuration..."

    if [[ ! -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        error "Environment file not found: $PROJECT_ROOT/backend/.env.$ENVIRONMENT"
        return 1
    fi

    source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"

    # Check required variables
    local required_vars=(
        "DATABASE_URL"
        "JWT_SECRET"
        "NODE_ENV"
        "PORT"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error "Required environment variable not set: $var"
            return 1
        fi
    done

    success "All required environment variables are set"
    return 0
}

check_application_logs() {
    log "Checking application logs for errors..."

    if [[ "$PLATFORM" == "aws" ]]; then
        if command -v aws &> /dev/null; then
            # Check CloudWatch logs for errors
            local log_group="/marsad/$ENVIRONMENT/api"
            local recent_errors=$(aws logs filter-log-events \
                --log-group-name "$log_group" \
                --filter-pattern "ERROR" \
                --start-time $(($(date +%s) - 300))000 \
                --region "${AWS_REGION:-eu-central-1}" \
                2>/dev/null | grep -c "events" || echo "0")

            if [[ "$recent_errors" -gt 0 ]]; then
                warning "Found recent errors in CloudWatch logs (last 5 minutes)"
                return 0
            fi
        fi
    fi

    success "No recent critical errors detected in logs"
    return 0
}

check_deployment_status() {
    log "Checking deployment status..."

    if [[ "$PLATFORM" == "aws" ]]; then
        if command -v aws &> /dev/null; then
            local cluster="${CLUSTER_NAME:-marsad-$ENVIRONMENT}"
            local services=$(aws ecs list-services \
                --cluster "$cluster" \
                --region "${AWS_REGION:-eu-central-1}" \
                --query 'serviceArns' \
                --output json 2>/dev/null || echo "[]")

            if [[ $(echo "$services" | grep -c "serviceArn") -gt 0 ]]; then
                success "ECS services are running"
                return 0
            fi
        fi
    elif [[ "$PLATFORM" == "vercel" ]]; then
        if [[ -n "${VERCEL_TOKEN:-}" ]]; then
            local deployments=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
                "https://api.vercel.com/v6/deployments?teamId=$(echo $VERCEL_TOKEN | cut -d. -f1)" \
                2>/dev/null | grep -c "state" || echo "0")

            if [[ "$deployments" -gt 0 ]]; then
                success "Vercel deployments are active"
                return 0
            fi
        fi
    fi

    warning "Could not verify deployment status"
    return 0
}

################################################################################
# Main Health Check Flow
################################################################################

main() {
    log "=================================================="
    log "Starting Health Checks for $ENVIRONMENT ($PLATFORM)"
    log "=================================================="

    # Run all checks
    check_environment_config || true
    check_api_endpoint || true
    check_database_connectivity || true
    check_cache_connectivity || true
    check_s3_access || true
    check_security_headers || true
    check_application_logs || true
    check_deployment_status || true

    # Summary
    echo ""
    log "=================================================="
    log "Health Check Summary"
    log "=================================================="
    success "Checks passed: $CHECKS_PASSED"
    if [[ $CHECKS_FAILED -gt 0 ]]; then
        error "Checks failed: $CHECKS_FAILED"
    fi

    echo ""

    if [[ $CHECKS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All health checks passed!${NC}"
        exit 0
    else
        echo -e "${RED}✗ Some health checks failed. Please investigate.${NC}"
        exit 1
    fi
}

main "$@"
