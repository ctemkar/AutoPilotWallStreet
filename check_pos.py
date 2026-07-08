from alpaca.trading.client import TradingClient
import os
from dotenv import load_dotenv
load_dotenv(".env.local")
client = TradingClient(os.getenv("ALPACA_KEY"), os.getenv("ALPACA_SECRET"), paper=False)
positions = client.get_all_positions()
for p in positions:
    print(f"{p.symbol}: {p.qty}")
