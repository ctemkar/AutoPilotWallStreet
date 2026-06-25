import os
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from dotenv import load_dotenv

load_dotenv(".env.local")

client = TradingClient(os.getenv("ALPACA_KEY"), os.getenv("ALPACA_SECRET"), paper=False)

try:
positions = client.get_all_positions()
if not positions:
print("No positions found.")
else:
for p in positions:
resp = input(f"Liquidate {p.qty} {p.symbol}? (y/n): ")
if resp.lower() == "y":
side = OrderSide.SELL if float(p.qty) > 0 else OrderSide.BUY
client.submit_order(MarketOrderRequest(symbol=p.symbol, qty=abs(float(p.qty)), side=side, time_in_force=TimeInForce.GTC))
print(f"Liquidated {p.symbol}")
except Exception as e:
print(f"Error: {e}")
