# Agent evals ("QA the QA")

Each agent has a golden set: realistic inputs plus the minimum a competent human would catch. A change to an agent prompt, skill or model has to keep or improve its score before it merges (Phase 3 makes this a required PR check).

```
evals/<agent>/case-NNN.input.json      # what the agent receives (same shape as the pipeline input)
evals/<agent>/case-NNN.expected.json   # what a good answer must contain
```

## Scoring (per agent)
| Agent | Metric |
|---|---|
| req-analyst | Recall of `mustFindDimensions`; exact `riskTier` / `readiness`; human-rated precision of findings (sampled) |
| test-designer | Every AC referenced; ≥1 negative case per AC; no duplicate titles |
| failure-triager | Category accuracy on labelled historic failures; calibration (accuracy of items with confidence ≥ 0.9) |
| security-analyst | Agreement with the security team's verdicts on labelled SARIF findings |
| release-judge | Never recommends `go` when any gate failed (hard rule); agreement with human release decisions |

## Building the set (Phase 0–2)
- Use **sanitised** real items from the pilot team, following company data policy. Remove names, customer data and secrets.
- Start with 10 cases per agent, then grow with every escaped defect: each one becomes a case.
- Runner: `src/bin/run-agent.ts` per case, then compare with `expected.json`. The runner script is a Phase 3 deliverable. Until then, run cases by hand:

```bash
npx tsx src/bin/run-agent.ts --agent req-analyst --schema schemas/req-analysis.schema.json \
  --input evals/req-analyst/case-001.input.json --task "Analyse this work item for QA readiness." \
  --out out/evals/req-analyst/case-001.json
```
