# ADR-0001: Azure Pipelines is the QA control plane

- Status: Accepted (2026-09-24)

## Context
QA must react to work-item events (Epic/PBI created, state changes), PRs and deployments to dev/uat/prod. We could build a custom orchestrator service (Agent SDK + Service Bus) or use what the company already runs.

## Decision
Use Azure Pipelines on a self-hosted agent pool as the orchestrator:
- Work-item events: Service Hook → Incoming WebHook service connection → `pipelines/workitem-events.yml`.
- PRs: a required build-validation policy runs `pipelines/templates/qa-pr.yml`.
- Deployments: `pipelines/templates/qa-verify.yml` runs after each environment's deploy stage. ADO Environments provide approvals and checks.

Claude runs headless inside pipeline steps (`src/bin/run-agent.ts`).

## Consequences
- No new service to host, secure or monitor. We get audit, retries, logs, approvals and test reporting from ADO for free.
- Service Hooks need a reply within 25s; the webhook trigger satisfies that.
- If event volume or latency outgrows pipelines, move event handling to Service Bus + Agent SDK workers (Phase 4). The agent files, schemas and gate stay the same.
