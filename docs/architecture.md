# AI-Autonomous QA Platform — Architecture Plan (v1 draft for discussion)

> **Status:** approved 2026-09-24. Decisions made after approval live in `docs/adr/`:
> - Claude auth for pipelines: the company has seats, so pipelines use Foundry or an API key (ADR-0004).
> - Tracker not yet confirmed (ADR-0005).
> - All four surfaces are in scope: web, API, mobile, desktop (ADR-0006).
>
> Current state and next steps: `docs/HANDOFF.md`.

## 1. Context

- New role: AI-enabled QA engineer. Manager's goal: "100% AI-automated QA" to ship **5x faster**.
- Stack: Azure DevOps Scrum (Epic → Feature → PBI → Task, sprints and backlogs). Work runs on provisioned Azure VMs. Three environments: **dev, uat, prod**.
- Scope asked for: tie QA to the work-item hierarchy and the scrum cadence, see the QA engineer's own tasks, read `design.md` and architecture docs, give QA analysis and suggestions *before* code exists, take part in every stage where QA is needed, run QA in all 3 envs, and cover functionality, security, performance, UX, UI, scalability, manageability and the other quality dimensions.
- Claude is the agent throughout. Evaluate **receptron/laya** and **Jev**.
- VM access is not granted yet, so this is a preamble plan. Phase 0 can run without the VM.
- Research was done by Sonnet/Haiku subagents and verified by Opus; sources are listed in §13.

### 1.1 Expectation reset (share this with the manager)
- **"Never fails, never overlooks anything" cannot be guaranteed by any QA system, human or AI.** The honest, defensible version has four parts:
  1. Every quality dimension is checked against a standard checklist (ISO/IEC 25010).
  2. Every acceptance criterion is traced to a test.
  3. Every gate is decided by evidence.
  4. The **escape rate is measured** and driven down, and seeded-defect drills measure the detection rate (§11).
- **"100% AI-automated" should mean** that AI executes 100% of QA activities, while humans stay *on* the loop, not *in* it, at 3 points:
  1. Prod deploy approval.
  2. Risk acceptance (waiving a failing gate).
  3. Changes to the agents themselves.
  Removing the human from prod approval is a governance decision, not an engineering one.
- **5x comes from lead time, not only from QA.** If dev, code review or deploy are the bottleneck, QA automation alone won't hit 5x. Baseline the numbers first (Phase 0) so the gain can be proven.

## 2. Core design principles

1. **LLM authors, tools judge.** Claude writes, maintains and analyses tests. Pass/fail comes from deterministic tools (Playwright, Semgrep, ZAP, k6 …) with fixed thresholds. An LLM opinion alone never blocks a release and never passes one.
2. **Tiered models.** This is the same cost policy used for this planning session:
   - **Haiku**: high-volume, low-complexity work (summarise logs, compress state, format reports).
   - **Sonnet**: the default workhorse (analyse, design, author, heal, triage).
   - **Opus**: verifier and judge only. It reviews what the other agents surface on high-risk items and writes the release verdict.
3. **System-1 / System-2 cascade.**
   - A fast, calibrated classifier (laya, or Jev later) answers typed questions when confidence ≥ τ.
   - Anything below τ escalates to Claude.
   - High-stakes answers escalate to Opus.
4. **Shift-left and shift-right.** QA starts when an Epic is created and continues after the prod deploy (synthetic monitoring feeds escaped defects back into regression tests).
5. **ADO is the system of record.** Findings go to work-item comments, test cases go to Test Plans, bugs are ADO Bugs, and gates are pipeline checks. There is no shadow DB in the early phases.
6. **Minimal first.** Azure Pipelines is the orchestrator. A custom Agent SDK service comes only if pipelines become the limit (Phase 4).
7. **The QA system is itself QA'd.** Agents have golden eval sets. A prompt or agent change is a PR that must pass evals.

## 3. Architecture overview

