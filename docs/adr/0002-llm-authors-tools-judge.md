# ADR-0002: LLM authors, tools judge

- Status: Accepted (2026-09-24)

## Context
LLM output varies between runs and can be steered by prompt injection. A release gate has to be reproducible and explainable.

## Decision
- Pass/fail comes only from deterministic tools (JUnit results, SARIF, Stryker) evaluated by `src/gate.ts` against `tool-config/gates.json`.
- The gate **fails closed**: missing required evidence fails, and an empty test suite fails.
- AI agents write tests, analyse requirements, triage failures and recommend. Their steps are advisory (`continueOnError`) and can never pass or fail a gate on their own.
- Agent output must validate against a JSON Schema (`schemas/`). The runner allows one repair turn, then fails the step.
- Agents write to ADO only through deterministic code (`src/bin/ado.ts`). They never get write tools for work items.

## Consequences
- The kill switch `QA_AI_GATES=off` removes every AI step and leaves the gates intact.
- Gate thresholds change by PR review of `tool-config/gates.json`, not by prompting.
- The flaky-test policy (the `@quarantine` tag) is visible and deterministic.
