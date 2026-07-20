# Marsad Deployment Automation Scripts

Production-ready deployment automation system for the Marsad platform with support for AWS ECS and Vercel deployments.

## Overview

This directory contains a complete deployment automation suite with:

- **Primary Orchestrator:** `deploy.sh` - Main entry point
- **AWS Deployment:** Docker builds, ECR pushing, ECS updates
- **Vercel Deployment:** Frontend deployment to edge network
- **Database Management:** Prisma migrations, SQL migrations, validation
- **Health Checks:** Comprehensive service monitoring
- **Post-Deployment Tests:** Integration and security validation
- **Monitoring:** Real-time deployment health tracking
- **Rollback:** Automated failure recovery
- **Environment Setup:** Infrastructure configuration

## Quick Start

### 1. Initial Setup

```bash
# Configure deployment environment (one time)
cd scripts
bash environment-setup.sh staging

# Follow prompts to configure AWS and Vercel
```

### 2. Deploy to Staging

```bash
# Deploy to AWS ECS (Staging)
bash deploy.sh staging aws

# OR Deploy to Vercel (Staging)
bash deploy.sh staging vercel
```

### 3. Deploy to Production

```bash
# Production requires manual verification
bash deploy.sh production aws

# OR
bash deploy.sh production vercel
```

## Scripts Reference

### Core Deployment Scripts

#### `deploy.sh` [environment] [platform]
**Main deployment orchestrator**

- **Arguments:**
  - `environment`: `staging` or `production`
  - `platform`: `aws` or `vercel`

- **Features:**
  - Environment validation
  - Build backend and frontend
  - Database migrations
  - Health checks
  - Platform-specific deployment
  - Post-deployment tests
  - Automatic rollback on failure

- **Example:**
  ```bash
  ./deploy.sh staging aws
  ./deploy.sh production vercel
  ```

#### `environment-setup.sh` [environment]
**Configure deployment environment**

- **Sets up:**
  - AWS credentials and permissions
  - Vercel API tokens
  - Environment files
  - Docker daemon
  - Git configuration
  - SSL/TLS certificates
  - Secrets management

- **Usage:**
  ```bash
  ./environment-setup.sh staging
  ```

### AWS-Specific Scripts

#### `docker-build.sh` [environment]
**Build Docker images for all services**

- **Builds:**
  - Backend API (NestJS)
  - Frontend (React)
  - Background Worker (BullMQ)

- **Features:**
  - Multi-stage builds
  - Health checks
  - Security scanning (if trivy installed)
  - Vulnerability detection

- **Usage:**
  ```bash
  ./docker-build.sh staging
  ```

#### `push-to-ecr.sh` [environment]
**Push Docker images to AWS ECR**

- **Operations:**
  - ECR authentication
  - Repository creation
  - Image tagging (multiple tags)
  - Lifecycle policy configuration
  - Image verification

- **Output:**
  - `.ecr-images` file with image URIs

- **Usage:**
  ```bash
  ./push-to-ecr.sh staging
  ```

#### `ecs-deploy.sh` [environment]
**Deploy images to AWS ECS Fargate**

- **Updates:**
  - Task definitions
  - ECS services
  - Auto-scaling configuration
  - Health checks

- **Monitoring:**
  - Deployment status tracking
  - Service health verification
  - Error detection and alerting

- **Usage:**
  ```bash
  ./ecs-deploy.sh staging
  ```

### Vercel-Specific Scripts

#### `vercel-deploy.sh` [environment]
**Deploy frontend to Vercel**

- **Features:**
  - Production/preview deployment
  - Environment variable setup
  - Deployment verification
  - URL capture
  - Rollback support

- **Usage:**
  ```bash
  ./vercel-deploy.sh staging
  ```

### Health & Validation Scripts

#### `health-check.sh` [environment] [platform]
**Comprehensive health validation**

- **Checks:**
  - API endpoint health
  - Database connectivity
  - Redis cache connectivity
  - S3 access
  - Security headers
  - Environment configuration
  - Application logs for errors
  - Deployment status

- **Usage:**
  ```bash
  ./health-check.sh staging aws
  ```

#### `post-deploy-tests.sh` [environment] [platform]
**Post-deployment test suite**