```
 ADO Boards (Epic/Feature/PBI/Task) ── Service Hooks ──┐
 ADO Repos (PR opened/updated) ── branch policy ────────┤
 Release pipeline (deploy dev/uat/prod) ── stages ──────┤
 Schedules (nightly, prod synthetic) / App Insights ────┤
                                                        ▼
        QA CONTROL PLANE = Azure Pipelines on self-hosted agent pool (Azure VM[s])
        ├── Claude Code headless (`claude -p`, JSON output, allowlisted tools, hooks)
        │     .claude/agents/*  →  Haiku | Sonnet | Opus (per agent)
        ├── Decision layer: DecisionProvider { laya-local | jev-hosted | claude-haiku }
        ├── Deterministic tools: Playwright(+axe, screenshots), Schemathesis, Pact,
        │     Semgrep, CodeQL/GHAzDO, Trivy, gitleaks, ZAP, k6 / Azure Load Testing,
        │     Lighthouse CI, Stryker, Azure Chaos Studio
        ├── MCP: Azure DevOps MCP (remote, domain-filtered), Playwright MCP (exploratory)
        └── Context: design.md, architecture docs/ADRs, OpenAPI specs, QA.md, ADO wiki
                                                        ▼
 OUTPUTS: work-item comments + tags/fields · Test Plans cases ("Tests/Tested By")
          · ADO Bugs w/ repro+trace · PR status checks · JUnit/SARIF published results
          · Environment gate verdicts · Evidence bundle per release · telemetry → App Insights
          · Teams digest (daily QA status)
```

**Claude access path:** the recommendation is **Claude in Microsoft Foundry**, in the company's own Azure tenant. It became GA around 2026-06, uses Entra ID auth and bills through Azure.
- Claude Code is configured with `CLAUDE_CODE_USE_FOUNDRY=1`, `ANTHROPIC_FOUNDRY_RESOURCE` and `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`.
- The fallback is the direct Anthropic API.
- *To verify:* current model list and region in Foundry (Opus 5.5 / Sonnet 5 / Haiku 4.5), and whether the Agent SDK supports Foundry env vars.

**Triggers:** ADO Service Hooks fire on work item created/updated/state change, PR created/updated, build completed.
- Phase 1–3: they call the pipeline's **Incoming WebHook** service connection, which triggers a pipeline through `resources.webhooks`. No custom server is needed.
- Phase 4, if volume demands it: Service Hook → Azure Function (must reply within 25s) → Service Bus → Agent SDK workers.

## 4. Lifecycle: where QA acts, what it does, what it gates

| # | Stage / trigger | Agents (model) | Tools | Output | Gate |
|---|---|---|---|---|---|
| S0 | Epic/Feature created or updated | `req-analyst` (Sonnet), `design-reviewer` (Sonnet → Opus verify if high risk) | ADO MCP, docs | Risk tier, NFR gaps across ISO 25010 dimensions, STRIDE threat model, test strategy → comment + tag `qa:risk-{low,med,high}` | Advisory |
| S1 | PBI → "Ready" / refinement | `req-analyst`, `test-designer` (Sonnet) | ADO MCP (work-items, test-plans) | AC gaps and ambiguity, Gherkin AC proposal, test cases linked "Tests/Tested By", sets `Custom.QAReadiness` | **DoR**: advisory until Phase 3. Then an ADO rule on a **dedicated child inherited process for the pilot project only** makes `QAReadiness` required on the transition to Committed. Process rules are org-level, so this needs a process admin. PO override through a "current user is member of group" rule condition (*verify*) |
| S2 | Sprint start | `qa-planner` (Sonnet) | ADO MCP (work, iterations) | Test effort and risk per PBI, regression scope, env/test-data needs | Advisory |
| S3 | PR opened (dev) | `test-author` (Sonnet), `security-analyst` (Sonnet → Opus on high/crit), laya risk score | unit tests, Stryker (changed files), Semgrep, CodeQL, gitleaks, Trivy, Pact | Missing-test report, generated tests as a follow-up PR, SARIF triage, AI review for testability | **Required build-validation policy** on the `qa-pr` pipeline. The pipeline *fails* on: a critical/high vuln, a secret, failing tests, a contract break, or mutation score < threshold on changed code. Failing the pipeline blocks the merge. Optional: a separate PR status per check through the Status API, for readability |
| S4 | Deploy → **DEV** | `failure-triager` (laya → Haiku/Sonnet) | Smoke, Schemathesis, impacted Playwright E2E, axe, visual diff, ZAP baseline (passive) | JUnit/SARIF published, auto-filed Bugs (deduped), flaky quarantine | Promote-to-UAT criteria met |
| S5 | Deploy → **UAT** | `ux-reviewer` (Sonnet vision), `perf-analyst` (Sonnet), `explorer` (Sonnet + Playwright MCP), **`release-judge` (Opus)** | Full regression, cross-browser, ZAP full active scan, k6 / Azure Load Testing vs SLO, Lighthouse, Chaos Studio experiments | Evidence bundle + Opus go/no-go report with reasons | **`qa_gate_uat` pipeline stage** must succeed, based on deterministic thresholds only. The Opus report is published as a pipeline artifact and on the summary tab. Business UAT sign-off is an ADO **Environment approval**. No custom check service is needed |
| S6 | Deploy → **PROD** | `release-judge` (Opus), `prod-sentinel` (Haiku + laya) | Read-only smoke, synthetic journeys, canary metrics, "Query Azure Monitor alerts" check | Post-deploy health verdict, auto-rollback trigger on SLO breach | **Human approval required** (pre-deploy); alert-based check (post-deploy) |
| S7 | Prod, continuous | `prod-sentinel` | App Insights availability/standard tests (Playwright synthetic), alerts | Alerts classified, incidents opened, **escaped defect → new regression test PR** | Incident process |
| S8 | Sprint end | `qa-reporter` (Haiku; Sonnet for insights) | ADO Analytics | QA metrics for the retro (§10) | — |

