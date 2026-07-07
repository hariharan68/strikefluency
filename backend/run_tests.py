"""
run_tests.py
─────────────
Automated test suite for StrikeFluency API.
Runs against the live server on localhost:8001.

Usage:
    python run_tests.py

No pytest needed — just requests.
Tests the full flow: register → login → account → trade → discipline → close → journal
"""

import sys
import uuid
import requests

BASE = "http://localhost:8001/api/v1"

# ── Colours ───────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

passed = 0
failed = 0


def ok(label: str, detail: str = ""):
    global passed
    passed += 1
    print(f"  {GREEN}✅ PASS{RESET}  {label}" + (f"  {YELLOW}→ {detail}{RESET}" if detail else ""))


def fail(label: str, detail: str = ""):
    global failed
    failed += 1
    print(f"  {RED}❌ FAIL{RESET}  {label}" + (f"  {RED}→ {detail}{RESET}" if detail else ""))


def section(title: str):
    print(f"\n{BOLD}{CYAN}── {title} {'─' * (50 - len(title))}{RESET}")


def check(label: str, condition: bool, detail: str = ""):
    if condition:
        ok(label, detail)
    else:
        fail(label, detail)


# ═══════════════════════════════════════════════════════════════
print(f"\n{BOLD}StrikeFluency API — Automated Test Suite{RESET}")
print(f"Server: {BASE}\n")

# ── Verify server is up ───────────────────────────────────────
try:
    r = requests.get("http://localhost:8001/health", timeout=3)
    check("Server health check", r.status_code == 200, r.json().get("status"))
except Exception as e:
    fail("Server reachable", str(e))
    print(f"\n{RED}Server is not running. Start it first:{RESET}")
    print("  uvicorn app.main:app --reload --port 8001")
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════
section("AUTH — Register + Login")

# Use unique email so tests can be run multiple times
test_email    = f"test_{uuid.uuid4().hex[:6]}@strikefluency.com"
test_password = "TestPass123"

# Register
r = requests.post(f"{BASE}/auth/register", json={
    "full_name": "Test Trader",
    "email":     test_email,
    "password":  test_password,
})
check("Register new user", r.status_code == 201, f"email={test_email}")

data         = r.json()
ACCESS_TOKEN = data.get("access_token", "")
USER_ID      = data.get("user", {}).get("id", "")
check("Access token returned",  bool(ACCESS_TOKEN), ACCESS_TOKEN[:20] + "...")
check("User ID returned",       bool(USER_ID))
check("Role is tenant_admin",   data.get("user", {}).get("role") == "tenant_admin")

HEADERS = {"Authorization": f"Bearer {ACCESS_TOKEN}"}

# Login
r = requests.post(f"{BASE}/auth/login", data={
    "username": test_email,
    "password": test_password,
})
check("Login with credentials", r.status_code == 200)
check("Login returns tokens",   "access_token" in r.json())

# Me
r = requests.get(f"{BASE}/auth/me", headers=HEADERS)
check("GET /auth/me",           r.status_code == 200)
check("Email matches",          r.json().get("email") == test_email)


# ═══════════════════════════════════════════════════════════════
section("TRADING — Account")

r = requests.get(f"{BASE}/trading/account", headers=HEADERS)
check("GET /trading/account",        r.status_code == 200)

acct = r.json()
check("Balance = ₹1,00,000",         acct["account"]["balance"] == "100000.00")
check("Tier = TIER_1",               acct["account"]["tier"] == "TIER_1")
check("Discipline score = 100",      acct["account"]["discipline_score"] == "100.00")
check("Today trades = 0",            acct["today_trades"] == 0)
check("Cooldown not active",         acct["is_cooldown_active"] == False)


# ═══════════════════════════════════════════════════════════════
section("MARKET DATA — Option Chain")

r = requests.get(f"{BASE}/market/option-chain?instrument=NIFTY", headers=HEADERS)
check("GET /market/option-chain",    r.status_code == 200)

chain    = r.json()["data"]
spot     = chain["spot_price"]
atm      = chain["atm_strike"]
strikes  = chain["strikes"]
check("Spot price returned",         spot > 0, f"₹{spot}")
check("ATM strike returned",         atm > 0, str(atm))
check("21 strikes in chain",         len(strikes) >= 20, f"{len(strikes)} strikes")
check("PCR returned",                "pcr" in chain, str(chain.get("pcr")))

