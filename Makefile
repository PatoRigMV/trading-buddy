# Trading Buddy Makefile
# Run `make help` to see available commands

.PHONY: help setup install run test lint clean docker-up docker-down

# Default target
help:
	@echo ""
	@echo "Trading Buddy - Available Commands"
	@echo "==================================="
	@echo ""
	@echo "  make setup      - Complete first-time setup (venv + deps + env file)"
	@echo "  make install    - Install Python dependencies only"
	@echo "  make run        - Start the web application"
	@echo "  make test       - Run all tests"
	@echo "  make test-cov   - Run tests with coverage report"
	@echo "  make lint       - Run code linting (flake8)"
	@echo "  make format     - Format code (black + isort)"
	@echo "  make clean      - Remove cache and temp files"
	@echo "  make docker-up  - Start with Docker Compose"
	@echo "  make docker-down- Stop Docker containers"
	@echo "  make check-env  - Verify environment configuration"
	@echo ""

# Complete first-time setup
setup:
	@echo "🚀 Setting up Trading Buddy..."
	@chmod +x scripts/setup.sh
	@./scripts/setup.sh

# Install dependencies only
install:
	@echo "📦 Installing dependencies..."
	@pip install -r requirements.txt

# Run the application
run:
	@echo "🏃 Starting Trading Buddy..."
	@python run_web.py

# Run with debug mode
run-debug:
	@echo "🐛 Starting in debug mode..."
	@FLASK_DEBUG=1 python run_web.py

# Run all tests
test:
	@echo "🧪 Running tests..."
	@pytest tests/ -v

# Run tests with coverage
test-cov:
	@echo "🧪 Running tests with coverage..."
	@pytest tests/ --cov=. --cov-report=html --cov-report=term
	@echo "📊 Coverage report: htmlcov/index.html"

# Run specific test file
test-file:
	@echo "🧪 Running $(FILE)..."
	@pytest $(FILE) -v

# Lint code
lint:
	@echo "🔍 Linting code..."
	@flake8 . --max-line-length=120 --exclude=venv,node_modules,trading-agent

# Format code
format:
	@echo "✨ Formatting code..."
	@black . --exclude="venv|node_modules|trading-agent"
	@isort . --skip venv --skip node_modules --skip trading-agent

# Check environment configuration
check-env:
	@echo "🔧 Checking environment..."
	@python -c "from config import TradingConfig; print('✅ Config OK')" 2>/dev/null || echo "❌ Config error - check .env file"
	@python -c "import os; print('✅ SECRET_KEY set') if os.getenv('SECRET_KEY') else print('❌ SECRET_KEY not set')"
	@python -c "import os; print('✅ ALPACA keys set') if os.getenv('APCA_API_KEY_ID') else print('⚠️  ALPACA keys not set (trading disabled)')"
	@python -c "import os; print('✅ POLYGON_API_KEY set') if os.getenv('POLYGON_API_KEY') else print('⚠️  POLYGON_API_KEY not set')"

# Clean up cache and temp files
clean:
	@echo "🧹 Cleaning up..."
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name ".coverage" -delete 2>/dev/null || true
	@echo "✅ Clean complete"

# Docker commands
docker-up:
	@echo "🐳 Starting Docker containers..."
	@docker-compose up -d

docker-down:
	@echo "🐳 Stopping Docker containers..."
	@docker-compose down

# Generate a secret key
secret-key:
	@echo "🔑 Generated secret key:"
	@python -c 'import secrets; print(secrets.token_hex(32))'

# TypeScript agent commands
ts-install:
	@echo "📦 Installing TypeScript agent dependencies..."
	@cd trading-agent && pnpm install

ts-build:
	@echo "🔨 Building TypeScript agent..."
	@cd trading-agent && pnpm build

ts-run:
	@echo "🏃 Running TypeScript portfolio agent..."
	@cd trading-agent && npx ts-node src/cli/portfolioAgent.ts
