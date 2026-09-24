# HANDOFF — continue on the Azure VM

Written 2026-09-24 at the end of the planning and scaffolding session on the QA engineer's laptop. The full conversation is in `docs/conversation-log.md`. Claude on the VM: read this file, then `CLAUDE.md`, then `docs/architecture.md` §4 and §11.

## 1. Where things stand

**Built and verified locally (Windows, Node 25):**
- 6 agents, 6 skills, 6 output schemas, guard hook, gate, ADO client, pipeline templates, examples, ADRs.
- `npm run check`: typecheck clean, 75 tests passing.
- Gate CLI smoke-tested: fails on a failed test and on a leaked secret; passes on clean evidence.
- **Live agent run:** `req-analyst` via `claude -p` on `evals/req-analyst/case-001` produced valid JSON and matched every expectation in the case (ADR-0003).
- Guard hook verified live: it blocked an `rm -rf` in the authoring session itself.

**Written but NOT yet run against real Azure DevOps (verify in the Phase 0 spike):**
- `src/bin/ado.ts`: fetch, comment (markdown format needs Comments API `7.1-preview.4`), tags, Test Case creation with the `Tests` link, suite add.
- All pipeline YAML: webhook trigger payload paths, multi-repo checkout into `context/app`, `UseNode@1` on a self-hosted pool, docker-based scanners.
- ZAP automation plan (`tool-config/zap-baseline.yaml`), Schemathesis CLI flags in the examples.

## 2. Open decisions (ask the user; do not assume)

| # | Question | Default until answered |
|---|---|---|
| 1 | Boards and repos: Azure DevOps, GitHub or Jira? | Azure DevOps Boards + Azure Repos (ADR-0005) |
| 2 | Claude auth for pipelines: Foundry, Console API key, or seat token? The user has Team/Enterprise seats. | Foundry if available, else API key (ADR-0004) |
| 3 | Pilot app and its surfaces: web / API / mobile / desktop. The user said all four exist. | Pilot with web + API first (ADR-0006) |
| 4 | Where `design.md` and the architecture docs live | In the app repo → checked out to `context/app` |
| 5 | Existing monitoring (App Insights?) and release pipeline with ADO Environments? | Assume yes; confirm |
| 6 | Company policy on sending code and work items to an LLM | Must be confirmed before any real data flows |

## 3. VM setup (once access is granted)

```bash
git clone <this repo> qa-platform && cd qa-platform
node --version            # need >= 22; install the LTS if older
npm ci && npm run check   # must be green before anything else
npm install -g @anthropic-ai/claude-code && claude --version
az --version && az login  # for the Azure DevOps MCP (--authentication azcli)
docker --version          # Semgrep / gitleaks / Trivy / ZAP run as containers
```
Interactive use on the VM: `export ADO_ORG=<org>`, open `claude` in this folder, then try `/qa-today` (uses `.mcp.json` → Azure DevOps MCP).

## 4. Azure DevOps setup checklist (needs project/org admin rights; list them for the user)

1. **Agent pools**: `qa-pr` (fast), `qa-heavy` (nightly/load), `qa-prod` (isolated, read-only identity). Prefer Managed DevOps Pools or VM Scale Set agents. Install Docker and Node on the agents.
2. **Variable group `qa-platform`** (Key Vault-linked for secrets):
   - Claude auth: one option from ADR-0004 (`ANTHROPIC_API_KEY`, or `CLAUDE_CODE_USE_FOUNDRY=1` + `ANTHROPIC_FOUNDRY_RESOURCE` [+ `ANTHROPIC_FOUNDRY_API_KEY`], or `CLAUDE_CODE_OAUTH_TOKEN`).
   - `CLAUDE_CODE_VERSION` (pin after the first green run).
   - `ANTHROPIC_DEFAULT_{HAIKU,SONNET,OPUS}_MODEL` (pin exact model ids).
   - `QA_PUBLISH` = `dryrun` at first, `apply` once the comments look right.
   - `QA_AI_GATES` = `on` (the kill switch is `off`).
3. **Incoming WebHook service connection** named `qa-workitem-hook`. Then create the pipeline from `pipelines/workitem-events.yml`.
4. **Service Hooks** (Project settings → Service hooks → Web Hooks), pointing at the Incoming WebHook URL `https://dev.azure.com/<org>/_apis/public/distributedtask/webhooks/qa-workitem-hook?api-version=6.0-preview` (*verify the URL format*):
   - "Work item created", filtered to Epic / Feature / Product Backlog Item.
   - "Work item updated", with the **field filter = State**. Without this filter our own comments and tags re-trigger the pipeline.
5. **Build service permissions**: the project build service identity needs "Edit work items in this node" on the pilot area path and Test Plans edit rights. Also enable the pipeline's access to `System.AccessToken`.
6. **App repo**: add `pipelines/examples/app-pr.yml` as a pipeline, then a **required build-validation branch policy** on `main`.
7. **Environments** `dev`, `uat`, `prod`:
   - `uat`: approval (business sign-off).
   - `prod`: approval plus a "Query Azure Monitor alerts" check.

## 5. Phase 0 spike (end to end on ONE PBI)

1. Create or pick a test PBI in the pilot area → the service hook fires → `workitem-events` runs.
2. `req-analyst` output appears as a pipeline artifact. With `QA_PUBLISH=apply`, a comment and `qa:*` tags appear on the PBI.
3. Move the PBI to Approved with readiness `ready` → `test-designer` → Test Cases linked "Tested By" on the PBI.
4. Open a PR in the pilot app → `qa-pr` runs the tests + Semgrep + gitleaks + Trivy → the gate blocks on a seeded failing test.
5. Deploy to dev → `qa-verify` stage=dev → JUnit published → `failure-triager` explains the seeded failure.

**Success criteria:**
- Every artifact is visible in ADO and traceable: PBI → Test Case → Run → Bug.
- Cost per run is recorded (`*.audit.json`).
- No human steps except approvals.

## 6. Known gaps / verify list
- [ ] Webhook payload paths (`resource.workItemId`, `resource.fields['System.State'].newValue`) against a real event.
- [ ] Comments API markdown `format=markdown` on the org's API version; fall back to HTML if rejected.
- [ ] Nightly evidence freshness: downloaded artifacts get a fresh mtime, so have the nightly write a `generated-at` manifest and make the gate read it.
- [ ] Publish results **against Test Plan test points** (`@TC<id>` tags → Test Runs API). Not implemented yet (architecture §4.1).
- [ ] Auto-filing ADO Bugs from `failure-triage.json` (dedup by title and the `qa-ai-generated` tag). Not implemented yet.
- [ ] Escalation re-run (Haiku → Sonnet) when triage confidence < 0.7. Currently manual via the `model` parameter.
- [ ] Eval runner script (`evals/`); Phase 3 makes it a required check.
- [ ] Mobile and desktop tooling per ADR-0006, once the pilot's surfaces are known.

## 7. Suggested next tasks (in order)
1. Resolve the §2 decisions with the user.
2. §3 VM setup → `npm run check` green on the VM.
3. §4 ADO setup (produce an admin request list for the user).
4. §5 spike; fix whatever the real payloads and APIs disagree with.
5. Implement the test-point result publishing and Bug auto-filing gaps (with unit tests, same style as `tests/ado.test.ts`).
