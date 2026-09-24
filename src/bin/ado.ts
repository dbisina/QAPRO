// Deterministic Azure DevOps actions used by the pipelines.
//
//   tsx src/bin/ado.ts fetch-workitem     --id 123 --out out/work-item.json
//   tsx src/bin/ado.ts publish-analysis   --in out/req-analysis.json [--apply]
//   tsx src/bin/ado.ts publish-test-cases --in out/test-cases.json [--plan 1 --suite 2] [--apply]
//
// Writes are DRY-RUN unless --apply is passed or QA_PUBLISH=apply is set: roll out read-only first.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import {
  addComment,
  addTestCasesToSuite,
  adoConfigFromEnv,
  buildTagsPatch,
  buildTestCasePatch,
  createWorkItem,
  getWorkItem,
  getWorkItems,
  linkedIds,
  parentId,
  selectNewTestCases,
  toAgentContext,
  updateWorkItem,
} from '../ado.js';
import { renderReqAnalysisComment } from '../render.js';
import type { ReqAnalysis, TestCaseSet } from '../types.js';
import { loadSchema, validate } from '../validate.js';

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    id: { type: 'string' },
    in: { type: 'string' },
    out: { type: 'string' },
    plan: { type: 'string' },
    suite: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'parent-depth': { type: 'string', default: '3' },
  },
});
const apply = values.apply || process.env['QA_PUBLISH'] === 'apply';

function readValidated<T>(path: string | undefined, schemaPath: string): T {
  if (!path) throw new Error('--in is required');
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = validate(loadSchema(schemaPath), data);
  if (!result.valid) throw new Error(`${path} does not match ${schemaPath}: ${result.errors.join('; ')}`);
  return data as T;
}

function setPipelineVariable(name: string, value: string): void {
  console.log(`##vso[task.setvariable variable=${name}]${value}`);
}

async function fetchWorkItem(): Promise<void> {
  const id = Number.parseInt(values.id ?? '', 10);
  if (Number.isNaN(id) || !values.out) throw new Error('fetch-workitem needs --id and --out');
  const cfg = adoConfigFromEnv();
  const item = await getWorkItem(cfg, id);
  const context = toAgentContext(item);

  // Epic -> Feature -> PBI chain gives the agent the "why" behind a PBI.
  const parents: Record<string, unknown>[] = [];
  let next = parentId(item);
  for (let depth = 0; next !== undefined && depth < Number.parseInt(values['parent-depth'], 10); depth += 1) {
    const parent = await getWorkItem(cfg, next);
    parents.push(toAgentContext(parent));
    next = parentId(parent);
  }
  context['parents'] = parents;

  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(context, null, 2)}\n`);
  console.log(`Fetched work item ${id} (${String(context['type'])}: ${String(context['title'])}) with ${parents.length} parent(s)`);
}

async function publishAnalysis(): Promise<void> {
  const analysis = readValidated<ReqAnalysis>(values.in, 'schemas/req-analysis.schema.json');
  setPipelineVariable('QA_READINESS', analysis.readiness);
  setPipelineVariable('QA_RISK_TIER', analysis.riskTier);

  const comment = renderReqAnalysisComment(analysis);
  const tags = [`qa:risk-${analysis.riskTier}`, `qa:${analysis.readiness}`];
  if (!apply) {
    console.log(`[dry-run] would comment on #${analysis.workItemId} and set tags ${tags.join(', ')}:\n\n${comment}`);
    return;
  }
  const cfg = adoConfigFromEnv();
  const item = await getWorkItem(cfg, analysis.workItemId);
  await addComment(cfg, analysis.workItemId, comment);
  const current = typeof item.fields['System.Tags'] === 'string' ? item.fields['System.Tags'] : undefined;
  await updateWorkItem(cfg, analysis.workItemId, buildTagsPatch(current, tags, ['qa:risk-', 'qa:ready', 'qa:needs-clarification', 'qa:blocked']));
  console.log(`Published analysis to #${analysis.workItemId} (tags: ${tags.join(', ')})`);
}

async function publishTestCases(): Promise<void> {
  const set = readValidated<TestCaseSet>(values.in, 'schemas/test-cases.schema.json');
  const cfg = apply ? adoConfigFromEnv() : undefined;

  let existingTitles: string[] = [];
  let requirementUrl = `(work item ${set.workItemId})`;
  if (cfg) {
    const requirement = await getWorkItem(cfg, set.workItemId);
    requirementUrl = requirement.url;
    const linked = await getWorkItems(cfg, linkedIds(requirement, 'Microsoft.VSTS.Common.TestedBy-Forward'), ['System.Title']);
    existingTitles = linked.map((item) => String(item.fields['System.Title'] ?? ''));
  }
  const drafts = selectNewTestCases(set.testCases, existingTitles);
  console.log(`${set.testCases.length} proposed, ${drafts.length} new (existing linked: ${existingTitles.length})`);

  if (!cfg) {
    for (const draft of drafts) console.log(`[dry-run] would create Test Case "${draft.title}" (P${draft.priority}, ${draft.steps.length} steps) testing #${set.workItemId}`);
    return;
  }
  const created: number[] = [];
  for (const draft of drafts) {
    const testCase = await createWorkItem(cfg, 'Test Case', buildTestCasePatch(draft, requirementUrl));
    created.push(testCase.id);
    console.log(`Created Test Case #${testCase.id}: ${draft.title}`);
  }
  // Requirement-based suites pick up "Tested By" links automatically; static suites need an explicit add.
  if (values.plan && values.suite && created.length > 0) {
    await addTestCasesToSuite(cfg, Number.parseInt(values.plan, 10), Number.parseInt(values.suite, 10), created);
    console.log(`Added ${created.length} test case(s) to plan ${values.plan} / suite ${values.suite}`);
  }
}

const commands: Record<string, () => Promise<void>> = {
  'fetch-workitem': fetchWorkItem,
  'publish-analysis': publishAnalysis,
  'publish-test-cases': publishTestCases,
};

const run = command === undefined ? undefined : commands[command];
if (!run) {
  console.error(`usage: ado.ts <${Object.keys(commands).join(' | ')}> [options]`);
  process.exit(1);
}
run().catch((error: unknown) => {
  console.error(`ado: ${(error as Error).message}`);
  process.exit(1);
});