### 4.1 Cross-cutting execution concerns (added after red-team)

- **Runtime budgets. Without these, 5x fails.**
  - Targets: PR ≤ 15 min, dev stage ≤ 20 min, uat gate ≤ 60 min.
  - Achieved through:
    - Impact-based test selection: a risk tier plus a changed-files → tests map.
    - Playwright sharding, with cloud browsers from Azure App Testing / Playwright Workspaces if the VMs can't keep up (*verify*).
    - Heavy work (ZAP full active scan, load, chaos, full cross-browser) runs **nightly against the current uat release candidate**, not on every promotion. The uat gate reads the latest nightly evidence (maximum age 24h).
  - Phase 0 baselines today's regression wall-clock time.
- **Traceability that actually closes:**
  - `test-author` tags each automated test with its ADO test case ID, e.g. Playwright title/tag `@TC1234`.
  - The dev/uat stages publish results **against the test points** of the Test Plan. Options: an existing Playwright Azure DevOps reporter (*verify* package maturity), or the Test Runs REST API (create a run with `pointIds`, then update results).
  - `PublishTestResults@2` is also kept, for the pipeline Tests tab.
  - Result: a PBI → Test Case → Run outcome → Bug chain in ADO.
- **Test data and env parity:**
  - Each run creates namespaced data (`qa-<runId>-*`) through API factories and cleans it up afterwards. Agents write the *factories*, not the data.
  - PII-free synthetic data only.
  - Nightly **config drift check** across dev/uat/prod: app settings, feature flags, IaC.
  - Ephemeral PR environments only if the infra allows (Phase 4).
- **Flaky-test policy:**
  - Auto-retry once.
  - A test that fails then passes goes to quarantine: tagged, not gating, with a PBI auto-filed.
  - Quarantine SLA of 1 sprint.
  - Flaky rate is a tracked metric.
  - `test-healer` PRs can be reverted with one click and never auto-merge.
- **Agent pool capacity:** request **Managed DevOps Pools** or a **VM Scale Set agent pool**, so capacity is elastic rather than a few fixed VMs. Separate pools: `qa-pr` (fast), `qa-heavy` (nightly/load), `qa-prod` (isolated network and read-only identity).
- **ADO rate limits:**
  - Event-driven, no polling loops.
  - Cache work-item reads per run.
  - Honour `Retry-After` / TSTU throttling headers.
  - `/qa-today` is on demand, not scheduled.

