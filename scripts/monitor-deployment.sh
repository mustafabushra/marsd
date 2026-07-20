#!/bin/bash

################################################################################
# Deployment Monitoring Script
#
# Monitors deployment health and performance
# - Tracks application metrics
# - Monitors error rates
# - Watches resource utilization
# - Alerts on anomalies
# - Generates reports
#
# Usage: ./monitor-deployment.sh [environment] [platform] [deployment-id] &
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
PLATFORM="${2:-aws}"
DEPLOYMENT_ID="${3:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MONITOR_LOG="${SCRIPT_DIR}/../logs/monitoring-$(date +%Y%m%d-%H%M%S).log"
MONITORING_DURATION=${MONITORING_DURATION:-3600}  # Default 1 hour
CHECK_INTERVAL=${CHECK_INTERVAL:-60}               # Default 60 seconds

# Configuration
AWS_REGION="${AWS_REGION:-eu-central-1}"
CLUSTER_NAME="marsad-${ENVIRONMENT}"
ERROR_THRESHOLD=10
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85

# Ensure logs directory exists
mkdir -p "$(dirname "$MONITOR_LOG")"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Metrics tracking
START_TIME=$(date +%s)
CHECK_COUNT=0
ALERTS=()

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$MONITOR_LOG"
}

alert() {
    echo -e "${RED}[ALERT]${NC} $*" | tee -a "$MONITOR_LOG"
    ALERTS+=("$*")
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*" | tee -a "$MONITOR_LOG"
}

info() {
    echo -e "${GREEN}[i]${NC} $*" | tee -a "$MONITOR_LOG"
}

################################################################################
# Monitoring Functions
################################################################################

monitor_ecs_services() {
    log "Checking ECS services..."

    local services=("marsad-api-${ENVIRONMENT}" "marsad-worker-${ENVIRONMENT}")

    for service in "${services[@]}"; do
        local service_status=$(aws ecs describe-services \
            --region "$AWS_REGION" \
            --cluster "$CLUSTER_NAME" \
            --services "$service" \
            --query 'services[0]' \
            --output json 2>/dev/null || echo "{}")

        if [[ "$service_status" == "{}" ]]; then
            continue
        fi

        local running=$(echo "$service_status" | jq '.runningCount')
        local desired=$(echo "$service_status" | jq '.desiredCount')
        local pending=$(echo "$service_status" | jq '.pendingCount')
        local deployments=$(echo "$service_status" | jq '.deployments | length')

        info "Service $service - Running: $running/$desired, Pending: $pending, Deployments: $deployments"

        if [[ "$running" -lt "$desired" ]]; then
            alert "Service $service has fewer running tasks than desired"
        fi

        if [[ "$deployments" -gt 1 ]]; then
            warning "Service $service has multiple active deployments"
        fi
    done
}

monitor_cloudwatch_metrics() {
    log "Checking CloudWatch metrics..."

    if ! command -v aws &> /dev/null; then
        warning "AWS CLI not available, skipping CloudWatch metrics"
        return
    fi

    # Check CPU utilization
    local cpu_metrics=$(aws cloudwatch get-metric-statistics \
        --region "$AWS_REGION" \
        --namespace AWS/ECS \
        --metric-name CPUUtilization \
        --dimensions Name=ClusterName,Value="$CLUSTER_NAME" \
        --start-time "$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
        --period 300 \
        --statistics Average \
        --output json 2>/dev/null || echo "{}")

    local cpu_avg=$(echo "$cpu_metrics" | jq '.Datapoints[0].Average // 0')

    info "CPU Utilization: ${cpu_avg}%"

    if (( $(echo "$cpu_avg > $CPU_THRESHOLD" | bc -l) )); then
        alert "CPU utilization is high: ${cpu_avg}%"
    fi

    # Check Memory utilization
    local mem_metrics=$(aws cloudwatch get-metric-statistics \
        --region "$AWS_REGION" \
        --namespace AWS/ECS \
        --metric-name MemoryUtilization \
        --dimensions Name=ClusterName,Value="$CLUSTER_NAME" \
        --start-time "$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
        --period 300 \
        --statistics Average \
        --output json 2>/dev/null || echo "{}")

    local mem_avg=$(echo "$mem_metrics" | jq '.Datapoints[0].Average // 0')

    info "Memory Utilization: ${mem_avg}%"

    if (( $(echo "$mem_avg > $MEMORY_THRESHOLD" | bc -l) )); then
        alert "Memory utilization is high: ${mem_avg}%"
    fi
}

monitor_application_logs() {
    log "Checking application logs for errors..."

    if ! command -v aws &> /dev/null; then
        warning "AWS CLI not available, skipping log monitoring"
        return
    fi

    local log_group="/ecs/marsad/$ENVIRONMENT/marsad-api"

    # Check for ERROR level logs in last 5 minutes
    local error_count=$(aws logs filter-log-events \
        --log-group-name "$log_group" \
        --filter-pattern "ERROR" \
        --start-time $(($(date +%s) - 300))000 \
        --region "$AWS_REGION" \
        --query 'events | length(@)' \
        --output text 2>/dev/null || echo "0")

    info "Error logs (last 5 minutes): $error_count"

    if [[ $error_count -gt $ERROR_THRESHOLD ]]; then
        alert "High error rate detected in logs: $error_count errors"
    fi
}

