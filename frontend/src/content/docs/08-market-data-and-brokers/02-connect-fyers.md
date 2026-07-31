---
title: Connect Fyers
description: The three-step Fyers setup wizard, start to finish.
status: stable
---

# Connect Fyers

Go to **Settings → Broker Integration** and click **Add Fyers Broker**. The wizard has three steps.

## Step 1 — Create an app at Fyers

You need a Fyers API app, which takes about a minute to create.

1. Open the [Fyers API dashboard](https://myapi.fyers.in/dashboard).
2. Click **Create App**.
3. Give it a name — anything, e.g. `StrikeFluency`.
4. Paste the **Redirect URL** from the wizard. There is a copy button; use it rather than typing, because an exact match is required. It defaults to:
   `http://127.0.0.1:8000/api/v1/auth/fyers/callback`
5. Tick the App Permissions. The wizard notes that **Profile Details is enough for market data** — you do not need to grant more.
6. Accept the terms and create the app.

Keep the resulting page open. You need the **App ID** and **Secret ID** from it.

## Step 2 — Enter your keys

Two fields:

- **App ID** — automatically uppercased, in the form `ABCDE123XY-100`
- **Secret ID** — entered as a password field

Both are stored server-side. The secret is never returned to your browser afterward.

Validation is simple: `App ID is required` and `Secret ID is required`.

If you already have credentials saved, a banner shows the masked App ID and warns that new keys will replace it.

## Step 3 — Connect

Click **Connect**. A popup opens for the Fyers login.

- Complete the login yourself in that window.
- The app polls for completion every 3 seconds.
- It times out after **180 seconds** with *"Fyers connection timed out — try Connect again"*.

If your browser blocks the popup you will see:

> Popup blocked. Allow popups for this site and try again.

Allow popups for the site and retry.

On success: *"Fyers connected — live market data is now active"*.

## Returning later

If credentials are already saved, the wizard **opens directly at step 3**. You do not re-enter your keys to reconnect — there is a *"Use different keys"* link if you actually need to change them.

## Managing the connection

The Fyers row in Settings offers different actions depending on state:

| State | Actions |
|---|---|
| Not configured | **Add Fyers Broker** |
| Configured, not connected | **Connect** · **Revoke** |
| Connected | **Refresh Profile** · **Disconnect** · **Revoke** |

**Disconnect** clears the session token but keeps your credentials — *"Fyers disconnected — credentials kept, reconnect anytime"*.

**Revoke** deletes the credentials entirely. It asks first:

> Revoke Fyers credentials? Your App ID and Secret ID will be removed from the server and you will need to re-enter them to reconnect.

## Status badges

The row shows one of: **Connecting**, **Reconnect required**, **Feed reconnecting**, **Live**, **Stale**, **Unavailable**, **Connected**, **Token saved**, or **Not connected**. When connected, the row gets a green left border and a tinted background.

## Known gaps

Fyers **historical data** and **futures** are not implemented — those endpoints return a *not implemented* response. Everything the option chain needs works.

## Remember

Connecting Fyers gives StrikeFluency **market data only**. It cannot place orders on your Fyers account. That boundary is enforced in code.
