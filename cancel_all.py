from alpaca.trading.client import TradingClient
import os
from dotenv import load_dotenv
load_dotenv(".env.local")
client = TradingClient(os.getenv("ALPACA_KEY"), os.getenv("ALPACA_SECRET"), paper=False)

try:
    client.cancel_orders()
    print("All pending orders cancelled successfully.")
except Exception as e:
    print(f"Error cancelling orders: {e}")
