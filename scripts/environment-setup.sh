#!/bin/bash

################################################################################
# Environment Configuration Setup
#
# Initializes deployment environment configuration
# - Sets up AWS credentials
# - Configures Vercel tokens
# - Creates environment files
# - Validates all prerequisites
# - Stores secrets securely
#
# Usage: ./environment-setup.sh [environment]
################################################################################

set -euo pipefail

ENVIRONMENT="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SETUP_LOG="${SCRIPT_DIR}/../logs/environment-setup-$(date +%Y%m%d-%H%M%S).log"

# Ensure logs directory exists
mkdir -p "$(dirname "$SETUP_LOG")"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$SETUP_LOG"
}

success() {
    echo -e "${GREEN}[✓]${NC} $*" | tee -a "$SETUP_LOG"
}

error() {
    echo -e "${RED}[✗]${NC} $*" | tee -a "$SETUP_LOG"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $*" | tee -a "$SETUP_LOG"
}

info() {
    echo -e "${PURPLE}[i]${NC} $*" | tee -a "$SETUP_LOG"
}

################################################################################
# Prerequisite Checks
################################################################################

check_prerequisites() {
    log "Checking prerequisites..."

    local required_tools=("node" "npm" "git")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "Required tool not found: $tool"
            exit 1
        fi
    done
    success "All required tools found"
}

################################################################################
# AWS Configuration
################################################################################

setup_aws_credentials() {
    log "Setting up AWS credentials..."

    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        warning "AWS CLI is not installed"
        info "Install AWS CLI: https://aws.amazon.com/cli/"
        return 1
    fi

    # Check if credentials exist
    if [[ -f "$HOME/.aws/credentials" ]]; then
        success "AWS credentials file found"

        # List available profiles
        local profiles=$(grep -oP '^\[\K[^\]]+' "$HOME/.aws/credentials" || echo "default")
        info "Available AWS profiles:"
        echo "$profiles" | while read -r profile; do
            info "  - $profile"
        done

        return 0
    else
        warning "AWS credentials not configured"
        info "Configure AWS CLI with: aws configure"
        return 0
    fi
}

verify_aws_permissions() {
    log "Verifying AWS permissions..."

    if ! command -v aws &> /dev/null; then
        warning "AWS CLI not found, skipping permissions check"
        return 0
    fi

    # Test AWS access
    if aws sts get-caller-identity --region "${AWS_REGION:-eu-central-1}" > /dev/null 2>&1; then
        local account_id=$(aws sts get-caller-identity --query Account --output text)
        success "AWS access verified (Account: $account_id)"
        return 0
    else
        error "AWS credentials are not valid or not configured"
        return 1
    fi
}

################################################################################
# Vercel Configuration
################################################################################

setup_vercel_token() {
    log "Setting up Vercel token..."

    if [[ -n "${VERCEL_TOKEN:-}" ]]; then
        success "VERCEL_TOKEN environment variable is set"
        return 0
    fi

    warning "VERCEL_TOKEN is not set"
    info "Set it with: export VERCEL_TOKEN=your_token_here"
    info "Get a token from: https://vercel.com/account/tokens"
    return 0
}

verify_vercel_token() {
    log "Verifying Vercel token..."

    if [[ -z "${VERCEL_TOKEN:-}" ]]; then
        warning "VERCEL_TOKEN not set, skipping verification"
        return 0
    fi

    if curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
        "https://api.vercel.com/v2/user" > /dev/null 2>&1; then
        success "Vercel token is valid"
        return 0
    else
        error "Vercel token is invalid"
        return 1
    fi
}

################################################################################
# Environment File Setup
################################################################################

create_environment_file() {
    log "Setting up environment file..."

    local env_file="$PROJECT_ROOT/backend/.env.$ENVIRONMENT"
    local example_file="$PROJECT_ROOT/backend/.env.example"

    if [[ -f "$env_file" ]]; then
        success "Environment file already exists: $env_file"
        return 0
    fi

    if [[ ! -f "$example_file" ]]; then
        error "Example environment file not found: $example_file"
        return 1
    fi

    log "Creating $ENVIRONMENT environment file..."
    cp "$example_file" "$env_file"

    # Set environment-specific values
    if [[ "$ENVIRONMENT" == "production" ]]; then
        sed -i "s/NODE_ENV=\"development\"/NODE_ENV=\"production\"/g" "$env_file"
        sed -i "s/LOG_LEVEL=\"debug\"/LOG_LEVEL=\"warn\"/g" "$env_file"
        warning "⚠️  CRITICAL: Production environment file requires manual configuration!"
    else
        sed -i "s/NODE_ENV=\"development\"/NODE_ENV=\"$ENVIRONMENT\"/g" "$env_file"
        sed -i "s/LOG_LEVEL=\"debug\"/LOG_LEVEL=\"info\"/g" "$env_file"
    fi

    success "Environment file created: $env_file"
}

validate_environment_file() {
    log "Validating environment file..."

    local env_file="$PROJECT_ROOT/backend/.env.$ENVIRONMENT"

    if [[ ! -f "$env_file" ]]; then
        error "Environment file not found: $env_file"
        return 1
    fi

    source "$env_file"

    # Check required variables
    local required_vars=(
        "DATABASE_URL"
        "JWT_SECRET"
        "NODE_ENV"
        "PORT"
    )

    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done

    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        error "Missing required environment variables:"
        printf '%s\n' "${missing_vars[@]}" | while read -r var; do
            error "  - $var"
        done
        return 1
    fi

    success "Environment file is valid"
    return 0
}

################################################################################
# Docker Configuration
################################################################################

