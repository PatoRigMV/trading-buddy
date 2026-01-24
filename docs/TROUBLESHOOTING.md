# Troubleshooting Guide

Common issues and solutions when working with Trading Buddy.

---

## Quick Diagnostics

Run this command to check your setup:

```bash
make check-env
```

---

## Installation Issues

### "No module named 'xxx'"

**Problem:** Missing Python dependencies.

**Solution:**
```bash
# Activate virtual environment first
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

### "python: command not found"

**Problem:** Python not installed or not in PATH.

**Solution:**
```bash
# macOS
brew install python@3.11

# Ubuntu/Debian
sudo apt install python3.11 python3.11-venv

# Verify installation
python3 --version
```

### Virtual environment not activating

**Problem:** `source venv/bin/activate` doesn't work.

**Solution:**
```bash
# Delete and recreate
rm -rf venv
python3 -m venv venv
source venv/bin/activate
```

---

## Configuration Issues

### "SECRET_KEY must be set"

**Problem:** Missing or empty SECRET_KEY in .env file.

**Solution:**
```bash
# Generate a new secret key
python -c 'import secrets; print(secrets.token_hex(32))'

# Add to .env file
echo "SECRET_KEY=your_generated_key_here" >> .env
```

### "Config error - check .env file"

**Problem:** Invalid configuration in .env.

**Solution:**
1. Check .env file exists: `ls -la .env`
2. Verify format (no spaces around `=`):
   ```bash
   # Wrong
   SECRET_KEY = abc123

   # Correct
   SECRET_KEY=abc123
   ```
3. Check for special characters (wrap in quotes if needed):
   ```bash
   SECRET_KEY="key_with_special/chars"
   ```

---

## API Connection Issues

### "Cannot connect to Alpaca"

**Problem:** Alpaca API authentication failing.

**Solutions:**

1. **Verify API keys are correct:**
   ```bash
   # Check keys are set
   echo $APCA_API_KEY_ID
   echo $APCA_API_SECRET_KEY
   ```

2. **Ensure using correct URL for key type:**
   ```bash
   # Paper trading keys → Paper URL
   APCA_API_BASE_URL=https://paper-api.alpaca.markets

   # Live trading keys → Live URL
   APCA_API_BASE_URL=https://api.alpaca.markets
   ```

3. **Check account status:**
   - Log into [Alpaca Dashboard](https://app.alpaca.markets)
   - Verify account is active and approved

### "API rate limit exceeded" (429 error)

**Problem:** Too many API requests.

**Solutions:**

1. **Wait and retry:** The system has automatic backoff
2. **Check rate limits:**
   | Provider | Free Tier Limit |
   |----------|-----------------|
   | Polygon | 5/min |
   | Finnhub | 60/min |
   | Alpha Vantage | 5/min, 25/day |

3. **Add more providers:** Requests are distributed across providers

### "Polygon API key required"

**Problem:** Missing Polygon API key for real-time data.

**Solution:**
```bash
# Get free key at polygon.io
POLYGON_API_KEY=your_polygon_key

