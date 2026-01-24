#!/bin/bash

echo "🤖 Setting up Autonomous Trading Agent..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

echo "📦 Installing dependencies..."
pnpm install

echo "🗃️  Setting up database..."
npx prisma generate
npx prisma db push

echo "⚙️  Setting up environment..."
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "❗ Please edit .env file and add your Alpaca API credentials"
else
    echo "✅ .env file already exists"
fi

echo "🧪 Running tests..."
pnpm test

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env file and add your Alpaca paper trading API keys"
echo "2. Review config/strategy.yaml for trading parameters"
echo "3. Run: pnpm agent --config config/strategy.yaml"
echo ""
echo "🔗 Useful commands:"
echo "  pnpm agent --config config/strategy.yaml  # Start trading agent"
echo "  pnpm backtest --from 2023-01-01 --to 2024-12-31  # Run backtest"
echo "  pnpm api  # Start API server"
echo "  pnpm test  # Run tests"
echo ""
