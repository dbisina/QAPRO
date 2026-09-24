---
name: test-design-techniques
description: Formal test design techniques (equivalence partitioning, boundary values, decision tables, state transitions, pairwise, error guessing) and per-surface considerations for web, API, mobile and desktop.
---

# Test design techniques

| Technique | Use when | How |
|---|---|---|
| Equivalence partitioning | Inputs fall into groups the system treats alike | One case per valid class and per invalid class |
| Boundary value | Ranges, lengths, amounts, dates, limits | Test min−1, min, max, max+1 (and just inside) |
| Decision table | Several conditions combine into outcomes | One column per meaningful combination; collapse impossible ones |
| State transition | Workflows, statuses, lifecycles | Every valid transition once, plus the most dangerous invalid ones |
| Pairwise | Many configuration options (browser × locale × role) | Cover every pair of values, not every combination |
| Error guessing | Known weak spots | Empty, null, unicode/emoji, very long input, double submit, back button, expired session, clock skew, time zones |
| Exploratory charter | Unclear or high-risk areas | "Explore <area> with <resources> to discover <risk>", time-boxed |

## Prioritisation (risk-based)
Priority = impact × likelihood. Money, auth, personal data and irreversible actions are always priority 1 or 2. Test the highest risk at the cheapest level that can prove it (API before UI).

## Per surface
- **Web**: cross-browser (Chromium, Firefox, WebKit), responsive breakpoints, keyboard and screen reader, slow network, session expiry, deep links and refresh.
- **API**: status codes and error bodies, schema/contract, authorisation per endpoint and object, idempotency and retries, pagination, rate limits, backward compatibility.
- **Mobile**: iOS and Android versions, small and large screens, rotation, background/foreground, interrupted network, permissions denied, push notifications, offline mode, app upgrade with existing data.
- **Desktop**: supported OS versions, window resizing and DPI scaling, installer/upgrade/uninstall, file system permissions, offline, multiple instances.
