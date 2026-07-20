# GitHub Actions CI/CD Setup Guide

This guide walks you through setting up GitHub Actions CI/CD for the Marsad project.

## Quick Overview

The Marsad project uses GitHub Actions for:
- **CI/CD Automation**: Lint, test, and build on every push
- **Security Scanning**: Dependency audits, SAST, and vulnerability scanning
- **Code Coverage**: Track and enforce coverage thresholds
- **Deployment**: Automated staging and production deployments
- **Quality Assurance**: Cross-platform testing, type checking

## Workflow Files

### 1. `ci.yml` - Continuous Integration
Runs on every push and pull request to `main`, `develop`, and feature branches.

**Jobs:**
- `lint-and-test`: ESLint, Prettier, TypeScript type checking, Jest tests
- `security-scan`: npm audit checks
- `test-coverage`: Code coverage collection and threshold validation

**Triggers:**
- Push to `main`, `develop`, feature branches
- Pull requests to `main`, `develop`

### 2. `security.yml` - Security Scanning
Comprehensive security scanning including dependency checks, SAST, and vulnerability scanning.

**Jobs:**
- `dependency-check`: npm audit across all packages
- `code-quality`: TypeScript type checking
- `sonarqube-scan`: Static code analysis (optional)
- `snyk-scan`: Snyk vulnerability scanning (optional)
- `trivy-scan`: Container/filesystem scanning
- `codeql-scan`: GitHub CodeQL analysis
- `license-compliance`: License checking

**Triggers:**
- Push to `main`, `develop`
- Pull requests to `main`, `develop`
- Daily schedule at 2 AM UTC

### 3. `code-coverage.yml` - Code Coverage Reports
Generates and tracks code coverage metrics.

**Jobs:**
- `coverage-backend`: Jest coverage reporting
- `coverage-report`: Report generation and publishing
- `enforce-coverage`: Coverage threshold validation

**Integration:**
- Codecov
- Codacy (optional)
- GitHub PR comments with delta reporting

### 4. `test-matrix.yml` - Cross-Platform Tests
Tests across Node versions and database versions.

**Matrix Tests:**
- Backend: Node 18.x, 20.x with PostgreSQL 15, 16
- Agents: Node 18.x, 20.x
- Frontend: Node 18.x, 20.x
- Integration Tests: Full stack testing

**Services:**
- PostgreSQL
- Redis

### 5. `deploy-staging.yml` - Staging Deployment
Automated deployment to staging environment on `develop` branch updates.

**Steps:**
1. Build all packages
2. Run tests
3. Deploy frontend to Vercel
4. Deploy backend (Railway/Render/Vercel)
5. Health checks
6. Slack notifications

**Requirements:**
- Vercel account and tokens
- STAGING_API_URL secret
- STAGING_FRONTEND_URL secret

### 6. `deploy-production.yml` - Production Deployment
Production deployment with comprehensive checks.

**Jobs:**
- `pre-deployment-checks`: Validates all tests and builds
- `deploy-production`: Production deployment

**Features:**
- Pre-deployment checks (tests, builds)
- Vercel deployment
- Backend deployment
- Health checks with retry
- GitHub releases (on tags)
- Slack notifications

**Requirements:**
- Vercel account and tokens
- PRODUCTION_API_URL secret
- PRODUCTION_FRONTEND_URL secret

### 7. `status-checks.yml` - Workflow Status Monitoring
Monitors all workflow runs and posts status to PRs.

## Setting Up GitHub Actions

### Step 1: Repository Setup

```bash
# Ensure .github/workflows directory exists with all workflow files
ls -la .github/workflows/

# Verify all workflow files are present
git add .github/workflows/
git commit -m "Add GitHub Actions CI/CD workflows"
git push origin main
```

### Step 2: Configure Secrets

Go to: **Repository Settings → Secrets and variables → Actions**

#### Required Secrets

**General:**
- `SLACK_WEBHOOK_URL` - Slack webhook for notifications

