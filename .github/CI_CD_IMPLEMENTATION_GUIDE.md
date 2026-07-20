# GitHub Actions CI/CD Implementation Guide for Marsad

This is the complete implementation guide for setting up production-ready CI/CD pipelines for the Marsad project.

## Overview

The Marsad CI/CD system provides:
- **Automated Testing & Linting** on every commit
- **Security Scanning** including dependency audits and vulnerability detection
- **Code Coverage Tracking** with threshold enforcement
- **Staged Deployments** to staging and production
- **Automated Health Checks** post-deployment
- **Team Notifications** via Slack

## File Structure

```
.github/
├── workflows/
│   ├── ci.yml                          # Main CI pipeline
│   ├── security.yml                    # Security scanning
│   ├── code-coverage.yml               # Coverage tracking
│   ├── test-matrix.yml                 # Cross-platform tests
│   ├── deploy-staging.yml              # Staging deployment
│   ├── deploy-production.yml           # Production deployment
│   └── status-checks.yml               # Workflow monitoring
├── CICD_SETUP.md                       # Setup instructions
├── ENVIRONMENT_VARS.md                 # Secrets & env vars guide
├── CI_CD_IMPLEMENTATION_GUIDE.md       # This file
├── pull_request_template.md            # PR template
├── CODEOWNERS                          # Code ownership
└── GITIGNORE_TEMPLATE.md               # .gitignore reference

.eslintrc.json                          # Frontend ESLint config
.prettierrc.json                        # Frontend Prettier config
backend/.eslintrc.json                  # Backend ESLint config
agents/.eslintrc.json                   # Agents ESLint config
agents/.prettierrc.json                 # Agents Prettier config
```

## Implementation Checklist

### Phase 1: Setup Infrastructure

- [ ] Create `.github/workflows/` directory
- [ ] Add all workflow files (.yml files)
- [ ] Add ESLint configs (.eslintrc.json)
- [ ] Add Prettier configs (.prettierrc.json)
- [ ] Commit and push to GitHub

```bash
git add .github/
git commit -m "Add GitHub Actions CI/CD workflows and configurations"
git push origin main
```

### Phase 2: Configure Secrets & Variables

#### 2.1 Create Organization/Repository Secrets
Go to: Settings → Secrets and variables → Actions

Required secrets:
```
SLACK_WEBHOOK_URL
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID_FRONTEND_STAGING
VERCEL_PROJECT_ID_FRONTEND_PRODUCTION
```

#### 2.2 Create Environment Secrets

**For `staging` environment:**
- STAGING_API_URL
- STAGING_FRONTEND_URL

**For `production` environment:**
- PRODUCTION_API_URL
- PRODUCTION_FRONTEND_URL

See `ENVIRONMENT_VARS.md` for complete list.

### Phase 3: Configure Branch Protection

Go to: Settings → Branches → Add rule

**For `main` branch:**
```yaml
Pattern: main
- [x] Require status checks to pass
- [x] Require up to date branches
- [x] Require code reviews (1-2 people)
- [x] Dismiss stale PR approvals
- [x] Include administrators
```

Status checks required:
- lint-and-test
- security-scan
- code-coverage

**For `develop` branch:**
```yaml
Pattern: develop
- [x] Require status checks to pass
- [x] Require up to date branches
- [x] Require code reviews (1 person)
```

### Phase 4: Install Dev Dependencies

#### 4.1 Backend ESLint & Prettier
```bash
cd backend
npm install --save-dev \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-config-prettier \
  prettier
```

#### 4.2 Agents ESLint & Prettier
```bash
cd agents
npm install --save-dev \
  eslint \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-config-prettier \
  prettier
```

#### 4.3 Frontend ESLint
```bash
cd /
npm install --save-dev \
  eslint \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  eslint-config-prettier \
  prettier
```

### Phase 5: Update Package.json Scripts

