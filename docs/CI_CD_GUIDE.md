# CI/CD Pipeline Guide - Trading Assistant

## Overview

This project uses **GitHub Actions** for continuous integration and deployment, with automated testing, linting, security scanning, and documentation generation.

## Pipeline Architecture

```
┌─────────────────┐
│  Git Push/PR    │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Trigger  │
    └────┬─────┘
         │
    ┌────▼──────────────────────────┐
    │   Parallel Job Execution      │
    ├───────────────────────────────┤
    │  ├─ Test (3.9, 3.10, 3.11)   │
    │  ├─ Lint (flake8, black)     │
    │  ├─ Security (bandit, safety) │
    │  └─ Documentation (OpenAPI)   │
    └───────┬───────────────────────┘
            │
       ┌────▼─────┐
       │ Summary  │
       └──────────┘
```

## Workflows

### 1. Test Suite (`test.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

**Jobs:**

#### Test Job
- **Matrix Strategy:** Tests across Python 3.9, 3.10, 3.11
- **Steps:**
  1. Checkout code
  2. Set up Python environment
  3. Cache pip packages
  4. Install dependencies
  5. Set test environment variables
  6. Run unit tests (`test_validation.py`)
  7. Run integration tests (`test_api_integration.py`)
  8. Run all tests with coverage
  9. Upload coverage to Codecov
  10. Add coverage comment to PR

**Coverage Requirements:**
- Minimum: 80% (fails if below)
- Target: 85%+
- Orange threshold: 70%

#### Lint Job
- **Checks:**
  - `flake8`: Code style and quality
  - `black`: Code formatting
  - `isort`: Import sorting
  - `mypy`: Type checking (future)

#### Security Job
- **Scans:**
  - `bandit`: Security vulnerability scanning
  - `safety`: Dependency vulnerability checking
- Uploads security reports as artifacts

#### Documentation Job
- **Tasks:**
  1. Generate OpenAPI specification
  2. Validate OpenAPI spec with Swagger
  3. Upload OpenAPI docs as artifacts

#### Summary Job
- Checks all job results
- Fails if any critical job fails
- Provides consolidated status

---

### 2. Pre-commit Checks (`pre-commit.yml`)

**Triggers:**
- Pull requests
- Push to `main` or `develop`

**Runs:**
- All pre-commit hooks defined in `.pre-commit-config.yaml`
- Faster feedback loop for code quality

---

## Local Development Setup

### Install Pre-commit Hooks

```bash
pip install pre-commit
pre-commit install
```

This will automatically run checks before every commit.

### Run Pre-commit Manually

```bash
# Run on all files
pre-commit run --all-files

# Run on staged files only
pre-commit run

# Run specific hook
pre-commit run pytest-check
pre-commit run black
```

### Skip Pre-commit (Emergency Only)

```bash
git commit --no-verify -m "Emergency fix"
```

**Note:** CI will still run all checks on push.

---

## Pre-commit Hooks Configuration

### Enabled Hooks

1. **General Checks**
   - Trailing whitespace removal
   - End-of-file fixer
   - YAML/JSON validation
   - Large file detection (>1MB)
   - Merge conflict detection
   - Private key detection

2. **Python Formatting**
   - `black`: Auto-format code (120 char line length)
   - `isort`: Sort imports (black-compatible)

3. **Python Linting**
   - `flake8`: Style guide enforcement (PEP 8)

4. **Security**
   - `bandit`: Security vulnerability scanning

5. **Type Checking**
   - `mypy`: Static type checking (future)

6. **Testing**
   - `pytest`: Run test suite before commit

---

## CI/CD Best Practices

### For Developers

1. **Before Committing:**
   ```bash
   # Run tests locally
   pytest

   # Run pre-commit checks
   pre-commit run --all-files
   ```

2. **Creating Pull Requests:**
   - Ensure all CI checks pass
   - Coverage should not decrease
   - Address any linting issues
   - Review security scan results

3. **Responding to CI Failures:**
   ```bash
   # Check specific job logs in GitHub Actions
   # Fix issues locally
   pytest --tb=short  # Debug test failures
   flake8 file.py     # Check linting
   black file.py      # Auto-fix formatting
   ```

### For Reviewers

1. **Check CI Status:**
   - All jobs must pass (✓ green)
   - Review coverage changes
   - Check security scan results

2. **Review Artifacts:**
   - OpenAPI documentation updates
   - Security reports
   - Coverage reports

---

## GitHub Actions Secrets

The following secrets should be configured in GitHub repository settings:

### Required for CI
- `GITHUB_TOKEN`: Auto-provided by GitHub Actions

### Optional (for enhanced features)
- `CODECOV_TOKEN`: Coverage reporting to Codecov
- `SLACK_WEBHOOK`: CI status notifications

