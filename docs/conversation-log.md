# Conversation log: planning and Phase 0 scaffold

- **Date:** 2026-09-24
- **Where:** Claude Code desktop app on the QA engineer's laptop, working directory `D:\GitHub\QAPRO`
- **Models:** Claude Opus 5.5 was the main session (planning, verification, adjudication, implementation). Research and review subagents ran on Sonnet and Haiku, following the user's cost rule.
- **Format:** the user's messages are verbatim. Claude's turns are summarised faithfully, including tool results. System prompts and account details are left out.

---

## 1. User — the request

> /caveman /compress /token-optimizer /token-coach /senior-architect /senior-fullstack /ai-engineer /fullstack-dev-skills:test-master /test-automator /test-driven-development /fullstack-dev-skills:the-fool /fullstack-dev-skills:playwright-expert /ralph /karpathy-guidelines /scrum-master /skill-lookup  /using-superpowers /brainstorming /multi-agent-brainstorming /parallel-agents /gsd
>
> I just started a job and we use provisone d azure vms to work m an AI enabled QA engineer and my manager has asjed me to make QA 100% AI automated so we could deliver 5x faster
>
> So there are 3 envs dev, uat and prod
>
> for a fullyautonomous QA system the pipline has to integrate from the epic to the pbi to th back logs and shitm, should connect to scrum, sshould see my tasks, should read design.md, and and =y s=archetiectutrakl docs, should then run QA analysuisit on them and give suggestions at that stage, shiold be invilved in the testing at each stage qa is necessary, should be able to run qa in dev, uat and prod, and musty always give a systrem that does not fail, never over look anything, security, performance, functionality, ux,  ui, scaliability, managebility, and co
>
> so i need you to resaerch and write a plan to aCHJIEVE THIS
>
> I ALSO NEED YOU TO consider the use ooif https://github.com/receptron/laya and jev in thiis piple, we would be uising claude for the whole thing so focus on claude as the agent
>
> if you decide to use a workflow in your plkaninig now i need you toi note that while opus 5.5 is hje naib nidek herer dibt use it for akk subagents to save cise, use soinnety and haiku where complexity deosnt matyter, onlky use opus to verify and tweak what thise agents surface
>
> then wriete the fulkl architectutral plan so we cwan talk about how to implement it and wh=ether its good
>
> notee i currntly have not bveenb grabvted acess to he v,m bu tin time i will s this ia a preamble

## 2. Claude — research (plan mode, read-only)

Three research subagents ran in parallel: two on Sonnet, one on Haiku. Opus then verified the results.

