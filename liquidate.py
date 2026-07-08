import os
from alpaca.trading.client import TradingClient
from dotenv import load_dotenv

load_dotenv(".env.local")

client = TradingClient(os.getenv("ALPACA_KEY"), os.getenv("ALPACA_SECRET"), paper=False)

# cancel_orders=True ensures all existing orders for the positions are cancelled
# before the liquidation attempts.
try:
    print("Attempting to close all positions...")
    results = client.close_all_positions(cancel_orders=True)
    for result in results:
        print(f"Status for {result.symbol}: {result.status}")
except Exception as e:
    print(f"Error during bulk liquidation: {e}")
