from alpaca.trading.client import TradingClient
from alpaca.trading.requests import GetOrdersRequest
from alpaca.trading.enums import QueryOrderStatus
import os
from dotenv import load_dotenv

load_dotenv(".env.local")
client = TradingClient(os.getenv("ALPACA_KEY"), os.getenv("ALPACA_SECRET"), paper=False)

orders = client.get_orders(filter=GetOrdersRequest(status=QueryOrderStatus.OPEN))
for o in orders:
    print(f"Pending Order: {o.symbol} | Side: {o.side} | Qty: {o.qty} | Status: {o.status}")
