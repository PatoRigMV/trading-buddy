# Contributing to Trading Buddy

Thank you for your interest in contributing to Trading Buddy! This document provides guidelines and instructions for contributing.

---

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all skill levels.

---

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/heyhaigh/trading-buddy/issues)
2. If not, create a new issue with:
   - Clear title describing the bug
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment details (OS, Python version, etc.)

### Suggesting Features

1. Check [Discussions](https://github.com/heyhaigh/trading-buddy/discussions) for existing suggestions
2. Create a new discussion with:
   - Clear description of the feature
   - Use case / why it's needed
   - Potential implementation approach (optional)

### Submitting Code

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

---

## Development Setup

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/trading-buddy.git
cd trading-buddy
```

### 2. Create Virtual Environment

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # Development dependencies
```

### 3. Set Up Pre-commit Hooks

```bash
pre-commit install
```

### 4. Create Branch

```bash
git checkout -b feature/your-feature-name
```

---

## Code Standards

### Python Style

We follow PEP 8 with these tools:

- **Black** for formatting
- **isort** for import sorting
- **Flake8** for linting

```bash
# Format code
black .
isort .

# Check linting
flake8
```

### Type Hints

Use type hints for all functions:

```python
def calculate_risk(
    portfolio_value: float,
    position_size: float,
    stop_loss_pct: float
) -> RiskAssessment:
    """Calculate risk for a position."""
    ...
```

### Docstrings

Use Google-style docstrings:

```python
def get_quote(symbol: str, source: str = "polygon") -> Quote:
    """Fetch real-time quote for a symbol.

    Args:
        symbol: Stock ticker symbol (e.g., "AAPL")
        source: Data provider to use

    Returns:
        Quote object with current price data

    Raises:
        APIError: If the data provider fails
    """
    ...
```

---

## Testing

### Run Tests

```bash
# All tests
pytest

# With coverage
pytest --cov=. --cov-report=html

# Specific file
pytest tests/test_risk_manager.py

# Specific test
pytest tests/test_risk_manager.py::test_position_sizing
```

### Write Tests

- Place tests in `tests/` directory
- Name test files `test_*.py`
- Name test functions `test_*`

```python
# tests/test_risk_manager.py
import pytest
from risk_manager import RiskManager, TradeProposal

def test_position_sizing_rejects_large_positions():
    """Test that large positions are rejected."""
    manager = RiskManager(config)

    proposal = TradeProposal(
        symbol="AAPL",
        quantity=1000,  # Very large
        price=185.00,
        ...
    )

    result = manager.assess_trade(proposal, portfolio_value=10000)

    assert result.approved == False
    assert "position size" in result.reason.lower()
```

---

## Pull Request Process

### 1. Before Submitting

- [ ] Tests pass (`pytest`)
- [ ] Code is formatted (`black .`)
- [ ] Linting passes (`flake8`)
- [ ] Documentation updated (if needed)
- [ ] Commit messages are clear

### 2. PR Description

Include:
- What changes were made
- Why the changes were made
- How to test the changes
- Screenshots (if UI changes)

### 3. Review Process

1. Maintainers will review your PR
2. Address any feedback
3. Once approved, PR will be merged

---

## Areas for Contribution

### Good First Issues

Look for issues labeled `good first issue`:
- Documentation improvements
- Bug fixes
- Test coverage improvements

### Feature Ideas

- New technical indicators
- Additional data providers
- UI improvements
- Performance optimizations
- New agent types

### Documentation

- Tutorials
- Examples
- API documentation
- Translations

---

## Architecture Guidelines

### Adding a New Agent

1. Create `my_agent.py` in root directory
2. Follow the agent pattern:

```python
class MyAgent:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)

    async def process(self, input_data: Dict) -> Dict:
        """Process input and return result."""
        try:
            result = await self._do_work(input_data)
            return {"success": True, "data": result}
        except Exception as e:
            self.logger.error(f"Error: {e}")
            return {"success": False, "error": str(e)}
```

3. Add tests in `tests/test_my_agent.py`
4. Update documentation

### Adding a New Data Provider

1. Add to `data_providers.yaml`
2. Implement client in `provider_router.py` or separate file
3. Add rate limiting configuration
4. Add tests
5. Update `docs/API_INTEGRATIONS.md`

---

## Questions?

- Open a [Discussion](https://github.com/heyhaigh/trading-buddy/discussions)
- Check existing issues and discussions first

---

Thank you for contributing!