# Get ATM CE LTP for setting realistic SL
atm_strike_data = next((s for s in strikes if s["strike"] == atm), None)
ATM_LTP = atm_strike_data["ce"]["ltp"] if atm_strike_data else 100.0
check("ATM CE LTP fetched",          ATM_LTP > 0, f"₹{ATM_LTP}")

VALID_SL     = round(ATM_LTP * 0.6, 2)   # 60% of LTP — safely below
VALID_TARGET = round(ATM_LTP * 1.5, 2)   # 150% of LTP — above entry


# ═══════════════════════════════════════════════════════════════
section("DISCIPLINE ENGINE — Rule Violations")

# Rule 2 — MANDATORY_SL: SL above LTP should fail
r = requests.post(f"{BASE}/trading/orders", headers=HEADERS, json={
    "instrument":   "NIFTY",
    "expiry_date":  "2026-07-10",
    "strike_price": atm,
    "option_type":  "CE",
    "action":       "BUY",
    "quantity":     1,
    "sl_price":     round(ATM_LTP * 2, 2),  # SL ABOVE ltp → invalid
    "setup_tag":    "OI_BASED",
})
check("Rule 2 — MANDATORY_SL blocks invalid SL",
      r.status_code == 400 and r.json().get("rule_code") == "MANDATORY_SL",
      r.json().get("rule_code", r.status_code))

# Rule 7 — MANDATORY_SETUP_TAG: missing setup_tag handled by Pydantic
r = requests.post(f"{BASE}/trading/orders", headers=HEADERS, json={
    "instrument":   "NIFTY",
    "expiry_date":  "2026-07-10",
    "strike_price": atm,
    "option_type":  "CE",
    "action":       "BUY",
    "quantity":     1,
    "sl_price":     VALID_SL,
})
check("Rule 7 — MANDATORY_SETUP_TAG blocked (422 from Pydantic)",
      r.status_code == 422,
      str(r.status_code))


# ═══════════════════════════════════════════════════════════════
section("VIRTUAL TRADING — Place Order")

ORDER_BODY = {
    "instrument":   "NIFTY",
    "expiry_date":  "2026-07-10",
    "strike_price": atm,
    "option_type":  "CE",
    "action":       "BUY",
    "quantity":     1,
    "sl_price":     VALID_SL,
    "target_price": VALID_TARGET,
    "setup_tag":    "OI_BASED",
}

r = requests.post(f"{BASE}/trading/orders", headers=HEADERS, json=ORDER_BODY)
check("POST /trading/orders — 201 Created",  r.status_code == 201, str(r.status_code))

if r.status_code == 201:
    order = r.json()
    ORDER_ID = order["id"]
    check("Order ID returned",               bool(ORDER_ID))
    check("Status = OPEN",                   order["status"] == "OPEN")
    check("Lot size = 65",                   order["lot_size"] == 65, str(order["lot_size"]))
    check("Slippage applied",                float(order["slippage_points"]) > 0, f"₹{order['slippage_points']}")
    check("Brokerage applied",               float(order["brokerage"]) > 0, f"₹{order['brokerage']}")
    check("Discipline compliant = True",     order["is_discipline_compliant"] == True)
    check("Entry price > entry LTP",         float(order["entry_price"]) > float(order["entry_ltp"]),
          f"LTP={order['entry_ltp']} fill={order['entry_price']}")
else:
    fail("Order placed", r.json().get("message", str(r.json())))
    ORDER_ID = None


# ═══════════════════════════════════════════════════════════════
section("DISCIPLINE ENGINE — Post-Order Rules")

if ORDER_ID:
    # Rule 3 — NO_AVERAGING_DOWN: same strike again
    r = requests.post(f"{BASE}/trading/orders", headers=HEADERS, json={**ORDER_BODY})
    check("Rule 3 — NO_AVERAGING_DOWN blocked",
          r.status_code == 400 and r.json().get("rule_code") == "NO_AVERAGING_DOWN",
          r.json().get("rule_code", str(r.status_code)))

    # Rule 4 — NO_DIRECTION_FLIP: PE while CE open
    r = requests.post(f"{BASE}/trading/orders", headers=HEADERS, json={
        **ORDER_BODY,
        "option_type": "PE",
        "strike_price": atm + 100,
        "sl_price":     VALID_SL,
    })
    check("Rule 4 — NO_DIRECTION_FLIP blocked",
          r.status_code == 400 and r.json().get("rule_code") == "NO_DIRECTION_FLIP",
          r.json().get("rule_code", str(r.status_code)))


