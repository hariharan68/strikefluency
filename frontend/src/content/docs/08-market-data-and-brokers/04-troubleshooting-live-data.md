---
title: Troubleshooting live data
description: What each status badge means and what to do about it.
status: stable
---

# Troubleshooting live data

## Status badges

The broker row in Settings shows one of these:

| Badge | Meaning | What to do |
|---|---|---|
| **Not connected** | No active session | Click **Connect** |
| **Token saved** | Credentials stored, no session | Click **Connect** |
| **Connecting** | Handshake in progress | Wait |
| **Connected** | Authenticated | Wait for **Live** |
| **Live** | Streaming normally | Nothing |
| **Feed reconnecting** | Temporary drop, recovering | Wait a few seconds |
| **Stale** | Data is old | Refresh; if it persists, reconnect |
| **Reconnect required** | Token expired | Log in again |
| **Unavailable** | Provider unreachable | Check the broker's status |

## The chain says SNAPSHOT instead of LIVE

The **LIVE · 1s** badge appears when a websocket frame arrived within the last four seconds. **SNAPSHOT** means it did not, and the app is polling every 15 seconds instead.

Causes, in order of likelihood:

1. **Market is closed.** Outside 09:15–15:30 there is nothing streaming. Expected.
2. **Broker token expired** — most common with Kite, which expires daily.
3. **Network interruption.** The connection retries with backoff automatically.
4. **You are on mock data**, which does not stream the same way.

Data is still shown in snapshot mode, just refreshed more slowly. It is degraded, not broken.

## "Reconnect Zerodha" in the top bar

Your Kite token has expired — it does this every day. Click the pill and complete the login.

If you see *"Live data unavailable — waiting for administrator"* instead, your account is not an administrator and someone else needs to reconnect.

## Kite connection stuck on "Connected"

`Connected` means authentication succeeded but the streaming worker has not come up yet. Give it a few seconds to reach `live`.

If it stays there, disconnect and reconnect. On a self-hosted install, check that `REDIS_URL` is configured — the ticker worker needs it.

## Popup blocked

Both wizards open a popup for broker login. If your browser blocks it:

> Popup blocked. Allow popups for this site and try again.

Allow popups for the site and retry.

## Fyers connection times out

The wizard waits 180 seconds, then gives up with *"Fyers connection timed out — try Connect again"*.

Usually this means the login popup was closed or left incomplete. Just try again.

## "Invalid API key" on Kite

Almost always the wrong value in the field. The API key is the **16-character key from the Connect app** — not your Zerodha Client ID, and not the app name. The wizard says so, and it is still the most common error at that step.

## Connecting one broker disconnected the other

Working as intended. Exactly one data provider is active at a time, and connecting one automatically disconnects the other.

## VIX shows a dash

Not a connection problem. India VIX is not supplied by the data layer at all, so it renders as `—` with any provider. It is a known gap.

## Orders refused outside market hours

Also not a data problem. Market hours are enforced independently of the feed — mock data will happily produce prices at midnight, and orders will still be refused. See [Market hours](/docs/market-hours).

## Nothing works and you need to keep practising

Disconnect the broker. The app falls back to **mock data**, which works at any hour and requires nothing. Your practice is not blocked by a broker outage.
