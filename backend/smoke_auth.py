"""Live smoke test for the auth module. Run with the server on :8000."""

import sys
import time
import uuid

import requests

BASE = "http://localhost:8001/api/v1"
ORIGIN = {"Origin": "http://localhost:5173"}

results = []


def check(label, cond, detail=""):
    results.append((label, bool(cond), detail))
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {label}" + (f"  -> {detail}" if detail else ""))


# wait for server
for _ in range(30):
    try:
        if requests.get("http://localhost:8001/health", timeout=2).status_code == 200:
            break
    except Exception:
        time.sleep(1)
else:
    print("server never came up")
    sys.exit(1)

s = requests.Session()
email = f"smoke_{uuid.uuid4().hex[:8]}@test.com"
pw = "SmokePass123"

# â”€â”€ register â”€â”€
r = s.post(f"{BASE}/auth/register", json={"full_name": "Smoke Test", "email": email, "password": pw, "remember_me": True}, headers=ORIGIN)
check("register 201", r.status_code == 201, str(r.status_code))
access = r.json().get("access_token", "")
check("access token issued", bool(access))
check("refresh cookie set", "refresh_token" in s.cookies)

H = {"Authorization": f"Bearer {access}", **ORIGIN}

# â”€â”€ me â”€â”€
r = s.get(f"{BASE}/auth/me", headers=H)
check("GET /auth/me 200", r.status_code == 200, r.json().get("email", ""))

# â”€â”€ refresh (rotation) â”€â”€
old_cookie = s.cookies.get("refresh_token")
r = s.post(f"{BASE}/auth/refresh", headers=ORIGIN)
check("refresh 200", r.status_code == 200, str(r.status_code))
new_access = r.json().get("access_token", "")
check("new access token", bool(new_access) and new_access != access)
check("cookie rotated", s.cookies.get("refresh_token") != old_cookie)

# â”€â”€ reuse of OLD rotated cookie â†’ 401 (grace window allows once; test uniform 401 shape) â”€â”€
r2 = requests.post(f"{BASE}/auth/refresh", cookies={"refresh_token": old_cookie}, headers=ORIGIN)
check("old cookie rejected or absorbed (401/200, no 500)", r2.status_code in (200, 401), str(r2.status_code))

# â”€â”€ refresh without origin â†’ 403 â”€â”€
r = requests.post(f"{BASE}/auth/refresh", cookies={"refresh_token": s.cookies.get("refresh_token")})
check("refresh without Origin -> 403", r.status_code == 403, str(r.status_code))

# â”€â”€ email case-insensitive login â”€â”€
r = s.post(f"{BASE}/auth/login", json={"email": email.upper(), "password": pw, "remember_me": False}, headers=ORIGIN)
check("login with UPPERCASE email 200", r.status_code == 200, str(r.status_code))

# â”€â”€ sessions list â”€â”€
H2 = {"Authorization": f"Bearer {r.json()['access_token']}", **ORIGIN}
r = s.get(f"{BASE}/auth/sessions", headers=H2)
check("GET /auth/sessions 200", r.status_code == 200, f"{len(r.json())} sessions")
check("current session flagged", any(item.get("current") for item in r.json()))

# â”€â”€ protected endpoints require auth â”€â”€
r = requests.get(f"{BASE}/trading/account")
check("no token -> 401", r.status_code == 401, str(r.status_code))
r = requests.get(f"{BASE}/auth/fyers/status")
check("broker status without token -> 401 (was open!)", r.status_code == 401, str(r.status_code))
r = requests.get(f"{BASE}/market/option-chain")
check("option-chain without token -> 401", r.status_code == 401, str(r.status_code))
r = requests.get(f"{BASE}/market/status")
check("market status public -> 200", r.status_code == 200, str(r.status_code))

# â”€â”€ security headers present â”€â”€
r = requests.get("http://localhost:8001/health")
check("X-Content-Type-Options header", r.headers.get("X-Content-Type-Options") == "nosniff")
check("X-Frame-Options header", r.headers.get("X-Frame-Options") == "DENY")

# â”€â”€ logout-all (was 500 before deny_jti import fix) â”€â”€
r = s.post(f"{BASE}/auth/logout-all", headers=H2)
check("POST /auth/logout-all 200 (was NameError 500)", r.status_code == 200, str(r.status_code))

# â”€â”€ after logout-all: old access token dead (token_version bump) â”€â”€
r = s.get(f"{BASE}/auth/me", headers=H2)
check("access token invalid after logout-all", r.status_code == 401, str(r.status_code))

# â”€â”€ after logout-all: refresh cookie dead â”€â”€
r = s.post(f"{BASE}/auth/refresh", headers=ORIGIN)
check("refresh dead after logout-all", r.status_code == 401, str(r.status_code))

# â”€â”€ plain logout flow â”€â”€
r = s.post(f"{BASE}/auth/login", json={"email": email, "password": pw, "remember_me": True}, headers=ORIGIN)
check("re-login 200", r.status_code == 200)
r = s.post(f"{BASE}/auth/logout", headers=ORIGIN)
check("logout 200", r.status_code == 200)
r = s.post(f"{BASE}/auth/refresh", headers=ORIGIN)
check("refresh dead after logout", r.status_code == 401, str(r.status_code))

# â”€â”€ wrong password uniform 401 â”€â”€
r = s.post(f"{BASE}/auth/login", json={"email": email, "password": "WrongPass123", "remember_me": True}, headers=ORIGIN)
check("wrong password -> 401", r.status_code == 401, str(r.status_code))

failed = [x for x in results if not x[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
