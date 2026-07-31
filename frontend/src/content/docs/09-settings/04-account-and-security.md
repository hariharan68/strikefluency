---
title: Account and security
description: Your profile, active sessions, and how credentials are protected.
status: stable
---

# Account and security

## Profile

**Settings → Profile** shows your avatar, name, email and a tier badge.

You can edit your **full name**. Your **email is read-only** — it is your login identity and cannot be changed from the interface.

## Active sessions

**Settings → Account & Security** lists every active session with its device and policy.

Two actions:

- **Revoke** — ends one specific session
- **Sign out everywhere** — ends all sessions, including the one you are using

Check this list occasionally. If you see a session you do not recognise, revoke it and change your password.

## How sessions work

Short-lived access tokens are held **in memory only** and never written to browser storage, paired with a rotating refresh token in a secure http-only cookie.

The practical security benefit: a malicious script injected into the page cannot read your access token out of `localStorage`, because it is not there. Refresh-token rotation also means a stolen refresh token is invalidated as soon as the legitimate one is next used.

## Signing out

Three ways: the sidebar footer, the Account & Security section, or **Sign out everywhere** for all devices at once.

The Settings version asks for inline confirmation first.

## Data and privacy

The section notes your trade data is stored locally and on the server, marked **Encrypted**.

## Broker credentials

Covered in detail in [Connect Fyers](/docs/connect-fyers) and [Connect Zerodha](/docs/connect-zerodha), but the security-relevant points:

- API keys and secrets are stored **server-side** and never returned to the browser after saving.
- You complete broker logins **yourself** in a popup. StrikeFluency never sees your broker password or TOTP.
- The connection is **market data inbound only** — no order placement capability exists, by design.
- **Revoke** deletes credentials from the server entirely.

## Account type

The Account Type field shows **Full Access**.

## Roles

Self-service signups are currently created as tenant administrators. The visible consequence is that the broker-connection screen, intended to be admin-only, is available to you — and if it were not, you would see *"Connection management is restricted to administrators."*

Administrators also get an **Admin Page** in the profile menu with read-only views of users, the audit trail and the funds ledger.

## What is not available

- No password change from within the app
- No self-service account deletion
- No two-factor authentication on your StrikeFluency account (your broker's own 2FA still applies to broker logins)
- No self-service account reset
