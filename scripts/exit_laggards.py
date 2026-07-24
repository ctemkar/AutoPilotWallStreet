#!/usr/bin/env python3
import requests
import os
import json

# Configuration
PROXY_URL = "http://localhost:3000/api/alpaca"
MIN_LOSS_THRESHOLD = 0.0  # % P/L to trigger exit (e.g. 0.0% means close anything flat or red)
MAX_EXIT_COUNT = 30        # Free up significant capital

def main():
    print(f"--- Laggard Liquidation Protocol Initialized ---")
    print(f"Targeting positions with Unrealized P/L < {MIN_LOSS_THRESHOLD}%")

    try:
        # 1. Fetch current positions via the app's proxy
        # We use matches to get the auth from the environment or just trust the proxy if it's open.
        # But for safety, we'll try to find the keys.
        
        # In this environment, we can likely just call the proxy directly if it's running.
        # If not, we'll need the keys.
        
        # Let's check if we can get positions
        response = requests.post(PROXY_URL, json={"action": "positions", "isPaper": True}, timeout=10)
        if response.status_code != 200:
            print(f"Error: Proxy returned status {response.status_code}")
            return

        data = response.json()
        positions = data.get("positions", [])
        
        if not positions:
            print("No active positions found.")
            return

        print(f"Found {len(positions)} active positions. Analyzing for laggards...")

        laggards = []
        for p in positions:
            symbol = p.get("symbol")
            unrealized_pl_pct = float(p.get("unrealized_plpc", 0)) * 100
            market_value = float(p.get("market_value", 0))
            
            if unrealized_pl_pct < MIN_LOSS_THRESHOLD:
                laggards.append({
                    "symbol": symbol,
                    "pl": unrealized_pl_pct,
                    "val": market_value,
                    "qty": p.get("qty")
                })

        # Sort by worst performers first
        laggards.sort(key=lambda x: x["pl"])

        if not laggards:
            print("No laggards found exceeding the loss threshold.")
            return

        print(f"Identified {len(laggards)} laggards. Executing priority exits...")
        
        exited_count = 0
        total_freed = 0
        
        for l in laggards[:MAX_EXIT_COUNT]:
            sys = l["symbol"]
            print(f"Closing {sys} (P/L: {l['pl']:.2f}%, Value: ${l['val']:.2f})...", end=" ")
            
            # Execute close via proxy
            close_res = requests.post(PROXY_URL, json={
                "action": "trade",
                "symbol": sys,
                "side": "sell" if float(l["qty"]) > 0 else "buy",
                "qty": abs(float(l["qty"])),
                "type": "market",
                "isPaper": True
            }, timeout=10)
            
            if close_res.status_code == 200:
                print("SUCCESS")
                exited_count += 1
                total_freed += l["val"]
            else:
                print(f"FAILED ({close_res.status_code})")
                print(close_res.text)

        print(f"\n--- Liquidation Summary ---")
        print(f"Positions Closed: {exited_count}")
        print(f"Estimated Capital Freed: ${total_freed:.2f}")
        print(f"System should now have enough buying power for 'Elite' signals.")

    except Exception as e:
        print(f"Critical Error: {e}")

if __name__ == "__main__":
    main()
