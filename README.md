# qa-platform (QAPRO)

Claude-driven QA for Azure DevOps Scrum teams across **dev, uat and prod**. QA starts when an Epic is created and continues after production deploys. The core rule: **LLM authors, tools judge**. Claude analyses requirements, designs and writes tests, and triages failures. Deterministic tools and thresholds decide pass or fail.

- Architecture and roadmap: [docs/architecture.md](docs/architecture.md)
- Decisions: [docs/adr/](docs/adr/)
- **Continuing on the VM? Start at [docs/HANDOFF.md](docs/HANDOFF.md).**
- How this came about: [docs/conversation-log.md](docs/conversation-log.md)

## What is here (Phase 0 scaffold)

| Path | What |
|---|---|
| `.claude/agents/` | 6 agents: `req-analyst`, `test-designer`, `test-author`, `failure-triager`, `security-analyst` (Sonnet/Haiku), `release-judge` (Opus) |
| `.claude/skills/` | ISO 25010 checklist, STRIDE, Gherkin AC, test-design techniques, triage rubric, `/qa-today` |
| `.claude/hooks/guard.mjs` | Blocks destructive commands everywhere, and every write in prod (`QA_ENV=prod`) |
| `schemas/` | JSON Schemas every agent output must satisfy |
| `src/bin/run-agent.ts` | Runs an agent headless (`claude -p`), validates output, allows one repair turn, writes an audit record |
| `src/bin/gate.ts` | Deterministic gate over JUnit / SARIF / Stryker using `tool-config/gates.json` (fails closed) |
| `src/bin/ado.ts` | Azure DevOps I/O: fetch the work item and its parents, publish analysis, create linked Test Cases (dry-run by default) |
| `pipelines/` | Work-item webhook pipeline, PR gate template, post-deploy verify template, examples for app repos |
| `evals/` | Golden cases for the agents ("QA the QA") |

## Quick start

```bash
npm ci
npm run check          # typecheck + 75 unit tests
```

Run an agent locally. Needs Claude Code installed and logged in:
```bash
npx tsx src/bin/run-agent.ts --agent req-analyst --schema schemas/req-analysis.schema.json \
  --input evals/req-analyst/case-001.input.json --task "Analyse this work item for QA readiness." \
  --out out/req-analysis.json
```

Evaluate a gate:
```bash
npx tsx src/bin/gate.ts --stage pr --junit-dir qa-results/junit --sarif-dir qa-results/sarif
```

Talk to Azure DevOps (dry run unless `--apply`):
```bash
ADO_ORG_URL=https://dev.azure.com/<org> ADO_PROJECT=<project> ADO_PAT=<pat> \
  npx tsx src/bin/ado.ts fetch-workitem --id 123 --out out/work-item.json
```