---

## Artifacts

### Generated Artifacts

After each workflow run, the following artifacts are available:

1. **Coverage Reports**
   - `coverage.xml`: Codecov format
   - Available for 90 days

2. **Security Reports**
   - `bandit-report.json`: Security scan results
   - Available for 90 days

3. **OpenAPI Documentation**
   - `openapi.json`: JSON format
   - `openapi.yaml`: YAML format
   - Available for 30 days

### Accessing Artifacts

1. Go to Actions tab in GitHub
2. Click on workflow run
3. Scroll to "Artifacts" section
4. Download artifact ZIP file

---

## Workflow Status Badges

Add to `README.md`:

```markdown
![Test Suite](https://github.com/YOUR_USERNAME/trading_assistant/workflows/Test%20Suite/badge.svg)
![Pre-commit](https://github.com/YOUR_USERNAME/trading_assistant/workflows/Pre-commit%20Checks/badge.svg)
[![codecov](https://codecov.io/gh/YOUR_USERNAME/trading_assistant/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_USERNAME/trading_assistant)
```

---

## Troubleshooting

### Common Issues

#### 1. Tests Pass Locally but Fail in CI

**Cause:** Environment differences

**Solution:**
```bash
# Check environment variables
pytest -v --tb=long

# Test with CI environment
export SECRET_KEY="test_secret_key_for_ci_testing_only"
pytest
```

#### 2. Coverage Decreased

**Cause:** New code without tests

**Solution:**
```bash
# Check coverage
pytest --cov --cov-report=term-missing

# Add tests for uncovered lines
# Re-run coverage
```

#### 3. Linting Failures

**Cause:** Code style violations

**Solution:**
```bash
# Auto-fix most issues
black .
isort .

# Check remaining issues
flake8 .
```

#### 4. Security Scan Failures

**Cause:** Bandit found potential security issues

**Solution:**
```bash
# Run locally
bandit -r validation.py api_response.py

# Review and fix issues
# Or add # nosec comment with justification
```

#### 5. Pre-commit Hooks Too Slow

**Cause:** Running all hooks on every commit

**Solution:**
```bash
# Skip specific hooks
SKIP=pytest-check git commit -m "message"

# Or temporarily disable
pre-commit uninstall
```

---

## Performance Optimization

### Caching Strategy

1. **Pip Packages:** Cached based on `requirements.txt` hash
2. **Pre-commit Hooks:** Cached based on `.pre-commit-config.yaml` hash

### Parallelization

- Matrix builds run in parallel (Python 3.9, 3.10, 3.11)
- All jobs (test, lint, security, docs) run concurrently
- Average workflow time: 2-3 minutes

---

## Extending the Pipeline

### Adding New Test Suite

Edit `.github/workflows/test.yml`:

```yaml
- name: Run new test suite
  run: |
    pytest test_new_feature.py -v
```

### Adding New Linter

1. Add to `.pre-commit-config.yaml`:
```yaml
- repo: https://github.com/NEW_LINTER
  rev: VERSION
  hooks:
    - id: new-linter
```

2. Update `.github/workflows/test.yml`:
```yaml
- name: Run new linter
  run: new-linter --args
```

### Adding Deployment Job

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: test  # Only deploy if tests pass

    steps:
    - name: Deploy to production
      run: |
        # Deployment commands
```

---

## Monitoring and Alerts

### GitHub Notifications

Configure in repository settings:
- Email notifications for failed workflows
- Slack/Discord webhooks for CI status

### Coverage Trends

Track coverage over time:
- Codecov dashboard
- GitHub Actions artifacts
- Coverage badges in README

---

## Security Considerations

### Secret Management

- Never commit secrets to repository
- Use GitHub Secrets for sensitive data
- Rotate secrets regularly

### Security Scanning

- Bandit scans for common vulnerabilities
- Safety checks for dependency vulnerabilities
- Pre-commit hooks prevent accidental commits of secrets

### Dependency Updates

```bash
# Check for outdated packages
pip list --outdated

# Update dependencies
pip install --upgrade PACKAGE

# Update pre-commit hooks
pre-commit autoupdate
```

---

## Metrics and KPIs

### Test Coverage
- **Current:** 85%
- **Target:** 90%
- **Minimum:** 80%

### Build Success Rate
- **Target:** >95%
- **Current:** Track in GitHub Actions

### Build Time
- **Current:** ~2-3 minutes
- **Target:** <5 minutes

---

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Pre-commit Documentation](https://pre-commit.com/)
- [Codecov Documentation](https://docs.codecov.com/)
- [Bandit Security Scanner](https://bandit.readthedocs.io/)

---

**Last Updated:** September 30, 2025
**Pipeline Version:** 1.0
**Maintained By:** Trading Assistant Team