**laya and Jev (Sonnet agent, Opus-verified by fetching the repo and searching the web)**
- **laya** ([receptron/laya](https://github.com/receptron/laya)): created 2026-09-19, v0.1.1, MIT licence, 2 contributors. A Node/TypeScript ONNX Runtime wrapper around a ModernBERT classifier from Convai Innovations. It is a "System-1 decision model": you give it a state plus typed questions and it returns calibrated probabilities (`choice`, `score`, `noul`). It does not generate text. It is compatible with Jev's `system_one` API. Needs about 2 GB RAM. State is truncated at 512 tokens. No Claude/MCP integration, and not related to receptron's GraphAI.
- **Jev**: TypeSafe AI's hosted proprietary System One model, launched 2026-09-15 with a $40M seed and covered by The Register and others. **Opus correction:** the Sonnet agent had called Jev "possibly fabricated astroturf". Opus verification found Jev is real; only the look-alike "awesome-jev" repositories look spammy.
- Verdict: useful as an optional high-volume triage layer (failure classification, dedup, risk scoring, alert classification), never as the only authority for a gate.

**Azure DevOps + Claude integration (Sonnet agent)**
- Microsoft's Azure DevOps MCP server (`microsoft/azure-devops-mcp`): domains core, work, work-items, search, test-plans, repositories, wiki, pipelines, advanced-security. Remote (`https://mcp.dev.azure.com/{org}`) or local (`npx @azure-devops/mcp`); PAT or Entra/`az login` auth.
- Claude in Microsoft Foundry is generally available (around 2026-06). Claude Code uses it via `CLAUDE_CODE_USE_FOUNDRY=1` and `ANTHROPIC_FOUNDRY_RESOURCE`.
- There is no official Azure DevOps equivalent of `anthropics/claude-code-action`, only community tasks. Headless `claude -p` works in pipelines.
- Service Hooks fire on work item created/updated, PR and build events, and need a reply within 25s. Environments give approvals and checks.
- Test Plans REST API: test cases must link to PBIs with "Tests/Tested By".

**QA tooling per quality dimension (Haiku agent)**
Playwright (+ MCP + Test Agents planner/generator/healer), Schemathesis, Pact, Semgrep, CodeQL, OWASP ZAP, Trivy, gitleaks, k6, Azure Load Testing, axe-core, Lighthouse CI, Azure Chaos Studio, Stryker, App Insights synthetic tests, Azure App Configuration.

## 3. Claude — architecture plan, red-team, approval

Opus drafted the plan, now `docs/architecture.md`. Key points:
- **Expectation reset.** "Never fails" cannot be guaranteed by any QA system. Replace it with traceability, evidence-based gates, a measured escape rate and seeded-defect drills. "100% AI" means AI executes every QA activity, with humans on the loop at prod approval, risk acceptance and agent changes. 5x has to be proven against a Phase 0 baseline.
- **Principles:** LLM authors, tools judge. Haiku, Sonnet, Opus tiering. System-1/System-2 cascade (laya/Jev, then Claude). Azure DevOps as the system of record. Azure Pipelines as the orchestrator. Evals for the agents themselves.
- **Lifecycle S0–S8:** Epic analysis, PBI readiness and test design, sprint planning, PR gates, dev/uat/prod verification, continuous prod monitoring, sprint metrics.

A Sonnet Plan agent red-teamed the draft and raised 12 findings. Opus accepted 10 and marked 1 as partly wrong; the last was already flagged for verification. Fixes applied:
- The DoR rule is org-level, so it goes on a dedicated child process.
- The UAT gate is a pipeline stage, because there is no native "LLM report" check.
- Test cases are associated with runs via `@TC` tags.
- Added runtime budgets, a nightly heavy suite, test-data isolation, agent-pool capacity, rate limits, hard cost ceilings, and human sign-off for suppressions.
- MVP cut line: Phases 0–2, one pilot team, 5 agents.

**User approved the plan.** Claude saved two memory notes: the subagent model-tiering rule, and the project context.

## 4. Claude — clarifying questions; user answers

| Question | Answer |
|---|---|
| Where do work items and code live? | **Not sure yet** |
| How will the company give access to Claude? | **Claude Team/Enterprise seats** |
| What type of app is under test? | **All: web frontend, APIs/microservices, mobile app, desktop/other** |
| What next while waiting for VM access? | **Scaffold Phase 0 in QAPRO (recommended)** |

Claude's notes on the answers:
- Seats cover interactive use. Unattended pipelines need an API key or Foundry, and seat tokens in shared CI need admin confirmation (ADR-0004).
- All four surfaces means one gate built on JUnit/SARIF, with per-surface tools (ADR-0006).
- The tracker stays behind an adapter (ADR-0005).

## 5. User — mid-build messages

> log this whoole conversdation in the repo and push to git ionce youre done i would pull it in the vm and have clauide do the ncessary there

> you can commit this to main since it isnt a whole prooduct yet

Claude: this log is the conversation record. `docs/HANDOFF.md` is the brief for Claude on the VM. The repo is pushed to a **private** GitHub repository and committed directly to `main`, as instructed. That overrides the global "branch + PR" convention for this repo.

## 6. Claude — Phase 0 scaffold built

- TypeScript (strict), Node ≥ 22, `tsx`, `vitest`, `ajv`, `fast-xml-parser`.
- Agents: `req-analyst`, `test-designer`, `test-author`, `failure-triager` (Haiku), `security-analyst`, `release-judge` (Opus).
- Skills: ISO 25010 checklist, STRIDE, Gherkin AC, test-design techniques, triage rubric, `/qa-today`.
- `run-agent.ts`: headless `claude -p`. Sends the prompt on stdin, fences untrusted input, validates against the schema, allows one repair turn in the same session, writes an audit record.
- `gate.ts`: a deterministic gate over JUnit, SARIF and Stryker. Fails closed, has a quarantine tag and a freshness check.
- `ado.ts`: fetches the work item and its parents, publishes analysis (comment + tags), and creates Test Cases with the Tests link. Idempotent, dry-run by default, honours `Retry-After`.
- `guard.mjs` PreToolUse hook: blocks destructive commands, and in `QA_ENV=prod` blocks every write.
- Pipelines: webhook work-item pipeline, PR gate template, dev/uat/prod verify template, app examples, ZAP baseline plan.
- 7 ADRs, the eval case, README, CLAUDE.md, HANDOFF.

**Verification**
- `npm run check`: typecheck clean, 75/75 tests.
- Gate CLI smoke test: exit 1 on a failing test plus a gitleaks finding; exit 0 on clean evidence.
- Live agent smoke test 1 (req-analyst on Haiku, sample payment PBI): the pipeline mechanics worked (10 turns, 130s, $0.16) and the analysis quality was good. The schema check correctly **rejected** one off-enum value (`dimension: "info"`). Root cause was ambiguous prompt wording. Fixes: clarified the prompt, and added the one-shot repair turn.
- Live agent smoke test 2, after the fixes: valid on the first try ($0.09, 94s). It matched eval case-001 exactly: risk high, readiness needs-clarification, and all 6 must-find dimensions.
- The project's guard hook blocked Claude's own `rm -rf` during the session. Claude used a new output folder instead of working around it.

## 7. Open items handed to the VM session
See `docs/HANDOFF.md` §2 (decisions), §4 (ADO admin setup), §5 (end-to-end spike) and §6 (verify list).