**Vercel (Frontend):**
- `VERCEL_TOKEN` - Vercel API token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID_FRONTEND_STAGING` - Staging project ID
- `VERCEL_PROJECT_ID_FRONTEND_PRODUCTION` - Production project ID

**Environment URLs:**
- `STAGING_API_URL` - Staging backend API URL
- `STAGING_FRONTEND_URL` - Staging frontend URL
- `PRODUCTION_API_URL` - Production backend API URL
- `PRODUCTION_FRONTEND_URL` - Production frontend URL

**Optional - Code Quality:**
- `SONARQUBE_TOKEN` - SonarQube token
- `SONARQUBE_HOST_URL` - SonarQube server URL
- `SONARQUBE_PROJECT_KEY` - SonarQube project key
- `SNYK_TOKEN` - Snyk API token
- `CODACY_PROJECT_TOKEN` - Codacy project token
- `CODECOV_TOKEN` - Codecov token (optional)

### Step 3: Configure Environments

Go to: **Repository Settings → Environments**

#### Staging Environment
```
Name: staging
Deployment branches: develop
Required reviewers: (optional)
```

**Secrets:**
- `STAGING_API_URL`
- `STAGING_FRONTEND_URL`

#### Production Environment
```
Name: production
Deployment branches: main
Required reviewers: At least 1 person
```

**Secrets:**
- `PRODUCTION_API_URL`
- `PRODUCTION_FRONTEND_URL`

### Step 4: Configure Branch Protection

Go to: **Repository Settings → Branches**

#### For `main` branch:
- Require status checks to pass before merging:
  - `lint-and-test`
  - `security-scan`
  - `test-coverage`
- Require branches to be up to date
- Require code reviews before merging (recommended: 1)
- Require status checks to pass
- Include administrators in restrictions

#### For `develop` branch:
- Require status checks to pass before merging:
  - `lint-and-test`
  - `security-scan`

### Step 5: Get Secrets

#### Vercel Token
```bash
# https://vercel.com/account/tokens
# Create new token
# Scope: Full Account
# Copy token to VERCEL_TOKEN secret
```

#### Vercel Org ID
```bash
# From Vercel dashboard URL: https://vercel.com/team/[ORG_ID]
# Or get via CLI: vercel teams list
```

#### Vercel Project IDs
```bash
# Get from project settings in Vercel dashboard
# Or via CLI:
vercel projects list
vercel env pull
```

#### Slack Webhook
```bash
# 1. Create Slack App: https://api.slack.com/apps
# 2. Enable "Incoming Webhooks"
# 3. Create webhook for your channel
# 4. Copy webhook URL to SLACK_WEBHOOK_URL secret
```

### Step 6: Configure Package Scripts

Ensure the following npm scripts are configured in each `package.json`:

**Backend (`backend/package.json`):**
```json
{
  "scripts": {
    "build": "tsc",
    "test": "jest --forceExit --detectOpenHandles",
    "test:cov": "jest --coverage",
    "lint": "eslint src --max-warnings 0",
    "format:check": "prettier --check .",
    "format": "prettier --write ."
  }
}
```

**Agents (`agents/package.json`):**
```json
{
  "scripts": {
    "build": "tsc",
    "test": "tsx test/agents.test.ts",
    "lint": "eslint . --max-warnings 0",
    "format:check": "prettier --check .",
    "format": "prettier --write ."
  }
}
```

**Frontend (`package.json`):**
```json
{
  "scripts": {
    "build": "vite build",
    "lint": "eslint src --max-warnings 0",
    "format:check": "prettier --check .",
    "format": "prettier --write ."
  }
}
```

### Step 7: Add Linting and Formatting Tools

#### Backend ESLint
```bash
cd backend
npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier
```

**`.eslintrc.json`:**
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["warn"],
    "no-console": "warn"
  }
}
```

#### Agents ESLint
```bash
cd agents
npm install --save-dev eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier prettier
```

**`.eslintrc.json`:** (same as backend)

**`.prettierrc.json`:**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

#### Frontend ESLint
```bash
npm install --save-dev eslint eslint-plugin-react @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier
```

**`.eslintrc.json`:**
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "prettier"
  ],
  "rules": {
    "react/react-in-jsx-scope": "off"
  }
}
```

### Step 8: Enable GitHub Actions

1. Go to **Repository Settings → Actions**
2. Under "Actions permissions", select:
   - "Allow all actions and reusable workflows"
   - Or specify trusted actions (recommended):
     - `actions/checkout`
     - `actions/setup-node`
     - `actions/github-script`
     - `codecov/codecov-action`
     - `github/codeql-action`
     - `amondnet/vercel-action`

### Step 9: Test the Setup

Push a test commit to trigger workflows:

```bash
# Create a feature branch
git checkout -b test/ci-setup

# Make a small change
echo "# Test" >> README.md

# Commit and push
git add -A
git commit -m "Test CI/CD setup"
git push origin test/ci-setup

# Watch the Actions tab in GitHub
# Open: https://github.com/[owner]/[repo]/actions
```

## Troubleshooting

### Workflow not triggering
- Check branch protection rules
- Verify workflows are enabled
- Check file paths in workflow triggers

### Tests failing in CI but passing locally
- Different Node versions (use same as CI)
- Environment variables not set
- Different database state
- Missing dependencies

### Secrets not accessible
- Verify secrets are set in correct environment
- Check environment protection rules
- Ensure workflow has access to environment

### Vercel deployment failing
- Verify VERCEL_TOKEN is valid
- Check VERCEL_ORG_ID and VERCEL_PROJECT_ID
- Ensure project is in the correct Vercel organization

### Coverage not being uploaded
- Verify coverage reports are generated
- Check Codecov token is set
- Ensure lcov.info or coverage-final.json exists

## Monitoring and Maintenance

### Regular Checks
1. Review failing workflows weekly
2. Monitor code coverage trends
3. Keep dependencies updated
4. Review security scanning results

### Performance Optimization
- Cache node_modules
- Use matrix strategy for parallelization
- Minimize build steps
- Use smaller Docker images

### Security Best Practices
1. Rotate secrets regularly
2. Use environment-specific secrets
3. Enable branch protection on main
4. Require code reviews
5. Monitor GitHub Security advisories

## Documentation References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)
- [Vercel CLI](https://vercel.com/docs/cli)
- [Jest Documentation](https://jestjs.io/)
- [ESLint Documentation](https://eslint.org/)
- [Prettier Documentation](https://prettier.io/)

## Next Steps

1. [ ] Create all workflow files in `.github/workflows/`
2. [ ] Configure repository secrets
3. [ ] Set up environments (staging, production)
4. [ ] Configure branch protection rules
5. [ ] Install linting and testing tools
6. [ ] Test workflow with a test commit
7. [ ] Monitor first few workflow runs
8. [ ] Optimize for performance
9. [ ] Document team-specific processes
10. [ ] Set up Slack notifications
