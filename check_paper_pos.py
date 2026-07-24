from alpaca.trading.client import TradingClient
import os
from dotenv import load_dotenv
load_dotenv(".env.local")
# Use Paper keys as per dashboard
key = os.getenv("ALPACA_PAPER_KEY")
secret = os.getenv("ALPACA_PAPER_SECRET")
client = TradingClient(key, secret, paper=True)

try:
    positions = client.get_all_positions()
    print(f"TOTAL_POSITIONS: {len(positions)}")
    for p in positions:
        print(f"SYMBOL: {p.symbol} | QTY: {p.qty} | UNREALIZED_PLPC: {p.unrealized_plpc}")
except Exception as e:
    print(f"ERROR: {e}")