- **Test Categories:**
  - API endpoints
  - Database integrity
  - Authentication
  - Security headers
  - CORS configuration
  - API response times
  - Concurrent request handling
  - Frontend accessibility
  - Error handling

- **Usage:**
  ```bash
  ./post-deploy-tests.sh staging aws
  ```

### Database Scripts

#### `migrate-database.sh` [environment] [--dry-run]
**Manage database migrations**

- **Handles:**
  - Prisma migrations
  - SQL migrations
  - Database validation
  - Backup creation (production)
  - Migration tracking

- **Flags:**
  - `--dry-run`: Preview migrations without executing

- **Usage:**
  ```bash
  # Preview migrations
  ./migrate-database.sh staging --dry-run

  # Apply migrations
  ./migrate-database.sh staging
  ```

### Monitoring & Rollback

#### `monitor-deployment.sh` [environment] [platform] [deployment-id]
**Real-time deployment monitoring**

- **Metrics:**
  - ECS service status
  - CloudWatch metrics (CPU, Memory)
  - Application error logs
  - Database health
  - Redis health
  - API response times

- **Alerts:**
  - Slack webhook notifications
  - Email alerts (configurable)
  - Log aggregation

- **Usage:**
  ```bash
  ./monitor-deployment.sh staging aws deployment-123 &
  ```

#### `rollback.sh` [environment] [platform] [deployment-id]
**Automated deployment rollback**

- **Capabilities:**
  - AWS ECS rollback (previous task definition)
  - Vercel rollback (switch to previous deployment)
  - Database migration rollback (manual-assisted)
  - Service health verification
  - Slack notifications

- **Usage:**
  ```bash
  ./rollback.sh staging aws deployment-123
  ```

## Environment Variables

### Required
```bash
# AWS Configuration
export AWS_REGION="eu-central-1"
export AWS_PROFILE="default"  # Optional

# Vercel Configuration
export VERCEL_TOKEN="your_token"

# Database (read from .env.$ENVIRONMENT)
# DATABASE_URL, JWT_SECRET, etc.
```

### Optional
```bash
# Deployment Configuration
export MONITORING_DURATION=3600        # Monitoring duration in seconds
export CHECK_INTERVAL=60               # Monitoring check interval
export MAX_HEALTH_RETRIES=30           # Max health check retries
export HEALTH_CHECK_INTERVAL=5         # Interval between health checks

# Notifications
export SLACK_WEBHOOK="https://hooks.slack.com/services/..."

# Custom Endpoints
export API_URL="http://localhost:3000"
```

## Configuration Files

### Environment Files
```
backend/.env.staging       # Staging configuration
backend/.env.production    # Production configuration (manual setup required)
backend/.env.example       # Template
```

### Generated Files
```
.ecr-images                # ECR image URIs (created by docker-build & push-to-ecr)
.vercel-url               # Vercel deployment URL
.deployment-state         # Current deployment metadata
logs/                     # Deployment logs directory
```

## Deployment Flow

### AWS Deployment Flow
```
1. validate-environment
2. setup-environment-config
3. build-backend
4. build-frontend
5. health-check-database
6. run-database-migrations
7. seed-database (staging only)
8. docker-build
9. push-to-ecr
10. ecs-deploy
11. health-check-services
12. smoke-tests
13. post-deployment-tests
14. start-monitoring
```

### Vercel Deployment Flow
```
1. validate-environment
2. setup-environment-config
3. build-backend
4. build-frontend
5. health-check-database
6. run-database-migrations
7. vercel-deploy-frontend
8. vercel-deploy-backend (serverless functions)
9. health-check-services
10. smoke-tests
11. post-deployment-tests
12. start-monitoring
```

## Monitoring & Alerts

### Log Files
All operations are logged to `logs/` directory:
- `deployment-YYYYMMDD-HHMMSS.log` - Main deployment log
- `health-check-*.log` - Health check results
- `migrations-*.log` - Database migration logs
- `post-deploy-tests-*.log` - Test results
- `monitoring-*.log` - Deployment monitoring
- `rollback-*.log` - Rollback operations

### Slack Integration
Configure Slack webhook for automated alerts:

```bash
export SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

Notifications include:
- Deployment start/completion
- Health check failures
- Rollback events
- Monitoring alerts

## Error Handling & Recovery

### Automatic Rollback
The deployment script automatically triggers rollback on:
- Health check failures
- Database migration errors
- ECS deployment timeouts
- Service startup failures

### Manual Rollback
```bash
# Rollback to previous deployment
./rollback.sh staging aws
```

### Logs & Debugging
```bash
# View deployment log
tail -f logs/deployment-*.log

# View specific service logs (AWS)
aws logs tail /ecs/marsad/staging/marsad-api --follow

# View Vercel deployment logs
vercel logs --prod
```

## Security Considerations

### Secrets Management
- Never commit `.env` files
- Use AWS Secrets Manager for production
- Rotate JWT secrets regularly
- Encrypt environment files

### IAM Permissions
Required AWS IAM permissions:
- ECS: `CreateService`, `UpdateService`, `DescribeServices`, `RegisterTaskDefinition`
- ECR: `GetDownloadUrlForLayer`, `GetAuthorizationToken`, `PutImage`
- CloudWatch: `PutMetricAlarm`, `DescribeAlarms`, `GetMetricStatistics`
- RDS: `ModifyDBInstance`, `DescribeDBInstances`
- S3: `GetObject`, `PutObject`, `ListBucket`

### SSL/TLS
- AWS: Certificate Manager (ACM) for ALB
- Vercel: Automatic HTTPS
- Database: Encryption in transit
- Redis: TLS encryption

## Performance Optimization

### Build Optimization
- Multi-stage Docker builds (reduce image size)
- Dependency caching in CI/CD
- Parallel builds for multiple services

### Deployment Optimization
- Blue-green deployments (via ECS)
- Canary deployments (via health checks)
- Zero-downtime updates
- Automated scaling

### Monitoring
- CloudWatch dashboards
- Application performance monitoring
- Custom metrics
- Alert thresholds

## Troubleshooting

### Common Issues

#### Docker Build Failures
```bash
# Clear Docker cache
docker system prune -a

# Rebuild
./docker-build.sh staging
```

#### Database Connection Errors
```bash
# Verify connectivity
psql $DATABASE_URL

# Check credentials
cat backend/.env.staging | grep DATABASE_URL
```

#### ECS Deployment Stuck
```bash
# Check service logs
aws logs tail /ecs/marsad/staging/marsad-api --follow

# Check task definitions
aws ecs describe-services --cluster marsad-staging --services marsad-api-staging
```

#### Vercel Deployment Issues
```bash
# Check Vercel logs
vercel logs

# Verify environment variables
vercel env list
```

### Getting Help

1. Check deployment logs in `logs/` directory
2. Review CloudWatch logs for errors
3. Run health checks: `./health-check.sh staging aws`
4. Check GitHub issues/wiki
5. Contact DevOps team

## Advanced Usage

### Dry Run Database Migrations
```bash
./migrate-database.sh staging --dry-run
```

### Custom Monitoring Duration
```bash
MONITORING_DURATION=7200 MONITORING_INTERVAL=30 \
  ./monitor-deployment.sh staging aws deployment-123 &
```

### Deployment to Multiple Regions
```bash
# Would require environment-specific configuration
for region in eu-central-1 us-east-1; do
  AWS_REGION=$region ./deploy.sh staging aws
done
```

## Maintenance

### Regular Tasks
- Review and rotate secrets quarterly
- Update Docker base images monthly
- Clean up old ECR images (lifecycle policy)
- Archive old deployment logs
- Update deployment documentation

### Performance Tuning
- Monitor CloudWatch metrics
- Adjust health check thresholds
- Scale ECS task sizes as needed
- Optimize database queries
- Cache optimization

## Support & Documentation

- **Project README:** `../../README.md`
- **Infrastructure:** `../../infrastructure/`
- **Architecture:** `../../ARCHITECTURE.txt`
- **Getting Started:** `../../GETTING_STARTED.md`
- **Troubleshooting:** `../../TROUBLESHOOTING.md`

## Contributing

When adding new deployment features:
1. Follow existing script patterns
2. Add comprehensive error handling
3. Include logging at each step
4. Add to main `deploy.sh` if needed
5. Update this README
6. Test in staging before production

## License

Part of the Marsad platform. All rights reserved.
