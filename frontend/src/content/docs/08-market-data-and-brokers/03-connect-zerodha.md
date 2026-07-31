---
title: Connect Zerodha
description: The four-step Kite Connect setup, and the daily login it requires.
status: stable
---

# Connect Zerodha

Zerodha connects through **Kite Connect**. Go to **Settings → Broker Integration** and click **Add Zerodha Broker**.

Note upfront: **Kite requires a fresh login every day.** The token expires daily, by Zerodha's design, not ours.

## Step 1 — Create a Kite Connect app

In the Kite developer console:

| Field | Value |
|---|---|
| **Type** | Connect |
| **App name** | StrikeFluency |
| **Zerodha Client ID** | Yours |
| **Postback URL** | Leave blank |
| **Redirect URL** | `http://127.0.0.1:8000/api/v1/auth/kite/callback` |

The wizard supplies a description you can paste, and a copy button for the redirect URL. Copy it rather than typing — it must match exactly.

## Step 2 — Enter app credentials

- **API key** — the wizard is specific about this: *"Use the 16-character API key from the active Connect app — not your Zerodha Client ID or app name."* This is the most common mistake at this step.
- **API secret** — *"stored server-side and never returned to this browser."*

## Step 3 — Daily Zerodha login

Click through to open the Zerodha login popup.

> Complete the login and TOTP yourself. StrikeFluency never receives your password or TOTP.

The app polls for completion every 1.8 seconds. You may briefly see *"Authentication complete — waiting for the KiteTicker worker"* — that is the streaming connection coming up after authentication succeeds. Wait for the state to become **live**.

## Step 4 — Connected

Optionally click **Sync instruments** to refresh the tradable instrument catalog. Success reports the count, e.g. `48213 Kite instruments synced`.

If a sync fails, the previous catalog is kept — a failed refresh never leaves you with nothing.

## The daily ritual

Every trading day you will need to repeat step 3. When the token expires you will see an amber pill in the top bar:

- **Reconnect Zerodha** if you are an administrator
- *"Live data unavailable — waiting for administrator"* if you are not

Click it and complete the login again. Steps 1 and 2 are one-time; only the login recurs.

## Fail-closed, deliberately

Kite does **not** fall back to mock data when it degrades. If the connection drops, you get a visible warning rather than simulated prices quietly replacing real ones.

That is the right behaviour — silently swapping data sources under a chart would be genuinely dangerous — but it does mean a dropped Kite connection leaves you without live data until you reconnect.

## Managing the connection

Same actions as Fyers:

- **Disconnect** — clears the token, keeps credentials
- **Revoke** — deletes credentials, with a confirmation prompt
- **Refresh Profile** — re-reads your account profile

## Production requirements

If you are self-hosting, Kite additionally requires `REDIS_URL` and `BROKER_TOKEN_ENC_KEY` to be configured. Fyers does not.

## Remember

As with Fyers, this is **market data inbound only**. StrikeFluency cannot place orders on your Zerodha account, read your real positions, or touch your funds.
