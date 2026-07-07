#!/usr/bin/env python3
import os
import sys
import time
import requests
import json

BASE = "https://paper-api.alpaca.markets"
API_KEY = os.environ.get("ALPACA_PAPER_API_KEY") or os.environ.get("ALPACA_API_KEY")
API_SECRET = os.environ.get("ALPACA_PAPER_API_SECRET") or os.environ.get("ALPACA_API_SECRET")
if not API_KEY or not API_SECRET:
    print("Missing Alpaca API credentials in env. Source .env.local before running.")
    sys.exit(2)

HEADERS = {
    "APCA-API-KEY-ID": API_KEY,
    "APCA-API-SECRET-KEY": API_SECRET,
    "Content-Type": "application/json",
}

def get_positions():
    r = requests.get(f"{BASE}/v2/positions", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def get_open_orders():
    r = requests.get(f"{BASE}/v2/orders?status=open", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def cancel_order(order_id):
    r = requests.delete(f"{BASE}/v2/orders/{order_id}", headers=HEADERS)
    return r.status_code, r.text

def place_market_order(symbol, qty, side):
    payload = {
        "symbol": symbol,
        "qty": str(qty),
        "side": side,
        "type": "market",
        "time_in_force": "day",
    }
    r = requests.post(f"{BASE}/v2/orders", headers=HEADERS, data=json.dumps(payload))
    return r.status_code, r.text


def main():
    print("Fetching positions and open orders...")
    try:
        positions = get_positions()
    except Exception as e:
        print("Failed to fetch positions:", e)
        return

    try:
        open_orders = get_open_orders()
    except Exception as e:
        print("Failed to fetch open orders:", e)
        open_orders = []

    print(f"Found {len(positions)} positions and {len(open_orders)} open orders.")

    if open_orders:
        print("Canceling open orders...")
        for o in open_orders:
            oid = o.get("id")
            sym = o.get("symbol")
            print(f"Canceling order {oid} ({sym})...")
            status, text = cancel_order(oid)
            print(status, text)
            time.sleep(0.25)
    else:
        print("No open orders to cancel.")

    results = []
    print("Attempting market-close orders for each position...")
    for p in positions:
        symbol = p.get("symbol")
        qty = p.get("qty")
        side = p.get("side")
        if not symbol or not qty:
            continue
        # normalize
        try:
            qtyf = float(qty)
        except:
            qtyf = qty
        if side == "long":
            order_side = "sell"
        else:
            order_side = "buy"

        print(f"Placing {order_side} market order for {symbol} qty={qty}...")
        status, text = place_market_order(symbol, qty, order_side)
        print(status, text)
        results.append({"symbol": symbol, "qty": qty, "side": side, "order_status": status, "order_resp": text})
        time.sleep(0.5)

    # summarize
    print("\nSummary:\n")
    for r in results:
        print(r["symbol"], r["order_status"], r["order_resp"])

if __name__ == '__main__':
    main()
