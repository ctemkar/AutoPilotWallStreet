from alpaca.trading.client import TradingClient
import os
from dotenv import load_dotenv
load_dotenv(".env.local")
client = TradingClient(os.getenv("ALPACA_PAPER_KEY"), os.getenv("ALPACA_PAPER_SECRET"), paper=True)
positions = client.get_all_positions()
print(f"Total Positions: {len(positions)}")
for p in positions:
    print(f"{p.symbol}: {p.qty}")