All three `package.json` files should have:
```json
"scripts": {
  "lint": "eslint . --max-warnings 0",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

This has already been done. Verify:
```bash
npm run lint --help
npm run format:check --help
```

### Phase 6: Enable Actions

Go to: Settings → Actions

Select: "Allow all actions and reusable workflows"
Or specify trusted actions (recommended)

### Phase 7: Configure Notifications

#### 7.1 Slack Integration
1. Create Slack App: https://api.slack.com/apps/create
2. Enable "Incoming Webhooks"
3. Create webhook for deployment channel
4. Add `SLACK_WEBHOOK_URL` to repository secrets

#### 7.2 GitHub Notifications
1. Go to: Settings → Notifications
2. Enable workflow notifications
3. Choose notification preferences

### Phase 8: Test the Setup

#### Test 1: Feature Branch
```bash
git checkout -b test/ci-setup
echo "# CI Test" >> README.md
git add README.md
git commit -m "Test CI setup"
git push origin test/ci-setup
```

Watch: GitHub → Actions tab

Expected: `ci.yml` runs successfully

#### Test 2: Pull Request
1. Create PR from `test/ci-setup` → `develop`
2. Wait for CI checks to pass
3. Request review
4. Merge after approval

#### Test 3: Merge to Develop
1. Push a test commit to `develop`
2. Should trigger staging deployment
3. Monitor Slack for deployment notification

#### Test 4: Production Push
1. Create tag: `git tag v1.0.0`
2. Push tag: `git push origin v1.0.0`
3. Or merge `develop` → `main`
4. Should trigger production deployment

## Workflow Details

### CI Workflow (`ci.yml`)

**Triggers:**
- Push to main/develop/feature branches
- Pull requests to main/develop

**Jobs:**
1. **lint-and-test**
   - Tests: Node 18.x, 20.x
   - Checks: ESLint, Prettier, TypeScript, Jest
   - Time: ~10-15 minutes

2. **security-scan**
   - npm audit across packages
   - Continues on error

3. **test-coverage**
   - Jest coverage reporting
   - Threshold enforcement (70% lines, 60% branches)
   - PR comments with delta

### Security Workflow (`security.yml`)

**Triggers:**
- Push to main/develop
- Pull requests to main/develop
- Daily at 2 AM UTC

**Jobs:**
1. **dependency-check** - npm audit
2. **code-quality** - TypeScript checks
3. **sonarqube-scan** - Optional SAST
4. **snyk-scan** - Optional vulnerability scanning
5. **trivy-scan** - Filesystem scanning
6. **codeql-scan** - GitHub CodeQL
7. **license-compliance** - License checking

### Deployment Workflow (`deploy-production.yml`)

**Triggers:**
- Push to main branch
- Version tags (v*.*.*)

**Jobs:**
1. **pre-deployment-checks**
   - Run all tests
   - Build verification
   - Type checking

2. **deploy-production**
   - Build all packages
   - Deploy to Vercel (frontend)
   - Deploy backend
   - Health checks (retry up to 5 times)
   - Create GitHub release (if tagged)
   - Slack notification

## Monitoring & Maintenance

### Weekly Tasks
- [ ] Review failed workflows
- [ ] Check code coverage trends
- [ ] Monitor security alerts
- [ ] Review Slack notifications

### Monthly Tasks
- [ ] Rotate secrets (especially tokens)
- [ ] Update dependencies
- [ ] Review and optimize workflows
- [ ] Audit GitHub Actions usage

### Quarterly Tasks
- [ ] Full security audit
- [ ] Performance optimization review
- [ ] Update documentation
- [ ] Review cost analysis (if using paid features)

## Troubleshooting

### Workflow not triggering
**Issue:** Workflow YAML in `.github/workflows/` but not running

**Solution:**
1. Check YAML syntax: `yamllint .github/workflows/`
2. Verify branch name matches trigger
3. Check branch protection rules
4. Refresh GitHub page
5. Review Actions settings

### Test failures in CI but pass locally
**Issue:** Tests pass locally but fail in CI

**Causes & Solutions:**
- Different Node versions: Use same version in CI as locally
  ```bash
  nvm use 20
  ```
- Missing env vars: Check ENVIRONMENT_VARS.md
- Database state: CI starts fresh, tests may need more setup
- Race conditions: Increase timeouts in CI
- Port conflicts: CI runs in isolated container

### Secrets not accessible
**Issue:** Workflow can't access secret values

**Solution:**
1. Verify secret exists in correct location
2. Check secret name (case-sensitive)
3. Verify environment access (if using protected environment)
4. Test secret format: `echo "Testing: ${{ secrets.SECRET_NAME }}"`

### Deployment keeps failing
**Issue:** Production deployment consistently fails

**Debug steps:**
1. Check Vercel project ID: `vercel projects list`
2. Verify API endpoint is reachable
3. Check backend logs
4. Verify health check endpoint
5. Test deployment manually first

### High GitHub Actions costs
**Issue:** Actions usage exceeding expectations

**Solution:**
1. Review run counts: Settings → Billing and plans → Usage
2. Optimize matrix strategy (reduce test combinations)
3. Add concurrency limits
4. Cache dependencies properly
5. Consider self-hosted runners (for high volume)

## Performance Optimization

### 1. Caching
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20.x'
    cache: 'npm'  # Cache node_modules
```

