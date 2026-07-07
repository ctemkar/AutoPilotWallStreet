#!/usr/bin/env python3
"""
Emergency Alpaca liquidation script.

What it does:
1. Cancels all open orders.
2. Attempts bulk close of all positions.
3. Retries unresolved positions symbol-by-symbol.
4. Falls back to explicit market orders when needed.

Examples:
    python3 liquidate.py --paper
    python3 liquidate.py --paper --one-shot
    python3 liquidate.py --live --yes
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from typing import Any, Dict, List, Tuple

import requests

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Liquidate all Alpaca positions and cancel open orders")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--paper", action="store_true", help="Use Alpaca paper account (default)")
    mode.add_argument("--live", action="store_true", help="Use Alpaca live account")
    confirm_mode = parser.add_mutually_exclusive_group()
    confirm_mode.add_argument("--one-shot", action="store_true", help="Run liquidation immediately without prompt")
    confirm_mode.add_argument("--yes", action="store_true", help="Alias for --one-shot")
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout seconds (default: 20)")
    return parser.parse_args()


def pick_credentials(is_paper: bool) -> Tuple[str, str]:
    if is_paper:
        key = (
            os.getenv("ALPACA_PAPER_API_KEY")
            or os.getenv("ALPACA_API_KEY")
            or os.getenv("ALPACA_KEY")
            or os.getenv("ALPACA_LIVE_API_KEY")
        )
        secret = (
            os.getenv("ALPACA_PAPER_API_SECRET")
            or os.getenv("ALPACA_API_SECRET")
            or os.getenv("ALPACA_SECRET")
            or os.getenv("ALPACA_LIVE_API_SECRET")
        )
    else:
        key = (
            os.getenv("ALPACA_LIVE_API_KEY")
            or os.getenv("ALPACA_API_KEY")
            or os.getenv("ALPACA_KEY")
            or os.getenv("ALPACA_PAPER_API_KEY")
        )
        secret = (
            os.getenv("ALPACA_LIVE_API_SECRET")
            or os.getenv("ALPACA_API_SECRET")
            or os.getenv("ALPACA_SECRET")
            or os.getenv("ALPACA_PAPER_API_SECRET")
        )

    return key or "", secret or ""


def build_headers(key: str, secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        "Content-Type": "application/json",
    }


def get_json_or_text(resp: requests.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return resp.text


def request_or_die(method: str, url: str, headers: Dict[str, str], timeout: int, **kwargs) -> requests.Response:
    resp = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
    return resp


def fetch_positions(base_url: str, headers: Dict[str, str], timeout: int) -> List[Dict[str, Any]]:
    resp = request_or_die("GET", f"{base_url}/v2/positions", headers, timeout)
    if not resp.ok:
        raise RuntimeError(f"Failed to fetch positions: {resp.status_code} {get_json_or_text(resp)}")
    data = get_json_or_text(resp)
    return data if isinstance(data, list) else []


def fetch_open_orders(base_url: str, headers: Dict[str, str], timeout: int) -> List[Dict[str, Any]]:
    resp = request_or_die("GET", f"{base_url}/v2/orders?status=open", headers, timeout)
    if not resp.ok:
        raise RuntimeError(f"Failed to fetch open orders: {resp.status_code} {get_json_or_text(resp)}")
    data = get_json_or_text(resp)
    return data if isinstance(data, list) else []


def cancel_all_orders(base_url: str, headers: Dict[str, str], timeout: int) -> None:
    resp = request_or_die("DELETE", f"{base_url}/v2/orders", headers, timeout)
    if resp.ok:
        print("Canceled all open orders.")
        return
    print(f"Warning: cancel-all failed: {resp.status_code} {get_json_or_text(resp)}")


def close_all_positions(base_url: str, headers: Dict[str, str], timeout: int) -> None:
    resp = request_or_die("DELETE", f"{base_url}/v2/positions?cancel_orders=true", headers, timeout)
    if resp.ok:
        print("Submitted bulk close-all positions request.")
        return
    print(f"Warning: bulk close-all failed: {resp.status_code} {get_json_or_text(resp)}")


def close_symbol(base_url: str, headers: Dict[str, str], symbol: str, timeout: int) -> requests.Response:
    return request_or_die("DELETE", f"{base_url}/v2/positions/{symbol}", headers, timeout)


def submit_market_order(base_url: str, headers: Dict[str, str], symbol: str, qty: str, side: str, timeout: int) -> requests.Response:
    payload = {
        "symbol": symbol,
        "qty": qty,
        "side": side,
        "type": "market",
        "time_in_force": "day",
    }
    return request_or_die("POST", f"{base_url}/v2/orders", headers, timeout, json=payload)


def main() -> int:
    args = parse_args()

    if load_dotenv:
        load_dotenv()
        load_dotenv(".env.local")

    is_paper = not args.live
    base_url = "https://paper-api.alpaca.markets" if is_paper else "https://api.alpaca.markets"
    key, secret = pick_credentials(is_paper)

    if not key or not secret:
        print("Missing Alpaca credentials for selected mode.")
        print("Paper: ALPACA_PAPER_API_KEY / ALPACA_PAPER_API_SECRET")
        print("Live:  ALPACA_LIVE_API_KEY / ALPACA_LIVE_API_SECRET")
        print("Fallbacks: ALPACA_API_KEY / ALPACA_API_SECRET / ALPACA_KEY / ALPACA_SECRET")
        return 2

    headers = build_headers(key, secret)

    try:
        positions = fetch_positions(base_url, headers, args.timeout)
        open_orders = fetch_open_orders(base_url, headers, args.timeout)
    except Exception as exc:
        print(f"Startup check failed: {exc}")
        return 1

    print(f"Mode: {'PAPER' if is_paper else 'LIVE'}")
    print(f"Open positions: {len(positions)}")
    print(f"Open orders: {len(open_orders)}")

    if not positions and not open_orders:
        print("Nothing to liquidate.")
        return 0

    one_shot = bool(args.one_shot or args.yes)

    if not one_shot:
        answer = input("Type 'LIQUIDATE' to continue: ").strip()
        if answer != "LIQUIDATE":
            print("Aborted.")
            return 0

    cancel_all_orders(base_url, headers, args.timeout)
    close_all_positions(base_url, headers, args.timeout)

    time.sleep(1.0)

    unresolved = fetch_positions(base_url, headers, args.timeout)
    if not unresolved:
        print("All positions are closed.")
        return 0

    print(f"Retrying {len(unresolved)} unresolved positions...")
    for position in unresolved:
        symbol = str(position.get("symbol", "")).upper()
        qty = str(position.get("qty", ""))
        side = str(position.get("side", "")).lower()
        if not symbol or not qty:
            continue

        resp = close_symbol(base_url, headers, symbol, args.timeout)
        if resp.ok:
            print(f"Closed {symbol} via position DELETE.")
            continue

        market_side = "buy" if side == "short" else "sell"
        order_resp = submit_market_order(base_url, headers, symbol, qty.lstrip("-"), market_side, args.timeout)
        if order_resp.ok:
            print(f"Submitted fallback {market_side.upper()} market order for {symbol} qty={qty}.")
        else:
            print(
                f"Failed to close {symbol}: "
                f"{order_resp.status_code} {get_json_or_text(order_resp)}"
            )

    final_positions = fetch_positions(base_url, headers, args.timeout)
    if final_positions:
        print(f"Still open after retries: {len(final_positions)}")
        for p in final_positions:
            print(f" - {p.get('symbol')} qty={p.get('qty')} side={p.get('side')}")
        return 1

    print("Liquidation complete. No open positions remain.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