**Prod safety rules. These are non-negotiable and enforced by env-scoped identities, not by prompts:**
- Prod identity is read-only in ADO and Azure.
- Prod tests use synthetic accounts flagged in telemetry.
- No active DAST, load or chaos tests in prod unless there is an explicit, scheduled, approved exception.
- No data mutation, except tagged self-cleaning synthetic data.
- Prod tests are rate-limited.

## 5. Quality-dimension coverage matrix (the "never overlook" backbone)

The ISO/IEC 25010 characteristics are the checklist. Each one has a design-time check (S0–S1) and a runtime check (S3–S7).

| Dimension | Design-time (Claude) | Runtime tool (verdict) | Earliest env |
|---|---|---|---|
| Functional suitability | AC completeness, Gherkin, test design techniques (BVA, equivalence, state, decision table) | Playwright, API tests, Schemathesis, Pact | PR/dev |
| Security | STRIDE threat model, authZ matrix review, data-flow review | Semgrep, CodeQL, gitleaks, Trivy, ZAP | PR |
| Performance efficiency | SLO/NFR extraction, capacity assumptions | k6 / Azure Load Testing thresholds, Lighthouse | uat |
| Scalability / reliability | Scaling and failure-mode review of architecture docs | Load ramp tests, Chaos Studio, retry/timeout tests | uat |
| Usability / UX | Heuristic review of design.md and Figma | Claude vision heuristic review (advisory), axe WCAG 2.2 | dev |
| UI consistency | Design-token and design-system conformance | Playwright `toHaveScreenshot` visual diff | dev |
| Compatibility | Browser/device matrix from analytics | Playwright projects (Chromium/Firefox/WebKit, mobile viewports) | uat |
| Maintainability / manageability | Observability, logging, config and feature-flag review | Lint/static rules, log and alert presence checks, Stryker | PR |
| Portability / deployability | IaC review | Trivy IaC, deploy smoke per env | dev |
| Test effectiveness (meta) | — | Stryker mutation score, seeded-defect drills | PR |

The UX review from Claude vision is **advisory only**, because it is subjective. It never blocks.

## 6. Agent catalogue (`.claude/agents/*.md`, one job each)

| Agent | Model | Reads | Writes (tools allowlisted) |
|---|---|---|---|
| `req-analyst` | Sonnet | Epic/PBI, AC, design.md, arch docs | WI comment, tags, QAReadiness field |
| `design-reviewer` | Sonnet (Opus verify high-risk) | design.md, ADRs, OpenAPI | WI comment, threat-model page (wiki) |
| `test-designer` | Sonnet | PBI + AC | Test Plans cases + links |
| `test-author` | Sonnet | code diff, test cases | PR to test code only |
| `test-healer` | Sonnet | failing run trace | PR limited to locators and waits. **Diff guard: any change to an assertion → Opus plus a human review.** |
| `failure-triager` | laya → Haiku → Sonnet | JUnit, traces, logs | ADO Bug (deduped), quarantine tag |
| `security-analyst` | Sonnet (Opus verify high/crit) | SARIF | triage comments, suppressions via PR with justification |
| `perf-analyst` | Sonnet | k6/ALT results, baseline | report + verdict input |
| `ux-reviewer` | Sonnet (vision) | screenshots per viewport, design.md | advisory findings |
| `explorer` | Sonnet + Playwright MCP | running uat app | exploratory findings → Bugs (Sonnet-verified) |
| `release-judge` | **Opus** | evidence bundle | go/no-go report |
| `prod-sentinel` | Haiku + laya | alerts, synthetic results | incidents, escaped-defect PBIs |
| `qa-planner` / `qa-reporter` | Sonnet / Haiku | sprint data | plans, metrics, Teams digest |

**Personal copilot mode ("see my tasks"):** the QA engineer runs Claude Code interactively with the ADO MCP. A `/qa-today` skill runs a WIQL query for `@Me` and shows:
- assigned tasks
- PBIs awaiting QA
- failing runs
- agent findings waiting for human review
- the gates it is blocking

## 7. Laya and Jev: verified findings and placement

