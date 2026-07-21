import os
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

api_key = os.getenv('ALPACA_PAPER_KEY')
api_secret = os.getenv('ALPACA_PAPER_SECRET')

headers = {
    'APCA-API-KEY-ID': api_key,
    'APCA-API-SECRET-KEY': api_secret
}

url = 'https://paper-api.alpaca.markets/v2/orders?status=all&limit=20'
response = requests.get(url, headers=headers)
print(response.json())
