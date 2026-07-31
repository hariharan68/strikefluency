---
title: Saved strategies and drafts
description: Persisting structures, sharing them by link, and the strategy lifecycle.
status: stable
---

# Saved strategies and drafts

## Two kinds of persistence

**Saved Strategies** — named structures you intend to keep and reuse.

**Draft Portfolios** — working notebooks. Use these while you are still exploring, before a structure is worth naming.

Both live on your account and follow you across devices.

## The lifecycle

A strategy moves through states:

1. **Draft** — editable. You can change legs, strikes, quantities, everything.
2. **Executed** — positions are open. The structure is locked; the only actions are mark-to-market and exit.
3. **Closed** — all legs squared off, realised P&L booked.

Only drafts can be edited. Attempting to modify an executed strategy returns `NOT_A_DRAFT` naming the current status.

## Sharing by link

The builder encodes a structure into the URL, so you can copy the address bar and send it to someone. Opening the link reconstructs the exact configuration — legs, strikes, expiries, quantities and overrides.

This works for people who do not have an account, which makes it useful for explaining a structure to someone.

Two forms exist: a shareable configuration link, and a link to a specific saved strategy on your account.

## Coming back from positions

Clicking **Modify** on an executed strategy in the positions workspace opens the builder with that strategy loaded. You can study what you actually hold, adjust the target sliders, and see where it stands — you just cannot edit the legs while it is live.

This is the most useful workflow in the builder: not designing structures in the abstract, but examining an open position and understanding how it will behave between here and expiry.

## Practical habits

**Save before executing.** An executed strategy cannot be edited, so if you want to try a variation later you need the draft.

**Name things properly.** `NIFTY 25000 condor 07Aug` beats `strategy 4`. You will have a dozen within a week.

**Keep a scratch draft.** One draft portfolio for experiments that you overwrite freely, separate from the structures you care about.

## Storage

Structures are stored as JSON workspaces on your account. There is no export to file, and no import — the URL is the transport mechanism.
