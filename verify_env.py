import os
from dotenv import load_dotenv
load_dotenv(".env.local")
key = os.getenv("ALPACA_KEY")
secret = os.getenv("ALPACA_SECRET")
print(f"Key loaded: {bool(key)}")
print(f"Secret loaded: {bool(secret)}")
