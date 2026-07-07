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
from requests import Response

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


LIQUIDATE_SCRIPT_VERSION = "2026-07-07-r3"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Liquidate all Alpaca positions and cancel open orders")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--paper", action="store_true", help="Use Alpaca paper account (default)")
    mode.add_argument("--live", action="store_true", help="Use Alpaca live account")
    confirm_mode = parser.add_mutually_exclusive_group()
    confirm_mode.add_argument("--one-shot", action="store_true", help="Run liquidation immediately without prompt")
    confirm_mode.add_argument("--yes", action="store_true", help="Alias for --one-shot")
    parser.add_argument("--timeout", type=int, default=20, help="HTTP timeout seconds (default: 20)")
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=30,
        help="Max seconds to wait for order cancels to fully clear (default: 30)",
    )
    parser.add_argument(
        "--passes",
        type=int,
        default=5,
        help="Max retry passes over unresolved symbols (default: 5)",
    )
    parser.add_argument(
        "--request-retries",
        type=int,
        default=3,
        help="Retries per HTTP request on timeout/network errors (default: 3)",
    )
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


def is_held_qty_error(payload: Any) -> bool:
    if isinstance(payload, dict):
        code = payload.get("code")
        msg = str(payload.get("message", "")).lower()
        held = str(payload.get("held_for_orders", ""))
        return code == 40310000 or ("insufficient qty available for order" in msg and held not in ("", "0", "0.0"))
    if isinstance(payload, str):
        low = payload.lower()
        return "insufficient qty available for order" in low and "held_for_orders" in low
    return False


def extract_related_orders(payload: Any) -> List[str]:
    if not isinstance(payload, dict):
        return []
    raw = payload.get("related_orders") or []
    return [str(x) for x in raw if str(x).strip()]


def request_or_none(
    method: str,
    url: str,
    headers: Dict[str, str],
    timeout: int,
    request_retries: int,
    **kwargs,
) -> Response | None:
    attempts = max(1, request_retries)
    for idx in range(attempts):
        try:
            return requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
        except requests.exceptions.RequestException as exc:
            is_last = idx == attempts - 1
            print(f"Request error {method} {url}: {exc}")
            if is_last:
                return None
            time.sleep(1.0 + idx)
    return None


def fetch_positions(base_url: str, headers: Dict[str, str], timeout: int, request_retries: int) -> List[Dict[str, Any]]:
    resp = request_or_none("GET", f"{base_url}/v2/positions", headers, timeout, request_retries)
    if resp is None:
        raise RuntimeError("Failed to fetch positions due to repeated network/timeout errors")
    if not resp.ok:
        raise RuntimeError(f"Failed to fetch positions: {resp.status_code} {get_json_or_text(resp)}")
    data = get_json_or_text(resp)
    return data if isinstance(data, list) else []


def fetch_open_orders(base_url: str, headers: Dict[str, str], timeout: int, request_retries: int) -> List[Dict[str, Any]]:
    resp = request_or_none("GET", f"{base_url}/v2/orders?status=open", headers, timeout, request_retries)
    if resp is None:
        raise RuntimeError("Failed to fetch open orders due to repeated network/timeout errors")
    if not resp.ok:
        raise RuntimeError(f"Failed to fetch open orders: {resp.status_code} {get_json_or_text(resp)}")
    data = get_json_or_text(resp)
    return data if isinstance(data, list) else []


def cancel_all_orders(base_url: str, headers: Dict[str, str], timeout: int, request_retries: int) -> None:
    resp = request_or_none("DELETE", f"{base_url}/v2/orders", headers, timeout, request_retries)
    if resp is None:
        print("Warning: cancel-all failed due to repeated network/timeout errors")
        return
    if resp.ok:
        print("Canceled all open orders.")
        return
    print(f"Warning: cancel-all failed: {resp.status_code} {get_json_or_text(resp)}")


def cancel_order_by_id(base_url: str, headers: Dict[str, str], order_id: str, timeout: int, request_retries: int) -> None:
    resp = request_or_none("DELETE", f"{base_url}/v2/orders/{order_id}", headers, timeout, request_retries)
    if resp is None:
        print(f"Warning: failed to cancel related order {order_id}: timeout/network error")
        return
    if resp.ok:
        print(f"Canceled related order {order_id}.")
    else:
        print(f"Warning: failed to cancel related order {order_id}: {resp.status_code} {get_json_or_text(resp)}")


def wait_for_open_orders_to_clear(
    base_url: str,
    headers: Dict[str, str],
    timeout: int,
    wait_seconds: int,
    request_retries: int,
) -> List[Dict[str, Any]]:
    deadline = time.time() + max(wait_seconds, 0)
    pending = fetch_open_orders(base_url, headers, timeout, request_retries)
    while pending and time.time() < deadline:
        print(f"Waiting for {len(pending)} open orders to clear...")
        time.sleep(1.0)
        pending = fetch_open_orders(base_url, headers, timeout, request_retries)
    return pending


def close_all_positions(base_url: str, headers: Dict[str, str], timeout: int, request_retries: int) -> None:
    resp = request_or_none("DELETE", f"{base_url}/v2/positions?cancel_orders=true", headers, timeout, request_retries)
    if resp is None:
        print("Warning: bulk close-all failed due to repeated network/timeout errors")
        return
    if resp.ok:
        print("Submitted bulk close-all positions request.")
        return
    print(f"Warning: bulk close-all failed: {resp.status_code} {get_json_or_text(resp)}")


