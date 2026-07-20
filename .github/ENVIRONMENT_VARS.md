# GitHub Actions Environment Variables & Secrets

## Environment Variables

Environment variables are configuration values that workflows can access. Unlike secrets, these are visible in logs.

### For All Environments

```bash
NODE_ENV=staging|production
LOG_LEVEL=debug|info|warn|error
```

### Staging Environment

Store as **Repository Secrets** or **Environment Secrets (staging)**:

```bash
# Frontend API Configuration
VITE_API_URL=https://api-staging.marsad.com
VITE_ENV=staging

# Backend Configuration
DATABASE_URL=postgresql://user:pass@db-staging.internal:5432/marsad_staging
REDIS_URL=redis://redis-staging.internal:6379
JWT_SECRET=your-staging-jwt-secret-key
JWT_EXPIRATION=3600
ENVIRONMENT=staging

# Email Service
SENDGRID_API_KEY=your-sendgrid-staging-key
SENDGRID_FROM_EMAIL=noreply@staging.marsad.com

# File Storage
AWS_S3_BUCKET=marsad-staging-bucket
AWS_REGION=eu-west-1

# Monitoring
SENTRY_DSN=https://your-staging-sentry-dsn@sentry.io/123456
```

### Production Environment

Store as **Environment Secrets (production)**:

```bash
# Frontend API Configuration
VITE_API_URL=https://api.marsad.com
VITE_ENV=production

# Backend Configuration
DATABASE_URL=postgresql://user:pass@db-prod.internal:5432/marsad
REDIS_URL=redis://redis-prod.internal:6379
JWT_SECRET=your-production-jwt-secret-key
JWT_EXPIRATION=7200
ENVIRONMENT=production

# Email Service
SENDGRID_API_KEY=your-sendgrid-production-key
SENDGRID_FROM_EMAIL=noreply@marsad.com

# File Storage
AWS_S3_BUCKET=marsad-production-bucket
AWS_REGION=eu-west-1

# Monitoring
SENTRY_DSN=https://your-production-sentry-dsn@sentry.io/123456
```

## Secrets

Secrets are encrypted and only decrypted when needed by workflows.

### Repository Secrets (all workflows)

Required by all workflows:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Vercel Secrets

Required for Vercel deployments:

```bash
VERCEL_TOKEN=your-vercel-token
VERCEL_ORG_ID=your-org-id
VERCEL_PROJECT_ID_FRONTEND_STAGING=prj_staging_xyz
VERCEL_PROJECT_ID_FRONTEND_PRODUCTION=prj_prod_xyz
```

### Code Quality Secrets (Optional)

For SonarQube scanning:
```bash
SONARQUBE_HOST_URL=https://sonar.your-domain.com
SONARQUBE_TOKEN=your-sonar-token
SONARQUBE_PROJECT_KEY=marsad
```

For Snyk scanning:
```bash
SNYK_TOKEN=your-snyk-token
```

For Codacy analysis:
```bash
CODACY_PROJECT_TOKEN=your-codacy-token
```

### Deployment Secrets

For backend deployment:
```bash
# Railway
RAILWAY_TOKEN=your-railway-token
RAILWAY_PROJECT_ID=your-project-id

# Render
RENDER_DEPLOY_HOOK_STAGING=https://api.render.com/deploy/...
RENDER_DEPLOY_HOOK_PRODUCTION=https://api.render.com/deploy/...

# AWS (if using Lambda/EC2)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=eu-west-1
```

## Security Best Practices

### 1. Secret Rotation

Rotate secrets every 90 days:
- Vercel tokens
- JWT secrets (in DB, not in secrets)
- API keys
- Database credentials

### 2. Least Privilege

Only grant necessary permissions:
- Vercel tokens: Limit to specific projects
- AWS credentials: Use IAM roles with specific permissions
- Database users: Read-only where possible

### 3. Environment Separation

Keep staging and production secrets separate:
- Never reuse production secrets in staging
- Use different database credentials
- Different API keys per environment

### 4. Audit Logging

Review secret access:
- GitHub: Settings → Audit log
- Vercel: Settings → Audit logs
- AWS: CloudTrail

### 5. Secret Scanning

Enable repository secret scanning:
- Settings → Code security and analysis
- Enable "Secret scanning"
- Enable "Push protection"

## Setup Instructions

### 1. Create Repository Secrets

```bash
# Go to: Settings → Secrets and variables → Actions

# Create new secret for each value:
# Name: SLACK_WEBHOOK_URL
# Value: https://hooks.slack.com/services/...

# Name: VERCEL_TOKEN
# Value: [from Vercel account settings]
# ... (repeat for all secrets)
```

### 2. Create Environment Secrets

```bash
# For Staging:
# Go to: Settings → Environments → staging
# Create new secret for each staging value

# For Production:
# Go to: Settings → Environments → production
# Create new secret for each production value
```

### 3. Verify Secrets in Workflow

Secrets are masked in logs automatically:
```yaml
- name: Verify secrets
  run: |
    echo "API_URL is set: ${{ secrets.STAGING_API_URL != '' }}"
    echo "Database configured: ${{ secrets.DATABASE_URL != '' }}"
```

## Environment-Specific Workflows

### Staging Deployment
- Runs on: `develop` branch push
- Secrets: From `staging` environment
- Database: Staging PostgreSQL
- API: Staging endpoints

### Production Deployment
- Runs on: `main` branch push
- Secrets: From `production` environment
- Database: Production PostgreSQL
- API: Production endpoints
- Requires: Approval from code owners

## Troubleshooting

### Secret not available in job
**Issue**: Workflow can't access secret
**Solution**:
- Check secret is created in correct location (repo or environment)
- Verify environment protection rules
- Ensure job has access to environment

### Null/undefined values
**Issue**: Variables are null
**Solution**:
- Check variable name matches exactly (case-sensitive)
- Verify variable format: `${{ secrets.VARIABLE_NAME }}`
- Ensure variable is created before running

### Secret masked as *** in logs
**This is correct behavior** - secrets are masked automatically

### Accidentally committed secret
**Action required**:
1. Rotate the secret immediately
2. Remove secret from commit history: `git filter-branch`
3. Force push to all branches
4. Update all systems using old secret

## Environment Variables Reference

### Frontend (.env)
```bash
VITE_API_URL=<staging or production API>
VITE_ENV=staging|production
VITE_LOG_LEVEL=debug|info|warn|error
```

### Backend (.env)
```bash
NODE_ENV=staging|production
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=<secure-random-string>
JWT_EXPIRATION=3600
LOG_LEVEL=info
```

### Deployment (.env)
```bash
VERCEL_TOKEN=<token>
VERCEL_ORG_ID=<org-id>
SLACK_WEBHOOK_URL=<webhook-url>
```

## Migration Guide

If moving from one hosting platform to another:

1. **Get new credentials** from new platform
2. **Update environment secrets** in GitHub
3. **Test with staging first** (develop branch)
4. **Monitor logs** for any issues
5. **Update production** only after verification
6. **Retire old secrets** after all systems migrated
