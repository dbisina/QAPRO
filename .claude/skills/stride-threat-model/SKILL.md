---
name: stride-threat-model
description: Lightweight STRIDE threat modelling for a feature, design or PBI. Use when a change touches authentication, authorisation, personal data, payments, external input, file handling or integrations.
---

# STRIDE threat model (lightweight)

1. **Sketch the data flow** from the design docs: actors, entry points (UI, API, queue, file, webhook), trust boundaries, data stores, external services.
2. **Walk each category** against each entry point and boundary. Record only threats that are plausible for this change.

| Category | Ask | Typical mitigations to check for |
|---|---|---|
| **S**poofing | Can someone pretend to be another user, service or webhook sender? | Strong auth, MFA for sensitive actions, signed webhooks, mTLS/managed identity between services |
| **T**ampering | Can input, messages or stored data be modified in transit or at rest? | Server-side validation, integrity checks, parameterised queries, immutable audit logs |
| **R**epudiation | Could a user deny an action we cannot prove? | Audit log with who/what/when, correlation ids, tamper-evident storage |
| **I**nformation disclosure | Can data leak through responses, logs, errors, URLs, caches or other tenants? | Least-data responses, object-level authorisation, masking in logs, no PII in URLs |
| **D**enial of service | Can a request or file exhaust CPU, memory, storage or a rate-limited dependency? | Rate limits, size limits, pagination, timeouts, queue backpressure |
| **E**levation of privilege | Can a user reach functions or data above their role? | Deny by default, role checks on the server for every action, no client-side-only checks |

3. **For each threat** write a finding: `dimension: security`, severity by impact × likelihood, the entry point as `evidence`, and a testable mitigation as `suggestion` (for example: "API returns 403 when user A requests order of user B").
4. Every mitigation should become at least one security test case (test-designer picks these up).
