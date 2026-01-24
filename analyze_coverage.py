import re
import sys

# Read coverage report
coverage_data = """
api_response.py                        51      3    94%
validation.py                         166     21    87%
governance.py                         173     53    69%
health_check.py                       184    100    46%
logging_config.py                     101     44    56%
main.py                                63     44    30%
multi_api_aggregator.py               549    445    19%
paper_trading.py                      141    103    27%
performance_tracker.py                231    180    22%
portfolio_manager.py                  118     84    29%
price_alerts.py                       295    226    23%
redis_cache_manager.py                181    139    23%
risk_manager.py                       124     81    35%
simple_real_time_data.py              157    119    24%
trade_executor.py                     141     84    40%
typescript_api_bridge.py              130     91    30%
web_app.py                           2317   1946    16%
"""

files = []
for line in coverage_data.strip().split('\n'):
    parts = line.split()
    if len(parts) >= 4:
        filename = parts[0]
        total_lines = int(parts[1])
        missing_lines = int(parts[2])
        coverage_pct = int(parts[3].rstrip('%'))

        # Calculate potential impact: (lines that could be covered) * (ease of testing)
        # Prioritize files with 20-50% coverage (some infrastructure exists)
        if 20 <= coverage_pct <= 50 and total_lines > 50:
            impact_score = missing_lines * (coverage_pct / 100)
            files.append((filename, total_lines, missing_lines, coverage_pct, impact_score))

# Sort by impact score
files.sort(key=lambda x: x[4], reverse=True)

print("Top files to add tests for (highest impact):")
print(f"{'File':<35} {'Total':>6} {'Missing':>8} {'Cov%':>6} {'Impact':>8}")
print("-" * 70)
for f in files[:10]:
    print(f"{f[0]:<35} {f[1]:>6} {f[2]:>8} {f[3]:>6}% {f[4]:>8.1f}")