# Or use alternative (Finnhub)
FINNHUB_API_KEY=your_finnhub_key
```

### "401 Unauthorized"

**Problem:** Invalid or expired API key.

**Solutions:**
1. Regenerate API key from provider dashboard
2. Check for typos in .env file
3. Verify key hasn't been revoked

---

## Runtime Issues

### Port 8000 already in use

**Problem:** Another process is using port 8000.

**Solutions:**

1. **Find and kill the process:**
   ```bash
   # Find what's using port 8000
   lsof -i :8000

   # Kill it
   kill -9 <PID>
   ```

2. **Use a different port:**
   ```bash
   python run_web.py --port 8080
   ```

### Application crashes on startup

**Problem:** Various startup errors.

**Solutions:**

1. **Check logs:**
   ```bash
   tail -f logs/trading_web.log
   ```

2. **Run in debug mode:**
   ```bash
   FLASK_DEBUG=1 python run_web.py
   ```

3. **Verify all environment variables:**
   ```bash
   make check-env
   ```

### WebSocket connection fails

**Problem:** Real-time data not updating.

**Solutions:**

1. **Check browser console** for WebSocket errors
2. **Verify firewall** isn't blocking WebSocket connections
3. **Check provider status:**
   - [Polygon Status](https://status.polygon.io)
   - [Alpaca Status](https://status.alpaca.markets)

---

## Data Issues

### "Data discrepancy detected"

**Problem:** Different providers returning different prices.

**Explanation:** This is normal - different providers have slightly different data due to:
- Different data sources
- Different update frequencies
- Different aggregation methods

**The system automatically:**
- Uses consensus (average) value
- Logs discrepancies for review
- Falls back to most reliable source

### No data returned for symbol

**Problem:** Quote returns empty or null.

**Solutions:**

1. **Verify symbol is valid:**
   ```bash
   # Check if symbol exists
   curl "https://finnhub.io/api/v1/search?q=AAPL&token=YOUR_KEY"
   ```

2. **Check market hours:**
   - US markets: 9:30 AM - 4:00 PM ET
   - Some providers don't return data outside market hours

3. **Try different provider:**
   ```python
   # In provider_router.py, check provider priority
   ```

### Stale data / prices not updating

**Problem:** Prices seem outdated.

**Solutions:**

1. **Check WebSocket connection** in browser dev tools
2. **Verify provider circuit breakers** aren't tripped:
   ```bash
   # Check health endpoint
   curl http://localhost:8000/api/health
   ```
3. **Restart the application:**
   ```bash
   make run
   ```

---

## Trading Issues

### Trade rejected by risk manager

**Problem:** Trades being blocked.

**Possible reasons:**
- Position size too large (>5% of portfolio)
- Sector exposure too high (>20%)
- Daily loss limit hit (-3%)
- Conviction score too low (<60%)

**Solutions:**

1. **Check rejection reason** in API response
2. **Reduce position size**
3. **Wait for circuit breaker reset** (if loss limit hit)
4. **Adjust risk parameters** in config.json

### Paper trade not appearing

**Problem:** Trade submitted but not in positions.

**Solutions:**

1. **Check Alpaca dashboard** directly
2. **Verify order status:**
   ```bash
   curl http://localhost:8000/api/orders
   ```
3. **Check if market is open**

---

## TypeScript Agent Issues

### "pnpm: command not found"

**Solution:**
```bash
# Install pnpm
npm install -g pnpm

# Or use npm instead
cd trading-agent && npm install
```

### TypeScript compilation errors

**Solution:**
```bash
cd trading-agent

# Clean and rebuild
rm -rf dist node_modules
pnpm install
pnpm build
```

---

## Docker Issues

### Container won't start

**Solutions:**

1. **Check Docker is running:**
   ```bash
   docker ps
   ```

2. **View container logs:**
   ```bash
   docker-compose logs -f
   ```

3. **Rebuild container:**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

---

## Getting Help

If you're still stuck:

1. **Search existing issues:** [GitHub Issues](https://github.com/heyhaigh/trading-buddy/issues)
2. **Check discussions:** [GitHub Discussions](https://github.com/heyhaigh/trading-buddy/discussions)
3. **Open a new issue** with:
   - Python version (`python --version`)
   - OS and version
   - Error message (full traceback)
   - Steps to reproduce

---

## Common Error Messages Reference

| Error | Likely Cause | Quick Fix |
|-------|--------------|-----------|
| `SECRET_KEY must be set` | Missing .env config | Run `make setup` |
| `ModuleNotFoundError` | Missing dependencies | `pip install -r requirements.txt` |
| `ConnectionRefusedError` | Server not running | `make run` |
| `401 Unauthorized` | Invalid API key | Check .env keys |
| `429 Too Many Requests` | Rate limited | Wait or add more providers |
| `TimeoutError` | Network/API issues | Check internet connection |
| `Port already in use` | Port conflict | Kill process or use different port |