### 2. Matrix Strategy
Keep matrix combinations minimal:
- Only test on latest and LTS Node versions
- Only test backend database with latest version initially

### 3. Artifact Management
- Upload coverage only on success
- Clean up old artifacts: Settings → Actions → Artifact and log retention

### 4. Dependency Caching
```yaml
- uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
```

## Security Best Practices

### 1. Secrets Management
- Use environment-specific secrets
- Rotate tokens every 90 days
- Never commit secrets to git
- Use `git-secrets` locally

### 2. Permissions
- Grant minimum necessary permissions
- Use GITHUB_TOKEN with limited scopes
- Create separate tokens per integration
- Disable token after use

### 3. Branch Protection
- Require approvals before merge
- Require status checks passing
- Dismiss stale reviews
- Include admins in restrictions

### 4. Audit Logging
- Monitor: Settings → Audit log
- Review quarterly
- Alert on suspicious activity

## Cost Considerations

### GitHub Actions Pricing
- Public repos: **Free** unlimited
- Private repos:
  - 2,000 minutes/month included
  - $0.24/minute beyond limit
  - macOS/Windows: More expensive

### Cost Optimization
1. Use Linux runners (cheapest)
2. Limit matrix combinations
3. Cache aggressively
4. Combine jobs where possible
5. Monitor usage monthly

### Estimate (Marsad)
- 3 packages (backend, agents, frontend)
- Node 18.x, 20.x testing
- ~3-5 PRs daily
- ~5 minutes per workflow run

```
(3-5 PRs × 5 min × 2 versions) + (daily deploy × 10 min) = ~50-100 min/day
= ~1,500-3,000 min/month (within free tier for public repo)
```

## Integration Examples

### Slack Message Workflow
Workflows automatically post to Slack when configured:

**On Success:**
```
✅ Staging Deployment Successful
Branch: develop | Commit: abc123 | URL: https://...
```

**On Failure:**
```
❌ Staging Deployment Failed
Branch: develop | Commit: abc123 | Logs: https://...
```

### PR Comment Workflow
Workflows automatically comment on PRs:

**Coverage Report:**
```
## Code Coverage Report

| Metric | Coverage |
|--------|----------|
| Lines | 75% |
| Branches | 68% |
| Functions | 78% |
| Statements | 76% |
```

**Test Results:**
```
## Test Results

| Test Suite | Node 18.x | Node 20.x |
|------------|-----------|-----------|
| Backend | ✅ | ✅ |
| Agents | ✅ | ✅ |
| Frontend | ✅ | ✅ |
```

## Next Steps

1. **Immediate (This Week)**
   - [ ] Set up all workflow files
   - [ ] Configure secrets
   - [ ] Install dev dependencies
   - [ ] Test with feature branch

2. **Short Term (This Month)**
   - [ ] Configure branch protection
   - [ ] Set up Slack notifications
   - [ ] Document team processes
   - [ ] Run first production deployment

3. **Medium Term (Q3)**
   - [ ] Optimize workflow performance
   - [ ] Add additional security scanning
   - [ ] Set up cost monitoring
   - [ ] Automate dependency updates

4. **Long Term**
   - [ ] Consider self-hosted runners
   - [ ] Implement advanced monitoring
   - [ ] Set up automated releases
   - [ ] Integrate with issue tracking

## Support & Documentation

- **GitHub Actions Docs:** https://docs.github.com/en/actions
- **Vercel Deployment:** https://vercel.com/docs
- **ESLint:** https://eslint.org/docs/
- **Jest:** https://jestjs.io/
- **Slack API:** https://api.slack.com/

## Questions & Issues

For questions or issues:
1. Check GitHub Actions logs
2. Review this guide
3. Check CICD_SETUP.md
4. Contact team lead

---

**Last Updated:** 2026-07-18  
**Version:** 1.0.0  
**Status:** Production Ready