**Facts (verified by Opus):**
- **Jev** (TypeSafe AI, launched 2026-09-15 with a $40M seed; covered by The Register and others) is a hosted, proprietary "System One" model.
  - It does not generate text.
  - It takes a state plus typed questions and returns calibrated probabilities for each answer.
  - Answer types: `choice` (one of N options), `score` (a level on a rubric), `noul` (yes/no).
  - Vendor claim, not independently verified: 40–400x cheaper than frontier LLMs.
- **laya** (receptron, created 2026-09-19, **v0.1.1**, 2 contributors, MIT license, weights Apache 2.0) is an **open-source, local, Jev-compatible** model.
  - It runs as a Node 20 / ONNX Runtime wrapper around a ModernBERT classifier from Convai Innovations.
  - Needs about 2 GB RAM and a 1.7 GB download of weights.
  - Limits: state is cut to **512 tokens**; answer options must fit in 192 tokens.
  - No Claude or MCP integration.
  - It is not related to receptron's GraphAI.
- Note: fake-looking "awesome-jev" repos are spreading. Install only from official sources.

**Verdict:** these are useful as a **cost and latency optimiser for high-volume typed decisions**. They are not core, and they are never the only authority for a gate.

| Use | Question type | Why a System-1 model fits |
|---|---|---|
| Test-failure triage | `choice`: product-bug / test-bug / env / flaky / data | Thousands of failures per day at scale |
| Failure dedup | `choice` among known-defect clusters | Repeated decisions over the same state |
| PBI/PR risk tier → test depth | `score` 1–5 | Picks smoke, impacted or full regression |
| DoR quick checks | `noul`: "AC present?", "NFR stated?" | Cheap first pass before Sonnet |
| Prod alert/log classification | `choice` severity/category | Highest volume, latency-sensitive |

**How it is wired:**
- A `DecisionProvider` interface with three implementations: `laya-local` (default, data stays on the VM) | `jev-hosted` (needs security and procurement review, because data leaves the tenant for a vendor that launched 9 days ago) | `claude-haiku` (fallback).
- Laya's 512-token limit is handled with deterministic feature extraction: test name, error type, top stack frames, changed files. Haiku summarises only when that is not enough.
- Rule: if p ≥ τ, act; otherwise escalate. τ is tuned per question on a labelled set.

**Adoption:**
- Starts in Phase 3, in **shadow mode**: laya answers, Claude decides, and the agreement rate is logged.
- Promote a question only if its measured accuracy ≥ target for 2 sprints.
- Keep it off the Phase 1–2 critical path, given v0.1 maturity.

## 8. Guardrails for the AI itself

- **Identity and least privilege:**
  - One identity per environment (Entra workload identity / managed identity) and one ADO scope per agent role.
  - The ADO MCP runs remote with `-d` domain filtering, exposing only the domains each pipeline needs.
  - Secrets stay in **Key Vault** and are fetched by variable groups. They never enter the prompt context.
- **Claude Code hardening:**
  - `settings.json` permission allowlists and `--allowedTools` per agent.
  - `PreToolUse` hooks block destructive commands and prod-mutating calls.
  - Model versions are pinned.
  - Agent outputs must match a JSON schema (`schemas/`). Invalid output fails the step; nothing is silently passed.
- **Prompt injection:** work items, PR text, logs and the app under test are *untrusted input*.
  - Agents that read them get no write access to prod and no secrets.
  - Writes go through narrow, schema-validated actions.
  - The highest-risk paths get extra controls:
    - `explorer` runs in a sandboxed browser, with no ADO write tools. A separate Sonnet pass verifies its findings before any Bug is filed.
    - Every **security suppression PR, and every change to a test assertion, needs human sign-off**, because schema validation cannot catch a plausible injected justification.
- **PII:** prod logs and traces are masked before any LLM call. Laya is local, so it adds no data egress.
- **Cost, with hard ceilings:**
  - `--max-turns` and a token budget for each agent step.
  - Foundry deployment TPM quotas per model, so Opus has a low quota.
  - Azure budget alerts at 50/80/100%.
  - Opus runs **only** on high-risk-tier items and release candidates, never on every PR.
  - Prompt caching for the stable context (CLAUDE.md, skills, docs).
  - laya and Haiku for volume.
  - Cost per PBI on a dashboard.
