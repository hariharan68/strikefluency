"""Live smoke test for the Fyers credentials wizard endpoints (server on :8001)."""

import sys
import time
import uuid
from pathlib import Path

import requests

BASE = "http://localhost:8001/api/v1"
ORIGIN = {"Origin": "http://localhost:5173"}
ENV = Path(__file__).parent / ".env"

results = []


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f"  -> {detail}" if detail else ""))


for _ in range(30):
    try:
        if requests.get("http://localhost:8001/health", timeout=2).status_code == 200:
            break
    except Exception:
        time.sleep(1)
else:
    print("server never came up")
    sys.exit(1)

env_before = ENV.read_text(encoding="utf-8")

# unauthenticated access must be rejected
r = requests.get(f"{BASE}/auth/fyers/credentials")
check("GET credentials without token -> 401", r.status_code == 401, str(r.status_code))
r = requests.post(f"{BASE}/auth/fyers/credentials", json={"app_id": "X", "secret_id": "Y"})
check("POST credentials without token -> 401", r.status_code == 401, str(r.status_code))

# get a real user token
email = f"broker_{uuid.uuid4().hex[:8]}@test.com"
r = requests.post(f"{BASE}/auth/register", json={"full_name": "Broker Smoke", "email": email, "password": "BrokerPass123"}, headers=ORIGIN)
H = {"Authorization": f"Bearer {r.json()['access_token']}", **ORIGIN}

# GET returns redirect uri
r = requests.get(f"{BASE}/auth/fyers/credentials", headers=H)
check("GET credentials 200", r.status_code == 200, str(r.status_code))
check("redirect_uri present", "callback" in r.json().get("redirect_uri", ""), r.json().get("redirect_uri", ""))

# invalid app id -> friendly 400
r = requests.post(f"{BASE}/auth/fyers/credentials", json={"app_id": "bad id", "secret_id": "GOODSECRET1"}, headers=H)
check("bad app_id -> 400", r.status_code == 400, r.json().get("detail", "")[:50])

# valid-shaped fake credentials -> 200, masked, secret never echoed
r = requests.post(f"{BASE}/auth/fyers/credentials", json={"app_id": "smoketst12-100", "secret_id": "FAKESECRET99"}, headers=H)
check("valid credentials -> 200", r.status_code == 200, str(r.status_code))
body = r.text
check("configured true", r.json().get("configured") is True)
check("app id masked", r.json().get("app_id_masked", "").startswith("SMOK") and "****" in r.json().get("app_id_masked", ""), r.json().get("app_id_masked", ""))
check("secret NOT echoed anywhere", "FAKESECRET99" not in body)

# .env got the values, everything else preserved
env_after = ENV.read_text(encoding="utf-8")
check(".env contains new app id", "FYERS_APP_ID=SMOKETST12-100" in env_after)
check(".env contains new secret", "FYERS_SECRET_ID=FAKESECRET99" in env_after)
check(".env no tmp file left", not (ENV.parent / ".env.tmp").exists())
check(".env line count stable (replace, not append-dup)",
      abs(len(env_after.splitlines()) - len(env_before.splitlines())) <= 3,
      f"{len(env_before.splitlines())} -> {len(env_after.splitlines())}")
check(".env other keys preserved", "DATABASE_URL=" in env_after and "SECRET_KEY=" in env_after)

# in-memory effect WITHOUT restart: login URL generation now has credentials
r = requests.get(f"{BASE}/auth/fyers/login", headers=H)
check("login URL available without restart", r.status_code == 200 and "login_url" in r.json(), str(r.status_code))
check("login URL contains our app id", "SMOKETST12-100" in r.json().get("login_url", ""))

# status reflects configured
r = requests.get(f"{BASE}/auth/fyers/status", headers=H)
check("status configured=true", r.json().get("configured") is True, r.json().get("message", ""))

failed = [x for x in results if not x[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
