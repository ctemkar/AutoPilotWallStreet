import os
import time
import hmac
import hashlib
import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.local")

def run_comprehensive_matrix():
    print("====================================================")
    print("      MULTI-EXCHANGE COMPONENT MATRIX               ")
    print("====================================================")

    api_key = os.getenv("BINANCE_KEY")
    secret_key = os.getenv("BINANCE_SECRET")
    
    alpaca_key = os.getenv("ALPACA_KEY")
    alpaca_secret = os.getenv("ALPACA_SECRET")

    base_url = "https://papi.binance.com"
    alpaca_url = "https://api.alpaca.markets"

    def test_endpoint(name, method, endpoint, payload=None):
        if payload is None:
            payload = {}

        timestamp = int(time.time() * 1000)
        payload.update({"recvWindow": 10000, "timestamp": timestamp})

        query_string = "&".join([f"{k}={v}" for k, v in sorted(payload.items())])

        signature = hmac.new(
            secret_key.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        headers = {
            "X-MBX-APIKEY": api_key,
            "Content-Type": "application/x-www-form-urlencoded"
        }

        try:
            if method == "GET":
                url = f"{base_url}{endpoint}?{query_string}&signature={signature}"
                res = requests.get(url, headers=headers)
            elif method == "POST":
                url = f"{base_url}{endpoint}"
                post_data = f"{query_string}&signature={signature}"
                res = requests.post(url, headers=headers, data=post_data)

            if res.status_code == 200:
                print(f"✅ {name:<30} -> OPERATIONAL")
                return True
            else:
                try:
                    error_msg = res.json().get("msg", "Unknown Error")
                except:
                    error_msg = f"HTML Response Error Flag (Status Code: {res.status_code})"
                print(f"❌ {name:<30} -> FAILED ({error_msg})")
                return False
        except Exception as err:
            print(f"❌ {name:<30} -> UNREACHABLE ({err})")
            return False

    def test_alpaca(name, method, endpoint):
        headers = {
            "APCA-API-KEY-ID": alpaca_key,
            "APCA-API-SECRET-KEY": alpaca_secret
        }
        try:
            url = f"{alpaca_url}{endpoint}"
            if method == "GET":
                res = requests.get(url, headers=headers)
            if res.status_code == 200:
                print(f"✅ {name:<30} -> OPERATIONAL")
                return True
            else:
                try:
                    server_msg = res.json()
                except:
                    server_msg = res.text
                print(f"❌ {name:<30} -> FAILED (Status Code: {res.status_code} | Info: {server_msg})")
                return False
        except Exception as err:
            print(f"❌ {name:<30} -> UNREACHABLE ({err})")
            return False

    functional = []
    broken = []

    if api_key and secret_key:
        if test_endpoint("Unified Balance Read", "GET", "/papi/v1/balance"):
            functional.append("Unified Balance Read")
        else:
            broken.append("Unified Balance Read")

        if test_endpoint("Account Information State", "GET", "/papi/v1/account"):
            functional.append("Account Information State")
        else:
            broken.append("Account Information State")

        if test_endpoint("USD-M Position Risk Sync", "GET", "/papi/v1/um/positionRisk"):
            functional.append("USD-M Position Risk Sync")
        else:
            broken.append("USD-M Position Risk Sync")

        order_payload = {
            "symbol": "BTCUSDT",
            "side": "BUY",
            "type": "LIMIT",
            "quantity": "0.01",
            "price": "30000",
            "timeInForce": "GTC",
            "newOrderRespType": "ACK",
            "test": "true"
        }
        if test_endpoint("Futures Order Verification", "POST", "/papi/v1/um/order", order_payload):
            functional.append("Futures Order Verification")
        else:
            broken.append("Futures Order Verification")
    else:
        print("❌ Binance Credentials missing from environment configuration")
        broken.append("Binance Framework")

    if alpaca_key and alpaca_secret:
        print(f"Testing Alpaca against Live Endpoint: {alpaca_url}")
        if test_alpaca("Alpaca Account Read", "GET", "/v2/account"):
            functional.append("Alpaca Account Read")
        else:
            broken.append("Alpaca Account Read")

        if test_alpaca("Alpaca Positions Read", "GET", "/v2/positions"):
            functional.append("Alpaca Positions Read")
        else:
            broken.append("Alpaca Positions Read")
    else:
        print("❌ Alpaca Credentials missing from environment configuration")
        broken.append("Alpaca Framework")

    print("\n====================================================")
    print("                  MATRIX SUMMARY                    ")
    print("====================================================")
    print(f"Operational Components ({len(functional)}): {', '.join(functional) if functional else 'None'}")
    print(f"Degraded Components    ({len(broken)}): {', '.join(broken) if broken else 'None'}")
    print("====================================================")

if __name__ == "__main__":
    run_comprehensive_matrix()
