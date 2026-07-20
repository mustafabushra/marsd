# Recommended .gitignore entries for CI/CD

Add these to your `./.gitignore` file:

```gitignore
# Dependencies
node_modules/
/.pnp
.pnp.js

# Testing
/coverage
/.nyc_output
*.lcov
/.vitest
vitest.config.ts.snap

# Production
/dist
/build
/.next
/out

# Misc
.DS_Store
*.pem
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.env
.env.local
.env.*.local
.cache

# IDE
.vscode/
.idea/
*.swp
*.swo
*~
.project
.classpath
.c9/
*.launch
.settings/
*.sublime-workspace
.vscode-st3

# OS
Thumbs.db
.DS_Store

# Temporary files
tmp/
temp/
*.tmp

# Git
.git/
.gitignore
.gitattributes

# CI/CD
.github/workflows/**/*.yml.bak

# Generated files
prisma/migrations/
.prisma/client/

# Vendor
vendor/
.vendor/
```

## Verify .gitignore

After updating, verify it's working:

```bash
# Check what's tracked
git status

# Check specific paths
git check-ignore -v node_modules
git check-ignore -v .env
```