- **Kill switch:** a pipeline variable `QA_AI_GATES=off` falls back to deterministic-only gates.
- **Audit:** each run logs agent, model, prompt hash, tools used, tokens, cost and verdict to App Insights / Log Analytics.

## 9. Repository layout

New repo in Azure Repos: `qa-platform`. App repos consume it through `resources.repositories` and pipeline `extends` templates.

```
qa-platform/
  CLAUDE.md                       # platform rules, gate policy, prod safety rules
  .claude/agents/*.md             # §6 agents, `model:` set per agent
  .claude/skills/                 # iso25010-checklist, stride-threat-model, gherkin-ac,
                                  # triage-rubric, test-design-techniques, qa-today
  .claude/settings.json           # allowlists + hooks
  .mcp.json                       # ADO MCP (remote, filtered), Playwright MCP
  pipelines/templates/            # qa-pr.yml, qa-stage-dev.yml, qa-stage-uat.yml,
                                  # qa-stage-prod.yml, qa-workitem.yml
  pipelines/                      # workitem-events.yml (webhook), nightly.yml, prod-synthetic.yml
  schemas/                        # finding, verdict, triage, test-case JSON schemas
  decision/                       # DecisionProvider: laya | jev | claude-haiku
  evals/                          # golden sets per agent + runner (gates agent PRs)
  tool-config/                    # zap-automation.yaml, k6 thresholds, semgrep rules,
                                  # lighthouse budgets, stryker config
  docs/adr/                       # decisions log
app-repo/
  QA.md                           # domain rules, test-data rules, env URLs (no secrets)
  tests/{e2e,api,perf,contract}/  # test code co-located with the app for PR gating
  azure-pipelines.yml             # extends qa-platform templates
```

## 10. Metrics (these prove or disprove 5x)

- **DORA:** lead time for changes, deployment frequency, change failure rate, time to restore.
- **QA flow:** PBI "Done-dev → Tested" wait time, regression wall-clock time, % of AC with a linked automated test (traceability coverage).
- **Quality:** escaped defects per sprint, seeded-defect detection rate, mutation score, flaky-test rate.
- **Agent quality:** finding precision (share accepted by humans), triage accuracy, false-block rate, cost per PBI.

## 11. Roadmap

Week counts are rough and depend on access and team size.

**MVP cut line for the manager pitch.** Commit to Phases 0–2 on **one pilot team** and prove the §10 metrics before promising anything further.
- Phase 3+ items are listed as the direction, not as commitments: laya/Jev, Chaos Studio, the blocking DoR rule, and the Agent SDK service.
- Of the 13 agents, the MVP uses 5: `req-analyst`, `test-designer`, `test-author`, `failure-triager`, `release-judge`.
- **Ownership:** the QA engineer owns the platform, with one named backup. The platform needs a runbook and a sensible on-call for pipeline breakage. Every AI gate has the kill switch (§8).

- **Phase 0: now, no VM needed**
  - Access checklist: ADO org/project permissions, process-admin for the DoR rule, repos, service connections, self-hosted agent pool, Foundry/Claude access, Key Vault, App Insights.
  - Confirm assumptions (§12) and pick **one pilot team and app**.
  - Baseline the §10 metrics.
  - Write ADRs.
  - Draft agents, skills and eval sets on sanitised sample PBIs, following company data policy.
- **Phase 1 (≈wk 1–4), foundation**
  - VM agent pool and Claude via Foundry.
  - `qa-platform` repo and the ADO MCP.
  - PR gates with deterministic tools (Semgrep, gitleaks, Trivy, unit tests) plus Claude SARIF triage.
  - `req-analyst` on PBIs in **advisory** mode.
  - Audit logging.
- **Phase 2 (≈wk 5–10), test design and dev/uat**
  - `test-designer` → Test Plans.
  - Playwright suite for the pilot app (Playwright Test Agents: planner/generator/healer).
  - Dev and uat stages: smoke, regression, axe, visual, ZAP, k6.
  - `failure-triager` with auto-filed Bugs.
  - `release-judge` producing an advisory report.
