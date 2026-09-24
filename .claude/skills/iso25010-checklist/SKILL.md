---
name: iso25010-checklist
description: Quality-dimension checklist (ISO/IEC 25010 plus scalability, manageability, accessibility, data privacy and testability) used to make sure no dimension is skipped when analysing requirements, designs or release evidence.
---

# Quality dimension checklist

Walk **every** section. For each one, either raise specific findings or state in one line why it does not apply. The dimension keys match `schemas/req-analysis.schema.json`.

## functional
- Is every behaviour stated as an observable outcome? Are the inputs, outputs and business rules explicit?
- Negative paths: invalid input, empty/null, duplicates, concurrency (two users, double submit), partial failure.
- Boundaries: min/max lengths, amounts, dates, time zones, rounding, pagination limits.

## security
- Who may do this (roles, tenancy)? Is authorisation checked on the server for every action and object (IDOR)?
- Untrusted input: validation, encoding, injection (SQL/NoSQL/command/template), file upload type and size.
- Secrets, tokens and session handling; audit logging of security-relevant events.
- For auth, data, payments or integrations, also run the STRIDE skill.

## performance
- Numeric targets: p95 latency, throughput, page-load budget (LCP/INP/CLS), payload sizes. "Fast" is not a requirement.
- Expensive operations: N+1 queries, unbounded lists, synchronous calls to slow dependencies.

## scalability
- Expected volume now and in 12 months (users, records, requests per second). What grows unbounded?
- Stateless scaling, caching, queueing, rate limits, database indexes for new queries.

## reliability
- Behaviour when a dependency is slow, down or returns errors: timeouts, retries with backoff, idempotency, circuit breaking.
- Data consistency on partial failure; recovery and replay; backups for new data stores.

## usability-ux
- The primary user task is completable without help; clear errors that say how to recover; empty and loading states.
- Consistency with existing flows; confirmation for destructive actions; undo where possible.

## ui
- Matches the design (Figma / design.md): spacing, typography, tokens, responsive breakpoints, dark mode if supported.
- All states designed: loading, empty, error, long text, localisation expansion.

## accessibility
- WCAG 2.2 AA: keyboard operability and focus order, accessible names/labels, contrast, text resize, screen reader announcements for dynamic content, touch target size on mobile.

## compatibility
- Supported browsers/devices/OS versions (web: Chromium, Firefox, WebKit; mobile: iOS and Android versions; desktop: OS versions).
- Backwards compatibility of APIs, events and stored data; versioning; feature flags.

## maintainability
- Is the change testable at unit/API level, not only through the UI? Are contracts documented (OpenAPI, events)?

## manageability-observability
- Logs, metrics and traces for the new behaviour; alerts and dashboards; correlation ids.
- Configuration and feature flags: who can change them, per environment, safe defaults.
- Operational runbook for new failure modes.

## portability-deployability
- Infrastructure as code for new resources; environment parity (dev/uat/prod config differences); migrations are reversible or forward-only with a plan; zero-downtime deploy.

## data-privacy
- Personal data collected, purpose, retention, deletion/export (GDPR/NDPR as applicable), masking in logs and non-prod environments.

## testability
- Can each acceptance criterion be verified automatically? Are test hooks, seed data, stable test ids (`data-testid`) and non-prod credentials available?