monitor_database_health() {
    log "Checking database health..."

    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"
    fi

    # Extract connection details
    local db_host=$(echo "${DATABASE_URL:-}" | grep -oP 'postgresql://[^@]+@\K[^:/]+' || echo "localhost")

    if timeout 5 bash -c "echo > /dev/tcp/$db_host/5432" 2>/dev/null; then
        info "Database is reachable"
    else
        alert "Database is not reachable: $db_host:5432"
    fi
}

monitor_redis_health() {
    log "Checking Redis health..."

    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"
    fi

    local redis_host=$(echo "${REDIS_URL:-}" | grep -oP 'redis://\K[^:/]+' || echo "localhost")
    local redis_port=$(echo "${REDIS_URL:-}" | grep -oP ':\K[0-9]+(?:/|$)' || echo "6379")

    if timeout 5 bash -c "echo > /dev/tcp/$redis_host/$redis_port" 2>/dev/null; then
        info "Redis is reachable"
    else
        alert "Redis is not reachable: $redis_host:$redis_port"
    fi
}

monitor_api_endpoint() {
    log "Checking API endpoint..."

    local api_url="${API_URL:-http://localhost:3000}"

    local start_time=$(date +%s%N)
    local response=$(curl -s --max-time 10 \
        -w "\n%{http_code}" \
        "$api_url/api/health" 2>/dev/null || echo "error
000")
    local end_time=$(date +%s%N)

    local http_code=$(echo "$response" | tail -n1)
    local response_time=$(( (end_time - start_time) / 1000000 ))

    info "API Health - Status: $http_code, Response Time: ${response_time}ms"

    if [[ "$http_code" != "200" ]]; then
        alert "API health check failed: $http_code"
    fi

    if [[ $response_time -gt 5000 ]]; then
        alert "API response time is high: ${response_time}ms"
    fi
}

################################################################################
# Alert Management
################################################################################

send_alerts() {
    if [[ ${#ALERTS[@]} -eq 0 ]]; then
        return
    fi

    log "Sending alerts for ${#ALERTS[@]} issues..."

    # Send to Slack if webhook configured
    if [[ -n "${SLACK_WEBHOOK:-}" ]]; then
        local alert_message=$(printf '%s\n' "${ALERTS[@]}" | head -10)

        local slack_payload=$(cat <<EOF
{
    "text": "⚠️ Deployment Monitoring Alerts - $ENVIRONMENT ($PLATFORM)",
    "blocks": [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*Deployment Monitoring Alerts*\n*Environment:* $ENVIRONMENT\n*Platform:* $PLATFORM\n\`\`\`\n$alert_message\n\`\`\`"
            }
        }
    ]
}
EOF
)
        curl -X POST -H 'Content-type: application/json' \
            --data "$slack_payload" \
            "$SLACK_WEBHOOK" \
            --silent > /dev/null
    fi
}

################################################################################
# Monitoring Loop
################################################################################

run_monitoring_loop() {
    log "=================================================="
    log "Starting Deployment Monitoring"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Platform: $PLATFORM"
    log "Deployment ID: ${DEPLOYMENT_ID:-unknown}"
    log "Duration: ${MONITORING_DURATION}s"
    log "Interval: ${CHECK_INTERVAL}s"
    log ""

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - START_TIME))

        if [[ $elapsed -gt $MONITORING_DURATION ]]; then
            log "Monitoring duration reached, stopping..."
            break
        fi

        ((CHECK_COUNT++))

        log "=================================================="
        log "Monitoring Check #$CHECK_COUNT (Elapsed: ${elapsed}s)"
        log "=================================================="

        # Run all checks
        monitor_ecs_services || true
        monitor_cloudwatch_metrics || true
        monitor_application_logs || true
        monitor_database_health || true
        monitor_redis_health || true
        monitor_api_endpoint || true

        # Send alerts if any issues found
        send_alerts || true

        # Clear alerts for next iteration
        ALERTS=()

        # Wait for next check
        sleep "$CHECK_INTERVAL"
    done
}

################################################################################
# Monitoring Report
################################################################################

generate_monitoring_report() {
    log "=================================================="
    log "Deployment Monitoring Report"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Platform: $PLATFORM"
    log "Deployment ID: ${DEPLOYMENT_ID:-unknown}"
    log "Monitoring Duration: ${MONITORING_DURATION}s"
    log "Total Checks: $CHECK_COUNT"
    log "Check Interval: ${CHECK_INTERVAL}s"
    log ""
    log "Monitoring Log: $MONITOR_LOG"
    log ""
    log "Recommendations:"
    log "1. Review monitoring logs for any anomalies"
    log "2. Check CloudWatch dashboards for detailed metrics"
    log "3. Verify application logs for error details"
    log "4. Scale up resources if utilization remains high"
}

################################################################################
# Main
################################################################################

main() {
    run_monitoring_loop
    generate_monitoring_report
}

trap 'log "Monitoring interrupted"; generate_monitoring_report' SIGINT SIGTERM

main "$@"
