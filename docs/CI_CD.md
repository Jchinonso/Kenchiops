# CI/CD Pipeline Documentation

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the Kenchi project.

## Overview

The CI/CD pipeline is built using GitHub Actions and includes:

- **CI Pipeline**: Automated testing, linting, type checking, and building
- **CD Pipeline**: Automated Docker image building and deployment
- **Security**: CodeQL analysis, dependency review, and security audits
- **Automation**: Dependabot for dependency updates

## Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

**Jobs:**

#### Lint and Type Check

- Runs ESLint
- Checks code formatting (Prettier)
- Performs TypeScript type checking
- Checks for code duplication

#### Test

- Builds shared package
- Runs all tests
- Generates coverage reports
- Uploads coverage to Codecov

#### Build

- Builds all packages and services
- Verifies build artifacts
- Uploads build artifacts for deployment

#### Validate

- Validates environment configuration
- Validates n8n workflows

#### Security Audit

- Runs `npm audit` for vulnerability scanning

#### CI Status

- Aggregates results from all jobs
- Fails if any job fails

### 2. CD Workflow (`.github/workflows/cd.yml`)

**Triggers:**

- Push to `main` branch
- Tags starting with `v*`
- Manual workflow dispatch with environment selection

**Jobs:**

#### Build and Push Docker Image

- Builds multi-platform Docker images (amd64, arm64)
- Pushes to GitHub Container Registry (GHCR)
- Uses Docker layer caching for faster builds
- Tags images with branch, SHA, and semantic versioning

#### Deploy to Staging

- Automatically deploys on push to `main`
- Uses staging environment configuration

#### Deploy to Production

- Deploys on version tags (`v*`)
- Can be manually triggered with production environment

### 3. Dependency Review (`.github/workflows/dependency-review.yml`)

**Triggers:**

- Pull requests to `main` or `develop`

**Purpose:**

- Reviews dependency changes in PRs
- Flags security vulnerabilities
- Blocks PRs with moderate+ severity issues
- Denies GPL-2.0 and GPL-3.0 licenses

### 4. CodeQL Analysis (`.github/workflows/codeql.yml`)

**Triggers:**

- Push to `main` or `develop`
- Pull requests to `main` or `develop`
- Weekly schedule (Sundays)

**Purpose:**

- Static code analysis for security vulnerabilities
- Analyzes JavaScript and TypeScript code
- Uses security and quality queries

### 5. Dependabot (`.github/dependabot.yml`)

**Configuration:**

- Weekly updates on Mondays at 9:00 AM
- Updates npm dependencies (production and development)
- Updates GitHub Actions
- Groups dependencies by type
- Limits open PRs to prevent spam

## Environment Variables

The following secrets should be configured in GitHub repository settings:

- `CODECOV_TOKEN` (optional): For coverage reporting
- `GITHUB_TOKEN`: Automatically provided by GitHub Actions

## Docker Images

Docker images are built and pushed to GitHub Container Registry:

- **Registry**: `ghcr.io`
- **Image Name**: `kenchiops/Kenchiops` (or your repository name)
- **Tags**:
  - Branch name (e.g., `main`)
  - SHA (e.g., `main-abc1234`)
  - Semantic version (e.g., `v1.0.0`, `v1.0`)

## Deployment

### Staging

- Automatically deploys on push to `main`
- Environment URL: `https://staging.kenchi.example.com` (update in workflow)

### Production

- Deploys on version tags (e.g., `v1.0.0`)
- Can be manually triggered via workflow dispatch
- Environment URL: `https://kenchi.example.com` (update in workflow)

## Local Testing

You can test CI workflows locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or download from https://github.com/nektos/act/releases

# Run CI workflow
act push

# Run specific job
act -j test
```

## Monitoring

- **CI Status**: Check the "Actions" tab in GitHub
- **Coverage**: View coverage reports in Codecov (if configured)
- **Security**: View alerts in GitHub Security tab
- **Dependencies**: View Dependabot PRs and alerts

## Best Practices

1. **Always run CI locally before pushing:**

   ```bash
   npm run lint
   npm run format:check
   npm run type-check
   npm test
   npm run build
   ```

2. **Keep dependencies updated:**
   - Review and merge Dependabot PRs regularly
   - Run `npm audit` locally before committing

3. **Write tests:**
   - Aim for >80% code coverage
   - Test edge cases and error conditions

4. **Follow semantic versioning:**
   - Use `v1.0.0` format for tags
   - Update version in `package.json` files

5. **Review security alerts:**
   - Address CodeQL findings promptly
   - Fix dependency vulnerabilities

## Troubleshooting

### CI Fails on Lint

- Run `npm run lint:fix` locally
- Fix remaining issues manually

### CI Fails on Type Check

- Run `npm run type-check` locally
- Fix TypeScript errors

### CI Fails on Tests

- Run `npm test` locally
- Check test output for failures
- Ensure all tests pass before pushing

### Build Fails

- Run `npm run build` locally
- Check for compilation errors
- Verify all dependencies are installed

### Docker Build Fails

- Check Dockerfile syntax
- Verify all required files are present
- Check build context

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com/)
- [CodeQL Documentation](https://codeql.github.com/docs/)
- [Dependabot Documentation](https://docs.github.com/en/code-security/dependabot)
