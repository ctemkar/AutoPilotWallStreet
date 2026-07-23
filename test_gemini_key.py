
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv('.env.local')

api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    print("No API Key found")
    exit(1)

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-flash')

try:
    response = model.generate_content("Ping")
    print(f"Success: {response.text}")
except Exception as e:
    print(f"Error: {e}")
