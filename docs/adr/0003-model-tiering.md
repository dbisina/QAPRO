# ADR-0003: Model tiering — Haiku for volume, Sonnet for work, Opus to verify

- Status: Accepted (2026-09-24)

## Decision
| Tier | Agents | Why |
|---|---|---|
| Haiku | failure-triager (first pass), future prod-sentinel | High volume, pattern matching |
| Sonnet | req-analyst, test-designer, test-author, security-analyst | Judgement and authoring |
| Opus | release-judge only | Verifies what the other agents surfaced; low volume, high stakes |

- Each agent's model is set in its frontmatter. `tests/repo-contract.test.ts` enforces that only `release-judge` uses Opus.
- Escalation: re-run with `--model sonnet` (the `model` template parameter) when Haiku's confidence is below 0.7.
- Pin exact versions behind each alias with `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL` in the variable group. A model upgrade goes through the evals (`evals/`) first.
- Cost ceilings: `--max-turns` per step, per-model quotas (Foundry TPM or Console spend limits), Azure/Console budget alerts at 50/80/100%.

## Evidence
Live smoke test on 2026-09-24: `req-analyst` on Haiku, sample payment PBI. It took 10 turns, about 130s and $0.16, and caught PCI scope, the unmeasurable "fast", failure modes, duplicate charges and IDOR. The same run exposed an off-schema enum value, which led to the repair turn in ADR-0002.
After the prompt fix, a second run was valid on the first try (about $0.09, 94s). It matched eval case-001 exactly: risk high, readiness needs-clarification, and all 6 must-find dimensions. Production runs `req-analyst` on Sonnet; these runs used Haiku to keep the smoke test cheap.
