"""
generate_fyers_token.py
────────────────────────
Run this script to generate a fresh Fyers access token.

Usage:
    python generate_fyers_token.py

Reads FYERS_APP_ID, FYERS_SECRET_ID, FYERS_REDIRECT_URI from .env.
Prints the new FYERS_ACCESS_TOKEN line to paste into .env.
"""

import hashlib
import sys

from dotenv import load_dotenv
import os

# ── STEP 1: Load credentials from .env ────────────────────────────────────────
load_dotenv()

APP_ID       = os.getenv("FYERS_APP_ID")
SECRET_KEY   = os.getenv("FYERS_SECRET_ID")
REDIRECT_URI = os.getenv("FYERS_REDIRECT_URI")

if not APP_ID or not SECRET_KEY or not REDIRECT_URI:
    print("\nERROR: Missing Fyers credentials in .env")
    print("Make sure these are set:")
    print("  FYERS_APP_ID=...")
    print("  FYERS_SECRET_ID=...")
    print("  FYERS_REDIRECT_URI=...")
    sys.exit(1)

try:
    from fyers_apiv3 import fyersModel
    from fyers_apiv3.accessToken import SessionModel
except ImportError:
    print("\nERROR: fyers_apiv3 not installed.")
    print("Run: pip install fyers-apiv3")
    sys.exit(1)

# ── STEP 2: Generate the auth URL ─────────────────────────────────────────────
session = SessionModel(
    client_id=APP_ID,
    secret_key=SECRET_KEY,
    redirect_uri=REDIRECT_URI,
    response_type="code",
    grant_type="authorization_code",
)

auth_url = session.generate_authcode()

# ── STEP 3: Print instructions ────────────────────────────────────────────────
print("\n" + "═" * 60)
print("  FYERS TOKEN GENERATOR")
print("═" * 60)
print("\nSTEP 1 — Open this URL in your browser:\n")
print(f"  {auth_url}\n")
print("STEP 2 — Login with your Fyers credentials")
print("\nSTEP 3 — After login you will be redirected to:")
print(f"  {REDIRECT_URI}?auth_code=XXXX&state=None")
print("\nCopy the auth_code value from the URL.")
print("═" * 60)

# ── STEP 4: Accept auth_code from user ────────────────────────────────────────
auth_code = input("\nPaste auth_code here: ").strip()

if not auth_code:
    print("ERROR: No auth_code provided. Exiting.")
    sys.exit(1)

# ── STEP 5: Exchange auth_code for access token ───────────────────────────────
# Fyers requires the app_id_hash = sha256(app_id:secret_key)
app_id_hash = hashlib.sha256(f"{APP_ID}:{SECRET_KEY}".encode()).hexdigest()

session.set_token(auth_code)
session.app_id_hash = app_id_hash

response = session.generate_token()

# ── STEP 6 / 7: Print result ───────────────────────────────────────────────────
print()
if response.get("access_token"):
    token = response["access_token"]
    print("═" * 60)
    print("  SUCCESS — New access token generated!")
    print("═" * 60)
    print(f"\nAccess token:\n  {token}\n")
    print("Paste this line into your .env file:")
    print(f"\n  FYERS_ACCESS_TOKEN={token}\n")
    print("Then change MARKET_DATA_PROVIDER=fyers in .env")
    print("and restart uvicorn.")
    print("═" * 60)
else:
    print("═" * 60)
    print("  FAILED — Could not generate token")
    print("═" * 60)
    print(f"\nFull response: {response}")
    print("\nCommon causes:")
    print("  - auth_code already used (each code is one-time use)")
    print("  - auth_code expired (use it within 60 seconds)")
    print("  - Wrong APP_ID or SECRET_KEY in .env")