setup_docker() {
    log "Setting up Docker..."

    if ! command -v docker &> /dev/null; then
        warning "Docker is not installed"
        info "Install Docker: https://docs.docker.com/get-docker/"
        return 0
    fi

    if docker ps > /dev/null 2>&1; then
        success "Docker daemon is running"

        local docker_version=$(docker --version | grep -oP 'Docker version \K[^,]+')
        info "Docker version: $docker_version"

        return 0
    else
        error "Docker daemon is not running"
        info "Start Docker before proceeding"
        return 1
    fi
}

################################################################################
# GitHub Configuration
################################################################################

verify_git_configuration() {
    log "Verifying Git configuration..."

    if ! command -v git &> /dev/null; then
        error "Git is not installed"
        return 1
    fi

    # Check git user is configured
    local git_user=$(git config --global user.name || echo "")
    local git_email=$(git config --global user.email || echo "")

    if [[ -z "$git_user" ]] || [[ -z "$git_email" ]]; then
        warning "Git user not configured"
        info "Configure with:"
        info "  git config --global user.name \"Your Name\""
        info "  git config --global user.email \"your@email.com\""
        return 0
    fi

    success "Git configured as: $git_user <$git_email>"
    return 0
}

################################################################################
# SSL/TLS Configuration
################################################################################

setup_ssl_certificates() {
    log "Setting up SSL/TLS certificates..."

    if [[ "$ENVIRONMENT" == "production" ]]; then
        warning "Production environment detected"
        info "Ensure SSL/TLS certificates are configured:"
        info "  - AWS Certificate Manager (ACM) for ALB"
        info "  - Vercel automatic HTTPS"
        info "  - Database encryption in transit"
    fi

    return 0
}

################################################################################
# Secrets Management
################################################################################

setup_secrets_manager() {
    log "Setting up secrets management..."

    if [[ -z "${AWS_REGION:-}" ]]; then
        export AWS_REGION="eu-central-1"
    fi

    local secrets_file="$PROJECT_ROOT/.secrets.enc"

    if [[ -f "$secrets_file" ]]; then
        success "Secrets file exists: $secrets_file"
        return 0
    fi

    warning "Secrets file not found"
    info "Secrets should be stored securely using:"
    info "  - AWS Secrets Manager"
    info "  - AWS Systems Manager Parameter Store"
    info "  - Vercel Environment Variables"
    return 0
}

################################################################################
# Network Configuration
################################################################################

validate_network_connectivity() {
    log "Validating network connectivity..."

    # Check internet connection
    if ping -c 1 8.8.8.8 > /dev/null 2>&1; then
        success "Internet connection available"
    else
        warning "Internet connection may not be available"
    fi

    # Check database connectivity (if configured)
    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        source "$PROJECT_ROOT/backend/.env.$ENVIRONMENT"

        if [[ -n "${DATABASE_URL:-}" ]]; then
            local db_host=$(echo "$DATABASE_URL" | grep -oP 'postgresql://[^@]+@\K[^:/]+' || echo "")
            if [[ -n "$db_host" ]]; then
                if timeout 5 bash -c "echo > /dev/tcp/$db_host/5432" 2>/dev/null; then
                    success "Database connectivity verified"
                else
                    warning "Cannot reach database: $db_host"
                fi
            fi
        fi
    fi

    return 0
}

################################################################################
# Configuration Summary
################################################################################

print_configuration_summary() {
    log "=================================================="
    log "Environment Configuration Summary"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Setup Log: $SETUP_LOG"
    log ""

    info "Configuration Status:"

    # AWS
    if command -v aws &> /dev/null; then
        info "  ✓ AWS CLI installed"
    else
        info "  ✗ AWS CLI not installed"
    fi

    # Docker
    if command -v docker &> /dev/null; then
        info "  ✓ Docker installed"
    else
        info "  ✗ Docker not installed"
    fi

    # Vercel Token
    if [[ -n "${VERCEL_TOKEN:-}" ]]; then
        info "  ✓ Vercel token configured"
    else
        info "  ✗ Vercel token not configured"
    fi

    # Environment File
    if [[ -f "$PROJECT_ROOT/backend/.env.$ENVIRONMENT" ]]; then
        info "  ✓ Environment file exists"
    else
        info "  ✗ Environment file missing"
    fi

    log ""
    log "Next Steps:"
    log "1. Review and complete all configuration"
    log "2. Run: npm run build"
    log "3. Run: ./deploy.sh $ENVIRONMENT [aws|vercel]"
}

################################################################################
# Interactive Setup
################################################################################

run_interactive_setup() {
    log "Starting interactive environment setup..."
    log ""

    # AWS Setup
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log "AWS Configuration Required for Production"
        setup_aws_credentials
        verify_aws_permissions || warning "AWS permissions verification failed"
    fi

    # Vercel Setup
    if [[ -z "${VERCEL_TOKEN:-}" ]]; then
        setup_vercel_token
    else
        verify_vercel_token || warning "Vercel token verification failed"
    fi

    # Environment File
    create_environment_file
    validate_environment_file || warning "Environment file validation had issues"

    # Docker
    setup_docker || warning "Docker setup had issues"

    # Other configurations
    verify_git_configuration
    setup_ssl_certificates
    setup_secrets_manager
    validate_network_connectivity
}

################################################################################
# Main
################################################################################

main() {
    log "=================================================="
    log "Starting Environment Setup"
    log "=================================================="
    log "Environment: $ENVIRONMENT"
    log "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

    check_prerequisites
    run_interactive_setup

    log ""
    print_configuration_summary

    success "Environment setup completed"
    exit 0
}

trap 'error "Setup failed at line $LINENO"' ERR

main "$@"
