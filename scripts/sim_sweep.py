#!/usr/bin/env python3
import csv
import json
import subprocess
import urllib.parse
import sys

targets = ["AAPL","MSFT","TSLA","AMZN","GOOG","META","NVDA","BRK.B","JPM"]
out = "/tmp/sim_sweep.csv"
rows = [["symbol","action","qty","price","notional","price_source"]]

for s in targets:
    try:
        dec = subprocess.check_output([
            "curl","-s","-X","POST","http://localhost:3000/api/gemini/autopilot",
            "-H","Content-Type: application/json",
            "-d", json.dumps({"targetSymbol": s})
        ])
        decision = json.loads(dec)
    except Exception as e:
        decision = {"action": "HOLD", "qty": 0}

    action = decision.get("action","HOLD")
    qty = decision.get("qty",0)

    try:
        q = urllib.parse.quote(s)
        quote_raw = subprocess.check_output(["curl","-s", f"http://localhost:3000/api/alpaca/quote?symbol={q}"])
        quote = json.loads(quote_raw)
        price = quote.get("price")
        source = quote.get("source")
    except Exception:
        price = None
        source = None

    try:
        notional = float(qty) * float(price) if price is not None else 0
    except Exception:
        notional = 0

    rows.append([s, str(action), str(qty), str(price) if price is not None else "", str(notional), source or ""])

with open(out, "w", newline='') as f:
    w = csv.writer(f)
    w.writerows(rows)

print("Wrote", out)
print("--- sample ---")
with open(out) as f:
    for i,l in enumerate(f):
        print(l.strip())
        if i>12:
            break