- **Phase 3 (≈wk 11–16), prod and hardening**
  - Post-deploy prod smoke, synthetic monitors, alert check.
  - Escaped-defect loop.
  - Eval harness gating agent changes.
  - UAT gate becomes **blocking**, and the DoR rule is switched on.
  - laya in shadow mode.
  - Chaos experiments in uat.
- **Phase 4, scale**
  - Roll out to more teams.
  - Promote laya questions that pass evals.
  - Move event handling to Agent SDK + Service Bus only if the pipeline triggers become a limit.
  - Seeded-defect drills (inject known bugs and measure the detection rate) every quarter.

## 12. Assumptions to confirm

1. Boards are **Azure DevOps** with the Scrum process, not Jira.
2. Source control is Azure Repos, not GitHub. This affects whether GHAzDO or CodeQL is available.
3. The app is web plus APIs; the tech stack is unknown. Mobile or desktop would change the tool choices.
4. Company policy allows LLM processing of code and work items (Foundry in-tenant makes this easier) and allows a local ONNX model on the VMs.
5. There is some prod monitoring already (App Insights?) and a release pipeline with ADO Environments.
6. Where `design.md` and the architecture docs live: repo, ADO wiki, Confluence or SharePoint.

## 13. Verification of this plan (before building)

- A red-team review of this plan by a Sonnet subagent, verified by Opus (§14).
- A Phase 0 spike on the pilot, run end-to-end on a single PBI:
  1. The service hook fires and the pipeline runs.
  2. `req-analyst` posts a comment.
  3. `test-designer` creates linked test cases.
  4. A PR check runs Semgrep and the tests.
  5. The dev stage runs Playwright and publishes JUnit.
  6. A seeded bug causes a Bug to be filed automatically.
- Success criteria: every artifact is visible in ADO and traceable (Epic → Test → Run → Bug); cost per PBI is recorded; no human steps except approvals.

**Sources:**
- github.com/receptron/laya
- typesafe.ai/blog/introducing-system-one-models-and-jev
- theregister.com (2026-09-16, TypeSafe AI)
- github.com/microsoft/azure-devops-mcp
- learn.microsoft.com (Foundry Claude Code config; Service Hooks events; Environments approvals/checks; Test Plans REST)
- playwright.dev (MCP, test agents)
- Official docs for Schemathesis, Semgrep, ZAP, Trivy, gitleaks, k6, Azure Load Testing, axe-core, Lighthouse CI, Stryker, Chaos Studio and App Insights synthetic tests.

## 14. Red-team review notes (Sonnet surfaced, Opus adjudicated)

| # | Finding | Verdict | Applied in |
|---|---|---|---|
| 1 | DoR rule is org-level; "PO override" was hand-wavy | Accepted. Dedicated child process, group-based condition (*verify*), advisory until Phase 3 | §4 S1 |
| 2 | No native Environment check type for "Opus report attached" | Accepted. `qa_gate_uat` stage + artifact; Environment used only for human approval and alert checks | §4 S5 |
| 3 | Test cases are never associated with automated runs | Accepted. `@TC` tags + results published against test points | §4.1 |
| 4 | Branch policy may not block | Partly wrong. A required build-validation policy blocks when the pipeline fails. Wording clarified | §4 S3 |
| 5 | Regression runtime vs the 5x goal | Accepted. Runtime budgets, impact selection, nightly heavy suite | §4.1 |
| 6 | Test data / env parity | Accepted | §4.1 |
| 7 | Agent pool capacity | Accepted. Managed DevOps Pools / VMSS, 3 pools | §4.1 |
| 8 | ADO rate limits | Accepted | §4.1 |
| 9 | No hard Opus cost ceiling | Accepted | §8 |
| 10 | Injection via explorer / suppressions | Accepted. Human sign-off on suppressions and assertion changes | §8 |
| 11 | Over-scoped for one hire | Accepted. MVP cut line (5 agents, Phases 0–2) | §11 |
| 12 | Foundry model availability | Already marked *verify*. Current Claude family is Opus 5.5 / Sonnet 5 / Haiku 4.5; confirm they are deployable in the tenant's region | §3 |
