# ADR-0005: Work tracker behind a thin adapter (Azure DevOps first)

- Status: Accepted with open question (2026-09-24)

## Context
The team uses Epics, PBIs and backlogs, and the VMs are on Azure, which strongly suggests Azure DevOps Boards. As of 2026-09-24 it is **not confirmed** whether boards and repos are Azure DevOps, GitHub or Jira.

## Decision
- Agents are tracker-neutral. They receive a compact JSON view of the work item (`toAgentContext`) and return schema JSON. They never call the tracker themselves in pipelines.
- All tracker I/O lives in `src/ado.ts` and `src/bin/ado.ts`: fetch the item and its parents, comment, set tags, create test cases, add them to a suite.
- Interactive use (`/qa-today`) goes through an MCP server declared in `.mcp.json` (Azure DevOps MCP by default).

## If it turns out to be Jira or GitHub
- Add `src/jira.ts` (or `src/github.ts`) with the same functions and a `QA_TRACKER` switch in `src/bin/ado.ts` (rename it to `tracker.ts`).
- Swap the MCP server in `.mcp.json` (Atlassian MCP or GitHub MCP).
- GitHub repos: use `anthropics/claude-code-action` and GitHub Actions for PR gates. `src/gate.ts` and `schemas/` are reused unchanged.