# ═══════════════════════════════════════════════════════════════
section("POSITIONS — Open Position Check")

r = requests.get(f"{BASE}/trading/positions", headers=HEADERS)
check("GET /trading/positions — 200 OK",     r.status_code == 200)

pos_data = r.json()
check("1 open position",                     len(pos_data["positions"]) == 1,
      str(len(pos_data["positions"])))

if pos_data["positions"]:
    pos = pos_data["positions"][0]
    check("Position is_open = True",         pos["is_open"] == True)
    check("Position instrument = NIFTY",     pos["instrument"] == "NIFTY")
    check("Margin blocked > 0",              float(pos["margin_blocked"]) > 0,
          f"₹{pos['margin_blocked']}")


# ═══════════════════════════════════════════════════════════════
section("ACCOUNT — Balance After Order")

r = requests.get(f"{BASE}/trading/account", headers=HEADERS)
acct2 = r.json()
balance_after = float(acct2["account"]["balance"])
check("Balance reduced after order",         balance_after < 100000,
      f"₹{balance_after:.2f}")
check("Today trades = 1",                    acct2["today_trades"] == 1)


# ═══════════════════════════════════════════════════════════════
section("CLOSE POSITION — P&L + Journal")

if ORDER_ID:
    r = requests.post(f"{BASE}/trading/orders/{ORDER_ID}/close", headers=HEADERS)
    check("POST /trading/orders/{id}/close — 200",  r.status_code == 200, str(r.status_code))

    if r.status_code == 200:
        close_data = r.json()
        check("Order status = CLOSED",          close_data["order"]["status"] == "CLOSED")
        check("Exit price present",             close_data["order"]["exit_price"] is not None)
        check("Net P&L returned",               close_data["net_pnl"] is not None,
              f"₹{close_data['net_pnl']}")
        check("Message returned",               "P&L" in close_data.get("message", ""))

    # Account balance after close
    r2 = requests.get(f"{BASE}/trading/account", headers=HEADERS)
    acct3 = r2.json()
    balance_final = float(acct3["account"]["balance"])
    check("Margin released after close",        balance_final > balance_after,
          f"₹{balance_final:.2f}")
    check("Realized P&L updated in session",    acct3["today_realized_pnl"] != "0.00",
          acct3["today_realized_pnl"])


# ═══════════════════════════════════════════════════════════════
section("SESSION — Today's Trading Session")

r = requests.get(f"{BASE}/trading/sessions/today", headers=HEADERS)
check("GET /trading/sessions/today — 200",   r.status_code == 200)

sess = r.json()
check("Trades count = 1",                    sess["trades_count"] == 1,
      str(sess["trades_count"]))
check("Session date = today",                sess["session_date"] is not None)
check("Cooldown not active",                 sess["is_cooldown_active"] == False)


# ═══════════════════════════════════════════════════════════════
section("ORDERS — List + Single Order")

r = requests.get(f"{BASE}/trading/orders", headers=HEADERS)
check("GET /trading/orders — 200",           r.status_code == 200)
check("1 order in history",                  r.json()["total"] == 1,
      str(r.json()["total"]))

if ORDER_ID:
    r = requests.get(f"{BASE}/trading/orders/{ORDER_ID}", headers=HEADERS)
    check("GET /trading/orders/{id} — 200",  r.status_code == 200)
    check("Order status = CLOSED",           r.json()["status"] == "CLOSED")


# ═══════════════════════════════════════════════════════════════
section("MARKET DATA — All Instruments")

for instrument in ["NIFTY", "BANKNIFTY", "SENSEX"]:
    r = requests.get(f"{BASE}/market/spot?instrument={instrument}", headers=HEADERS)
    spot = r.json().get("spot_price", 0) if r.status_code == 200 else 0
    check(f"Spot price — {instrument}",      r.status_code == 200 and spot > 0,
          f"₹{spot}")


# ═══════════════════════════════════════════════════════════════
# SUMMARY
print(f"\n{'═' * 60}")
total = passed + failed
print(f"{BOLD}Results: {GREEN}{passed} passed{RESET} | {RED}{failed} failed{RESET} | {total} total")

if failed == 0:
    print(f"\n{GREEN}{BOLD}🎉 All tests passed! Backend is working correctly.{RESET}")
elif failed <= 2:
    print(f"\n{YELLOW}⚠  Almost there — {failed} test(s) need attention.{RESET}")
else:
    print(f"\n{RED}❌ {failed} tests failed — check the output above.{RESET}")

print()