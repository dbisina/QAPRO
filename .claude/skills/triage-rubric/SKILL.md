---
name: triage-rubric
description: Signals and confidence calibration for classifying automated test failures as product bug, test bug, environment, flaky or test-data.
---

# Failure triage rubric

| Category | Strong signals | Weak signals |
|---|---|---|
| product-bug | Assertion on business output fails with a plausible wrong value; same failure across browsers/devices; recent change in the code path; API returns 4xx/5xx for valid input | Only one run, no recent change |
| test-bug | Locator not found after a UI change; expectation contradicts the acceptance criteria; hard-coded waits; test depends on another test's order | Timeout inside the test code itself |
| environment | ECONNREFUSED, DNS or TLS errors, 502/503/504 from gateways, deployment still rolling, missing env config, expired test credentials | Many unrelated tests failing at the same time |
| flaky | Passed on retry; intermittent history with no code change; race conditions around animations or network | Timing-dependent assertions |
| test-data | Unique constraint violation, record already used, missing seed data, collision with another run's data | "not found" for data the test did not create |

## Confidence calibration
- **≥ 0.9**: a strong signal that is unambiguous, with no conflicting signal.
- **0.7–0.9**: strong signal, minor doubt.
- **< 0.7**: weak or conflicting signals. Say what extra evidence would settle it. Low-confidence items are re-triaged by a stronger model or a human.

## Mass failures
If more than about 30% of tests fail at once, first suspect environment or deployment. Triage one representative failure deeply, then group the rest under it.
