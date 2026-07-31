---
title: Create your account
description: Signing up, logging in, and how sessions work.
status: stable
---

# Create your account

## Signing up

Go to **Register** and provide:

| Field | Requirement |
|---|---|
| Full name | Any name — it appears in your profile and dashboard greeting |
| Email | Must be unique; this is your login identity |
| Password | Minimum 8 characters |
| Confirm password | Must match |

Alternatively, use **Continue with Google** to sign up with your Google account. You will not set a password in that case.

## What happens the moment you register

Registration does more than create a login. In a single transaction the system also:

1. **Opens a virtual account** and credits it with **₹1,00,000** of simulated capital.
2. **Seeds all seven discipline rules** at their default values, all active.
3. **Turns Discipline Mode ON**, so the rules are enforced from your very first order.
4. Sets your capital tier to **Tier 1**.

You do not have to configure anything before you start trading. Read [Your virtual account](/docs/your-virtual-account) for what that capital actually means.

## Logging in

Log in with your email and password, or with Google. There is a **Remember me** option that keeps you signed in across browser restarts.

## How sessions work

StrikeFluency uses short-lived access tokens held in memory, paired with a rotating refresh token stored in a secure, http-only cookie. In practice this means:

- Your session stays alive while you use the app without re-entering a password.
- Closing the tab does not sign you out if you chose *Remember me*.
- The access token is never written to `localStorage`, so a malicious script cannot read it.

### Managing your sessions

**Settings → Account & Security** lists every active session with its device and policy. From there you can:

- **Revoke** an individual session — useful if you logged in on a shared machine.
- **Sign out everywhere** — kills every session including the one you are using.

You can also sign out normally from the bottom of the sidebar.

## Forgotten passwords

If you signed up with Google, there is no password to forget — always use **Continue with Google**.

> **A note on roles.** Self-service signups are currently created as tenant administrators. The practical effect is that the broker-connection screen in Settings, which is intended to be admin-only, is available to you.
