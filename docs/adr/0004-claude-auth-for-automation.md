# ADR-0004: How pipelines authenticate to Claude

- Status: Proposed — confirm with the Anthropic/Microsoft admin (2026-09-24)

## Context
The company provides **Claude Team/Enterprise seats**. Seats cover people using Claude Code interactively: the QA engineer's copilot mode, `/qa-today`, authoring agents and tests. Unattended pipelines are different: they run as a service, not as a person.

## Options
| Option | How | Pros | Cons |
|---|---|---|---|
| A. Claude Console API key (org workspace) | `ANTHROPIC_API_KEY` as a secret in the variable group (from Key Vault) | Built for automation; spend limits and usage per workspace; not tied to a person | Separate usage billing to approve |
| B. Claude in Microsoft Foundry | `CLAUDE_CODE_USE_FOUNDRY=1`, `ANTHROPIC_FOUNDRY_RESOURCE`, Entra ID or `ANTHROPIC_FOUNDRY_API_KEY` | Stays in the Azure tenant; Azure billing and quotas; easiest data-policy approval | Check model and region availability |
| C. Seat OAuth token (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`) | Token from one person's seat | No new contract | Ties the automation to one person's seat and limits; breaks when they leave; **confirm it is permitted for shared, unattended CI before use** |

## Decision
Prefer **B (Foundry)** if the company has Azure AI Foundry, otherwise **A**. Use **C** only for a short, personal Phase 0 spike, if the admin confirms it is allowed.

`pipelines/templates/run-agent.yml` passes all three sets of variables. Whichever is defined in the variable group is used, and undefined ones are dropped by `sanitizeEnv`. Switching options needs no code change.
