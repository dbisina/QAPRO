---
name: gherkin-ac
description: How to write testable acceptance criteria as Gherkin scenarios (Given/When/Then), including negative, boundary and non-functional criteria.
---

# Writing acceptance criteria in Gherkin

## Rules
- One behaviour per scenario. Title says the rule, not the steps.
- **Given** = state that already exists; **When** = one user or system action; **Then** = observable outcome (UI text, API status and body, stored data, event published).
- Use concrete values: `Given a basket totalling 49.99 GBP`, not `Given a small basket`.
- No UI mechanics unless the UI *is* the requirement ("clicks the blue button" is a test step, not a criterion).
- Every rule gets its failure scenario next to its success scenario.
- Non-functional criteria are measurable: `Then the response arrives within 800 ms at p95 under 200 requests per second`.
- Use `Scenario Outline` + `Examples` for boundaries.

## Template
```gherkin
Scenario: <rule in one sentence>
  Given <existing state with concrete values>
  When <single action>
  Then <observable outcome>
  And <second observable outcome, if needed>
```

## Examples
```gherkin
Scenario: Free delivery applies from 50 GBP
  Given a basket totalling 50.00 GBP
  When the customer opens checkout
  Then the delivery charge is 0.00 GBP

Scenario Outline: Delivery charge at the free-delivery boundary
  Given a basket totalling <total> GBP
  When the customer opens checkout
  Then the delivery charge is <charge> GBP
  Examples:
    | total | charge |
    | 49.99 | 3.99   |
    | 50.00 | 0.00   |

Scenario: Another customer's order is not visible
  Given customer A owns order 1001
  When customer B requests order 1001 through the API
  Then the API responds 404 and no order data is returned
```
