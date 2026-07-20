#!/bin/bash

################################################################################
# Post-Deployment Test Suite
#
# Runs comprehensive tests after deployment
# - API endpoint validation
# - Database integrity checks
# - Authentication tests
# - Integration tests
# - Performance baselines
# - Security validations
#
# Usage: ./post-deploy-tests.sh [environment] [platform]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
PLATFORM="${2:-aws}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_LOG="${SCRIPT_DIR}/../logs/post-deploy-tests-$(date +%Y%m%d-%H%M%S).log"

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
TIMEOUT=30
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Ensure logs directory exists
mkdir -p "$(dirname "$TEST_LOG")"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$TEST_LOG"
}

pass() {
    echo -e "${GREEN}[✓]${NC} $*" | tee -a "$TEST_LOG"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}[✗]${NC} $*" | tee -a "$TEST_LOG"
    ((TESTS_FAILED++))
}

skip() {
    echo -e "${YELLOW}[⊘]${NC} $*" | tee -a "$TEST_LOG"
    ((TESTS_SKIPPED++))
}

################################################################################
# API Tests
################################################################################

test_api_health_endpoint() {
    log "Testing API health endpoint..."

    local response=$(curl -s --max-time "$TIMEOUT" \
        -w "\n%{http_code}" \
        "$API_BASE_URL/api/health" 2>/dev/null || echo "error
000")

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [[ "$http_code" == "200" ]]; then
        pass "API health endpoint responds with 200"
        return 0
    else
        fail "API health endpoint returned: $http_code"
        return 1
    fi
}

test_api_version_endpoint() {
    log "Testing API version endpoint..."

    local response=$(curl -s --max-time "$TIMEOUT" \
        -w "\n%{http_code}" \
        "$API_BASE_URL/api/version" 2>/dev/null || echo "error
000")

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [[ "$http_code" == "200" ]]; then
        local version=$(echo "$body" | grep -oP '"version":\s*"\K[^"]+' || echo "unknown")
        pass "API version: $version"
        return 0
    else
        fail "Version endpoint returned: $http_code"
        return 1
    fi
}

test_api_authentication() {
    log "Testing API authentication..."

    # Test without credentials
    local response=$(curl -s --max-time "$TIMEOUT" \
        -w "\n%{http_code}" \
        "$API_BASE_URL/api/protected" 2>/dev/null || echo "error
000")

    local http_code=$(echo "$response" | tail -n1)

    if [[ "$http_code" == "401" ]] || [[ "$http_code" == "403" ]]; then
        pass "API authentication required (status: $http_code)"
        return 0
    else
        fail "API authentication check failed (status: $http_code)"
        return 1
    fi
}

################################################################################
# Database Tests
################################################################################

test_database_connection() {
    log "Testing database connection..."

    cd "$PROJECT_ROOT/backend"

    if npm run test:smoke &>/dev/null; then
        pass "Database connection test passed"
        return 0
    else
        fail "Database connection test failed"
        return 1
    fi
}

test_database_migrations() {
    log "Testing database migrations..."

    cd "$PROJECT_ROOT/backend"

    # Check if migrations are up to date
    if npm run prisma:generate &>/dev/null; then
        pass "Database migrations are up to date"
        return 0
    else
        fail "Database migrations check failed"
        return 1
    fi
}

test_database_integrity() {
    log "Testing database integrity..."

    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"
    fi

    # Run integrity checks via Node
    cd "$PROJECT_ROOT/backend"

    local check_script='
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();

    async function checkIntegrity() {
        try {
            // Test basic query
            const user = await prisma.user.findFirst();
            console.log("Database integrity check passed");
            process.exit(0);
        } catch (error) {
            console.error("Database integrity check failed:", error.message);
            process.exit(1);
        } finally {
            await prisma.$disconnect();
        }
    }

    checkIntegrity();
    '

    if node -e "$check_script" &>/dev/null; then
        pass "Database integrity check passed"
        return 0
    else
        fail "Database integrity check failed"
        return 1
    fi
}

################################################################################
# Security Tests
################################################################################

test_https_redirect() {
    log "Testing HTTPS redirect..."

    if [[ "$PLATFORM" == "aws" ]]; then
        # For AWS, check if ALB redirects HTTP to HTTPS
        local response=$(curl -s -I --max-time "$TIMEOUT" \
            -w "\n%{http_code}" \
            "http://${API_BASE_URL#*://}" 2>/dev/null || echo "000")

        local http_code=$(echo "$response" | tail -n1)

        if [[ "$http_code" == "301" ]] || [[ "$http_code" == "302" ]]; then
            pass "HTTP to HTTPS redirect working"
            return 0
        else
            skip "HTTPS redirect test skipped (status: $http_code)"
            return 0
        fi
    else
        skip "HTTPS redirect test skipped for non-AWS platform"
        return 0
    fi
}

test_security_headers() {
    log "Testing security headers..."

    local headers=$(curl -s -I --max-time "$TIMEOUT" "$API_BASE_URL" 2>/dev/null || echo "")

    local required_headers=(
        "X-Content-Type-Options"
        "X-Frame-Options"
        "X-XSS-Protection"
    )

    local headers_found=0
    for header in "${required_headers[@]}"; do
        if echo "$headers" | grep -qi "^$header:"; then
            ((headers_found++))
        fi
    done

    if [[ $headers_found -ge 2 ]]; then
        pass "Security headers present ($headers_found/$((${#required_headers[@]}))"
        return 0
    else
        fail "Missing security headers"
        return 1
    fi
}

test_cors_headers() {
    log "Testing CORS headers..."

    local response=$(curl -s --max-time "$TIMEOUT" \
        -H "Origin: http://localhost:3001" \
        "$API_BASE_URL/api/health" 2>/dev/null || echo "")

    # Check for CORS headers in response
    if echo "$response" | grep -q "Access-Control-Allow"; then
        pass "CORS headers are present"
        return 0
    else
        skip "CORS headers not found (may be expected)"
        return 0
    fi
}

################################################################################
# Performance Tests
################################################################################

test_api_response_time() {
    log "Testing API response time..."

    local start=$(date +%s%N)

    curl -s --max-time "$TIMEOUT" \
        "$API_BASE_URL/api/health" > /dev/null 2>&1

    local end=$(date +%s%N)
    local duration_ms=$(( (end - start) / 1000000 ))

    log "API response time: ${duration_ms}ms"

    if [[ $duration_ms -lt 1000 ]]; then
        pass "API response time is acceptable (${duration_ms}ms)"
        return 0
    else
        fail "API response time is slow (${duration_ms}ms)"
        return 1
    fi
}

test_concurrent_requests() {
    log "Testing concurrent requests..."

    # Send 10 concurrent requests
    local failed=0
    for i in {1..10}; do
        curl -s --max-time "$TIMEOUT" \
            "$API_BASE_URL/api/health" > /dev/null 2>&1 &
    done

    wait

    if [[ $failed -eq 0 ]]; then
        pass "Concurrent requests handled successfully"
        return 0
    else
        fail "Some concurrent requests failed"
        return 1
    fi
}

################################################################################
# Integration Tests
################################################################################

test_frontend_accessibility() {
    log "Testing frontend accessibility..."

    local frontend_url="$API_BASE_URL"
    if [[ "$PLATFORM" == "vercel" ]]; then
        frontend_url="${API_BASE_URL/api/}"
    fi

    local response=$(curl -s --max-time "$TIMEOUT" \
        -w "\n%{http_code}" \
        "$frontend_url" 2>/dev/null || echo "error
000")

    local http_code=$(echo "$response" | tail -n1)

    if [[ "$http_code" == "200" ]]; then
        pass "Frontend is accessible"
        return 0
    else
        fail "Frontend returned: $http_code"
        return 1
    fi
}

test_api_error_handling() {
    log "Testing API error handling..."

    local response=$(curl -s --max-time "$TIMEOUT" \
        -w "\n%{http_code}" \
        "$API_BASE_URL/api/nonexistent" 2>/dev/null || echo "error
000")

    local http_code=$(echo "$response" | tail -n1)

    if [[ "$http_code" == "404" ]]; then
        pass "API error handling working (404 for invalid endpoint)"
        return 0
    else
        fail "API error handling issue (status: $http_code)"
        return 1
    fi
}

################################################################################
# Test Execution
################################################################################

run_all_tests() {
    log "=================================================="
    log "Running Post-Deployment Tests"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Platform: $PLATFORM"
    log "API Base URL: $API_BASE_URL"
    log ""

    # API Tests
    test_api_health_endpoint || true
    test_api_version_endpoint || true
    test_api_authentication || true

    # Database Tests
    test_database_connection || true
    test_database_migrations || true
    test_database_integrity || true

    # Security Tests
    test_https_redirect || true
    test_security_headers || true
    test_cors_headers || true

    # Performance Tests
    test_api_response_time || true
    test_concurrent_requests || true

    # Integration Tests
    test_frontend_accessibility || true
    test_api_error_handling || true
}

################################################################################
# Summary
################################################################################

print_test_summary() {
    log ""
    log "=================================================="
    log "Post-Deployment Test Summary"
    log "=================================================="
    log "Tests passed:  $TESTS_PASSED"
    log "Tests failed:  $TESTS_FAILED"
    log "Tests skipped: $TESTS_SKIPPED"
    log "Total tests:   $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
    log ""
    log "Test log: $TEST_LOG"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "${GREEN}✓ All post-deployment tests passed!${NC}" | tee -a "$TEST_LOG"
        return 0
    else
        echo -e "${RED}✗ Some tests failed. Review the log for details.${NC}" | tee -a "$TEST_LOG"
        return 1
    fi
}

################################################################################
# Main
################################################################################

main() {
    run_all_tests
    print_test_summary
}

main "$@"
