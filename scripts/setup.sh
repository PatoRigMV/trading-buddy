#!/bin/bash

# Trading Buddy - Automated Setup Script
# Run with: ./scripts/setup.sh or make setup

set -e

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Trading Buddy - Automated Setup                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Python version
echo "📋 Checking prerequisites..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
    echo -e "${GREEN}✅ Python $PYTHON_VERSION found${NC}"
else
    echo -e "${RED}❌ Python 3 is required but not installed${NC}"
    exit 1
fi

# Check if version is >= 3.9
MAJOR=$(echo $PYTHON_VERSION | cut -d. -f1)
MINOR=$(echo $PYTHON_VERSION | cut -d. -f2)
if [ "$MAJOR" -lt 3 ] || ([ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 9 ]); then
    echo -e "${RED}❌ Python 3.9+ is required (found $PYTHON_VERSION)${NC}"
    exit 1
fi

# Create virtual environment if it doesn't exist
echo ""
echo "📦 Setting up virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}✅ Virtual environment created${NC}"
else
    echo -e "${YELLOW}⚠️  Virtual environment already exists${NC}"
fi

# Activate virtual environment
source venv/bin/activate
echo -e "${GREEN}✅ Virtual environment activated${NC}"

# Upgrade pip
echo ""
echo "📦 Upgrading pip..."
pip install --upgrade pip -q

# Install dependencies
echo ""
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt -q
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Create .env file if it doesn't exist
echo ""
echo "🔧 Setting up environment configuration..."
if [ ! -f ".env" ]; then
    cp .env.example .env

    # Generate a secret key
    SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

    # Update the .env file with the generated secret key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/^SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    else
        # Linux
        sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    fi

    echo -e "${GREEN}✅ .env file created with generated SECRET_KEY${NC}"
    echo -e "${YELLOW}⚠️  Remember to add your API keys to .env${NC}"
else
    echo -e "${YELLOW}⚠️  .env file already exists (not overwritten)${NC}"
fi

# Verify installation
echo ""
echo "🔍 Verifying installation..."
python3 -c "from config import TradingConfig; print('✅ Config module OK')" 2>/dev/null || echo -e "${YELLOW}⚠️  Config verification skipped (add API keys first)${NC}"

# Print summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete!                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Add your API keys to .env:"
echo "     ${YELLOW}nano .env${NC}"
echo ""
echo "  2. Required keys (at minimum):"
echo "     - APCA_API_KEY_ID      (Alpaca paper trading)"
echo "     - APCA_API_SECRET_KEY  (Alpaca paper trading)"
echo "     - POLYGON_API_KEY      (or FINNHUB_API_KEY)"
echo ""
echo "  3. Start the application:"
echo "     ${GREEN}make run${NC}"
echo "     or"
echo "     ${GREEN}source venv/bin/activate && python run_web.py${NC}"
echo ""
echo "  4. Open in browser:"
echo "     ${GREEN}http://localhost:8000${NC}"
echo ""
echo "For help: ${GREEN}make help${NC}"
echo ""
