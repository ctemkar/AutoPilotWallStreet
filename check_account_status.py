import os
import requests
from dotenv import load_dotenv

load_dotenv()

ALPACA_PAPER_API_KEY = os.getenv('ALPACA_PAPER_API_KEY')
ALPACA_PAPER_API_SECRET = os.getenv('ALPACA_PAPER_API_SECRET')
ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets'

headers = {
    'APCA-API-KEY-ID': ALPACA_PAPER_API_KEY,
    'APCA-API-SECRET-KEY': ALPACA_PAPER_API_SECRET
}

def check_account():
    response = requests.get(f'{ALPACA_PAPER_URL}/v2/account', headers=headers)
    if response.status_code == 200:
        data = response.json()
        print(f"Account ID: {data['id']}")
        print(f"Cash: {data['cash']}")
        print(f"Equity: {data['equity']}")
        print(f"Buying Power: {data['buying_power']}")
    else:
        print(f"Error: {response.status_code} - {response.text}")

if __name__ == "__main__":
    check_account()
