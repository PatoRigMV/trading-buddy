# Testing Guide - Trading Assistant

## Overview

This project uses **pytest** for testing with coverage measurement via **pytest-cov**.

## Test Structure

```
trading_assistant/
├── test_validation.py          # Unit tests for validation schemas (63 tests)
├── test_api_integration.py     # Integration tests for API endpoints (39 tests)
├── pytest.ini                  # Pytest configuration
└── htmlcov/                    # HTML coverage reports (git-ignored)
```

## Running Tests

### Run All Tests
```bash
pytest
```

### Run Specific Test Files
```bash
pytest test_validation.py
pytest test_api_integration.py
```

### Run Specific Test Classes
```bash
pytest test_validation.py::TestSymbolSchema
pytest test_api_integration.py::TestWatchlistEndpoints
```

### Run Specific Tests
```bash
pytest test_validation.py::TestSymbolSchema::test_valid_symbol
```

### Run Tests by Marker
```bash
pytest -m unit              # Unit tests only
pytest -m integration       # Integration tests only
pytest -m "not slow"        # Exclude slow tests
```

## Coverage Reports

### Terminal Coverage Report
```bash
pytest --cov=validation --cov=api_response --cov-report=term-missing
```

### HTML Coverage Report
```bash
pytest --cov=validation --cov=api_response --cov-report=html
open htmlcov/index.html
```

### Current Coverage
- **validation.py**: 87% coverage
- **api_response.py**: 78% coverage
- **Overall**: 85% coverage

## Test Results Summary

### Unit Tests (test_validation.py)
- **63 tests** for validation schemas
- **100% pass rate**
- **0.20s execution time**
- Tests all 31 validation schemas
- Covers positive and negative cases

### Integration Tests (test_api_integration.py)
- **39 tests** for API endpoints
- **100% pass rate**
- **0.74s execution time**
- Tests 9 major endpoint groups
- Validates request/response formats

### Total Test Suite
- **102 tests**
- **100% pass rate**
- **1.35s execution time**
- **85% code coverage**

## Writing New Tests

### Unit Test Example
```python
from validation import validate_request, SymbolSchema
from marshmallow import ValidationError
import pytest

class TestMySchema:
    def test_valid_input(self):
        data = {'symbol': 'AAPL'}
        result = validate_request(SymbolSchema, data)
        assert result['symbol'] == 'AAPL'

    def test_invalid_input(self):
        data = {'symbol': 'invalid123'}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(SymbolSchema, data)
        assert 'symbol' in exc_info.value.messages
```

### Integration Test Example
```python
def test_my_endpoint(client):
    """Test my endpoint with valid data"""
    response = client.post('/api/my-endpoint',
        json={'field': 'value'},
        content_type='application/json'
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['success'] is True
```

## Test Markers

Add markers to categorize tests:

```python
@pytest.mark.unit
def test_something():
    pass

@pytest.mark.integration
def test_endpoint():
    pass

@pytest.mark.slow
def test_long_running():
    pass
```

## Coverage Goals

| Component | Current | Target |
|-----------|---------|--------|
| validation.py | 87% | 95% |
| api_response.py | 78% | 95% |
| web_app.py endpoints | 30% | 80% |
| Overall project | 12% | 70% |

## CI/CD Integration

Tests run automatically on:
- Every commit (via pre-commit hook)
- Every pull request (via GitHub Actions)
- Every merge to main branch

See `.github/workflows/test.yml` for CI configuration.

## Troubleshooting

### Tests Fail with Environment Variable Error
Set required environment variables:
```bash
export SECRET_KEY="your_secret_key"
export POLYGON_API_KEY="your_api_key"
export APCA_API_KEY_ID="your_alpaca_key"
export APCA_API_SECRET_KEY="your_alpaca_secret"
```

Or use the `.env` file (automatically loaded by web_app.py).

### Coverage Report Not Generated
Ensure pytest-cov is installed:
```bash
pip3 install pytest-cov
```

### Tests Run Slowly
Use pytest-xdist for parallel execution:
```bash
pip3 install pytest-xdist
pytest -n auto
```

## Best Practices

1. **Write tests for all new validation schemas**
2. **Add integration tests for all new API endpoints**
3. **Aim for 80%+ coverage on new code**
4. **Run tests before committing** (`pytest`)
5. **Check coverage regularly** (`pytest --cov`)
6. **Use descriptive test names** (test_what_when_then)
7. **Test both success and failure cases**
8. **Keep tests fast** (< 2 seconds total)

## Resources

- [pytest documentation](https://docs.pytest.org/)
- [pytest-cov documentation](https://pytest-cov.readthedocs.io/)
- [marshmallow documentation](https://marshmallow.readthedocs.io/)
- [Flask testing documentation](https://flask.palletsprojects.com/en/latest/testing/)

---

**Last Updated:** September 30, 2025
**Test Suite Version:** 1.0
**Total Tests:** 102
**Coverage:** 85%