def close_symbol(base_url: str, headers: Dict[str, str], symbol: str, timeout: int, request_retries: int) -> Response | None:
    return request_or_none("DELETE", f"{base_url}/v2/positions/{symbol}", headers, timeout, request_retries)


def submit_market_order(
    base_url: str,
    headers: Dict[str, str],
    symbol: str,
    qty: str,
    side: str,
    timeout: int,
    request_retries: int,
) -> Response | None:
    payload = {
        "symbol": symbol,
        "qty": qty,
        "side": side,
        "type": "market",
        "time_in_force": "day",
    }
    return request_or_none("POST", f"{base_url}/v2/orders", headers, timeout, request_retries, json=payload)


def main() -> int:
    args = parse_args()

    print(f"liquidate.py version: {LIQUIDATE_SCRIPT_VERSION}")
    print(f"script path: {os.path.abspath(__file__)}")

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
        positions = fetch_positions(base_url, headers, args.timeout, args.request_retries)
        open_orders = fetch_open_orders(base_url, headers, args.timeout, args.request_retries)
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

    cancel_all_orders(base_url, headers, args.timeout, args.request_retries)
    pending_orders = wait_for_open_orders_to_clear(
        base_url,
        headers,
        args.timeout,
        args.wait_seconds,
        args.request_retries,
    )
    if pending_orders:
        print(f"Warning: {len(pending_orders)} orders still open after wait; liquidation will continue with retries.")
    close_all_positions(base_url, headers, args.timeout, args.request_retries)

    time.sleep(1.0)

    unresolved = fetch_positions(base_url, headers, args.timeout, args.request_retries)
    if not unresolved:
        print("All positions are closed.")
        return 0

    pass_num = 1
    while unresolved and pass_num <= max(1, args.passes):
        print(f"Retry pass {pass_num}: {len(unresolved)} unresolved positions...")
        # Do not blanket-cancel at each pass; that can cancel fresh close orders before they fill.
        # Only cancel when Alpaca indicates held-order lock for a specific symbol.

        for position in unresolved:
            symbol = str(position.get("symbol", "")).upper()
            qty = str(position.get("qty", ""))
            side = str(position.get("side", "")).lower()
            if not symbol or not qty:
                continue

            resp = close_symbol(base_url, headers, symbol, args.timeout, args.request_retries)
            if resp is None:
                print(f"Close request timed out for {symbol}; will retry in next pass.")
                continue
            if resp.ok:
                print(f"Closed {symbol} via position DELETE.")
                continue

            body = get_json_or_text(resp)
            if is_held_qty_error(body):
                related_orders = extract_related_orders(body)
                if related_orders:
                    print(f"{symbol} is still held by {len(related_orders)} related orders; canceling and retrying.")
                    for order_id in related_orders:
                        cancel_order_by_id(base_url, headers, str(order_id), args.timeout, args.request_retries)
                    pending_after_related = wait_for_open_orders_to_clear(
                        base_url,
                        headers,
                        args.timeout,
                        min(10, args.wait_seconds),
                        args.request_retries,
                    )
                    if pending_after_related:
                        print(f"Note: {len(pending_after_related)} orders still open after related-order cancel attempts.")
                    retry_resp = close_symbol(base_url, headers, symbol, args.timeout, args.request_retries)
                    if retry_resp is not None and retry_resp.ok:
                        print(f"Closed {symbol} after related-order cancel retry.")
                        continue
                else:
                    print(f"{symbol} is locked by held orders; waiting for next pass.")
                # Do not place fallback order here; that can create another hold lock cycle.
                continue

            market_side = "buy" if side == "short" else "sell"
            order_resp = submit_market_order(
                base_url,
                headers,
                symbol,
                qty.lstrip("-"),
                market_side,
                args.timeout,
                args.request_retries,
            )
            if order_resp is None:
                print(f"Fallback market order timed out for {symbol}; will retry in next pass.")
                continue
            order_body = get_json_or_text(order_resp)
            if is_held_qty_error(order_body):
                related_orders = extract_related_orders(order_body)
                if related_orders:
                    print(f"Fallback order for {symbol} created/encountered held lock; canceling {len(related_orders)} related orders.")
                    for order_id in related_orders:
                        cancel_order_by_id(base_url, headers, order_id, args.timeout, args.request_retries)
                else:
                    print(f"Fallback order for {symbol} hit held-qty lock; skipping until next pass.")
                continue
            if order_resp.ok:
                print(f"Submitted fallback {market_side.upper()} market order for {symbol} qty={qty}.")
            else:
                print(
                    f"Failed to close {symbol}: "
                    f"{order_resp.status_code} {order_body}"
                )

        time.sleep(1.0)
        open_orders_now = fetch_open_orders(base_url, headers, args.timeout, args.request_retries)
        if open_orders_now:
            print(f"Pass {pass_num}: {len(open_orders_now)} open close/order requests pending; waiting before next pass.")
            time.sleep(min(5, args.wait_seconds))
        unresolved = fetch_positions(base_url, headers, args.timeout, args.request_retries)
        pass_num += 1

    final_positions = fetch_positions(base_url, headers, args.timeout, args.request_retries)
    if final_positions:
        print(f"Still open after retries: {len(final_positions)}")
        for p in final_positions:
            print(f" - {p.get('symbol')} qty={p.get('qty')} side={p.get('side')}")
        return 1

    print("Liquidation complete. No open positions remain.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

