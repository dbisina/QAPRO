---
name: qa-today
description: Personal QA briefing for the QA engineer in an interactive Claude Code session. Uses the Azure DevOps MCP to show my assigned tasks, PBIs awaiting QA, failing runs and AI findings waiting for human review.
---

# /qa-today — QA engineer's daily brief

Run on demand only (not on a schedule) to stay inside Azure DevOps rate limits. Uses the `azure-devops` MCP server from `.mcp.json`. The server needs `ADO_ORG` set and `az login` done first.

## Steps
1. **My open work.** Run WIQL:
   ```sql
   SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State]
   FROM WorkItems
   WHERE [System.AssignedTo] = @Me AND [System.State] NOT IN ('Done', 'Removed', 'Closed')
   ORDER BY [Microsoft.VSTS.Common.Priority]
   ```
2. **Sprint PBIs needing QA attention** (current iteration of my team):
   ```sql
   SELECT [System.Id], [System.Title], [System.State], [System.Tags]
   FROM WorkItems
   WHERE [System.WorkItemType] = 'Product Backlog Item'
     AND [System.IterationPath] = @CurrentIteration
     AND ([System.Tags] CONTAINS 'qa:needs-clarification' OR [System.Tags] CONTAINS 'qa:blocked' OR [System.Tags] CONTAINS 'qa:risk-high')
   ```
3. **AI output waiting for human review**: bugs and test cases tagged `qa-ai-generated` created in the last 24 hours, and open PRs from `test-author` or `test-healer` branches.
4. **Pipeline health**: the latest runs of the qa-pr and release pipelines. List failed QA gates with their first blocking reason.
5. **Brief**: at most 15 lines. Put blockers first, then decisions that need me, then FYI. Every line links to its work item, PR or run.
