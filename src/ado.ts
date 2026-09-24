import { isSet } from './env.js';
import type { TestCaseDraft, TestStep } from './types.js';

// Thin Azure DevOps REST client. Agents never write to ADO directly in pipelines:
// they emit schema-validated JSON and this deterministic code performs the narrow writes.

export interface AdoConfig {
  orgUrl: string;
  project: string;
  authorization: string;
}

export interface JsonPatchOp {
  op: 'add' | 'replace' | 'remove' | 'test';
  path: string;
  value?: unknown;
}

export interface WorkItem {
  id: number;
  url: string;
  fields: Record<string, unknown>;
  relations?: { rel: string; url: string; attributes?: Record<string, unknown> }[];
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function adoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AdoConfig {
  const orgUrl = (env['ADO_ORG_URL'] ?? env['SYSTEM_COLLECTIONURI'] ?? '').replace(/\/+$/, '');
  const project = env['ADO_PROJECT'] ?? env['SYSTEM_TEAMPROJECT'] ?? '';
  if (!isSet(orgUrl) || !isSet(project)) {
    throw new Error('Set ADO_ORG_URL and ADO_PROJECT (both are predefined when running inside Azure Pipelines)');
  }
  const bearer = env['SYSTEM_ACCESSTOKEN'];
  const pat = env['ADO_PAT'];
  let authorization: string;
  if (isSet(bearer)) authorization = `Bearer ${bearer}`;
  else if (isSet(pat)) authorization = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
  else throw new Error('Set SYSTEM_ACCESSTOKEN (pipeline) or ADO_PAT (local run)');
  return { orgUrl, project, authorization };
}

function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter === null ? Number.NaN : Number.parseFloat(retryAfter);
  return Number.isNaN(seconds) ? 1000 * 2 ** attempt : Math.min(seconds, 60) * 1000;
}

/** Calls `{org}/{project}/_apis/{path}`; honours Retry-After on 429/503 (ADO throttling). */
export async function adoRequest<T>(
  cfg: AdoConfig,
  path: string,
  init: { method?: string; body?: unknown; contentType?: string } = {},
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const url = `${cfg.orgUrl}/${encodeURIComponent(cfg.project)}/_apis/${path}`;
  const method = init.method ?? 'GET';
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: cfg.authorization,
        Accept: 'application/json',
        'Content-Type': init.contentType ?? 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if ((response.status === 429 || response.status === 503) && attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response.headers.get('Retry-After'), attempt)));
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ADO ${method} ${path} failed with ${response.status}: ${text.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }
}

// ---------- reads ----------

export function getWorkItem(cfg: AdoConfig, id: number, fetchImpl?: FetchLike): Promise<WorkItem> {
  return adoRequest<WorkItem>(cfg, `wit/workitems/${id}?$expand=relations&api-version=7.1`, {}, fetchImpl);
}

export async function getWorkItems(cfg: AdoConfig, ids: number[], fields: string[], fetchImpl?: FetchLike): Promise<WorkItem[]> {
  if (ids.length === 0) return [];
  const query = `ids=${ids.join(',')}&fields=${fields.map(encodeURIComponent).join(',')}&api-version=7.1`;
  const page = await adoRequest<{ value: WorkItem[] }>(cfg, `wit/workitems?${query}`, {}, fetchImpl);
  return page.value;
}

/** Plain text from ADO rich-text (HTML) fields: fewer tokens for the agents, same content. */
export function htmlToText(html: string): string {
  return html
    .replaceAll(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replaceAll(/<li[^>]*>/gi, '- ')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();
}

const CONTEXT_FIELDS: Record<string, string> = {
  'System.WorkItemType': 'type',
  'System.Title': 'title',
  'System.State': 'state',
  'System.AreaPath': 'areaPath',
  'System.IterationPath': 'iterationPath',
  'System.Tags': 'tags',
  'Microsoft.VSTS.Common.Priority': 'priority',
  'System.Description': 'description',
  'Microsoft.VSTS.Common.AcceptanceCriteria': 'acceptanceCriteria',
};

/** The compact view of a work item that agents receive as input. */
export function toAgentContext(item: WorkItem): Record<string, unknown> {
  const context: Record<string, unknown> = { id: item.id, url: item.url };
  for (const [field, key] of Object.entries(CONTEXT_FIELDS)) {
    const value = item.fields[field];
    if (value === undefined || value === null || value === '') continue;
    context[key] = typeof value === 'string' ? htmlToText(value) : value;
  }
  context['links'] = (item.relations ?? []).map((r) => ({ rel: r.attributes?.['name'] ?? r.rel, url: r.url }));
  return context;
}

export function parentId(item: WorkItem): number | undefined {
  const parent = (item.relations ?? []).find((r) => r.rel === 'System.LinkTypes.Hierarchy-Reverse');
  const id = parent ? Number.parseInt(parent.url.split('/').pop() ?? '', 10) : Number.NaN;
  return Number.isNaN(id) ? undefined : id;
}

export function linkedIds(item: WorkItem, rel: string): number[] {
  return (item.relations ?? [])
    .filter((r) => r.rel === rel)
    .map((r) => Number.parseInt(r.url.split('/').pop() ?? '', 10))
    .filter((id) => !Number.isNaN(id));
}

// ---------- write payload builders (pure, unit-tested) ----------

export function mergeTags(current: string | undefined, add: string[], replacePrefixes: string[]): string {
  const kept = (current ?? '')
    .split(';')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && !replacePrefixes.some((prefix) => tag.startsWith(prefix)));
  return [...new Set([...kept, ...add])].join('; ');
}

export function buildTagsPatch(current: string | undefined, add: string[], replacePrefixes: string[]): JsonPatchOp[] {
  return [{ op: 'add', path: '/fields/System.Tags', value: mergeTags(current, add, replacePrefixes) }];
}

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Test Case steps in the Microsoft.VSTS.TCM.Steps XML format. */
export function stepsXml(steps: TestStep[]): string {
  const body = steps
    .map(
      (step, index) =>
        `<step id="${index + 2}" type="ValidateStep">` +
        `<parameterizedString isformatted="true">${escapeXml(step.action)}</parameterizedString>` +
        `<parameterizedString isformatted="true">${escapeXml(step.expected)}</parameterizedString>` +
        '<description/></step>',
    )
    .join('');
  return `<steps id="0" last="${steps.length + 1}">${body}</steps>`;
}

export const AI_TEST_CASE_TAG = 'qa-ai-generated';

/** New Test Case linked to its requirement with "Tests" (so the PBI shows it as "Tested By"). */
export function buildTestCasePatch(draft: TestCaseDraft, requirementUrl: string): JsonPatchOp[] {
  const preconditions =
    draft.preconditions.length > 0 ? `Preconditions:\n${draft.preconditions.map((p) => `- ${p}`).join('\n')}\n\n` : '';
  return [
    { op: 'add', path: '/fields/System.Title', value: draft.title },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: draft.priority },
    { op: 'add', path: '/fields/Microsoft.VSTS.TCM.Steps', value: stepsXml(draft.steps) },
    {
      op: 'add',
      path: '/fields/System.Description',
      value: `${preconditions}Covers: ${draft.acceptanceCriterionRef}\nType: ${draft.type} · Technique: ${draft.technique} · Surface: ${draft.surface}`,
    },
    { op: 'add', path: '/fields/System.Tags', value: [AI_TEST_CASE_TAG, `surface:${draft.surface}`, draft.automationCandidate ? 'automation:candidate' : 'automation:manual'].join('; ') },
    { op: 'add', path: '/relations/-', value: { rel: 'Microsoft.VSTS.Common.TestedBy-Reverse', url: requirementUrl } },
  ];
}

/** Idempotency: re-running on the same PBI must not duplicate test cases. */
export function selectNewTestCases(drafts: TestCaseDraft[], existingTitles: Iterable<string>): TestCaseDraft[] {
  const seen = new Set([...existingTitles].map((title) => title.trim().toLowerCase()));
  return drafts.filter((draft) => {
    const key = draft.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- writes ----------

export function updateWorkItem(cfg: AdoConfig, id: number, patch: JsonPatchOp[], fetchImpl?: FetchLike): Promise<WorkItem> {
  return adoRequest<WorkItem>(
    cfg,
    `wit/workitems/${id}?api-version=7.1`,
    { method: 'PATCH', body: patch, contentType: 'application/json-patch+json' },
    fetchImpl,
  );
}

export function createWorkItem(cfg: AdoConfig, type: string, patch: JsonPatchOp[], fetchImpl?: FetchLike): Promise<WorkItem> {
  return adoRequest<WorkItem>(
    cfg,
    `wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`,
    { method: 'POST', body: patch, contentType: 'application/json-patch+json' },
    fetchImpl,
  );
}

/** Markdown comments need Comments API 7.1-preview.4+ (verify on your org; fall back to HTML if rejected). */
export function addComment(cfg: AdoConfig, id: number, markdown: string, fetchImpl?: FetchLike): Promise<unknown> {
  return adoRequest(
    cfg,
    `wit/workItems/${id}/comments?format=markdown&api-version=7.1-preview.4`,
    { method: 'POST', body: { text: markdown } },
    fetchImpl,
  );
}

export function addTestCasesToSuite(
  cfg: AdoConfig,
  planId: number,
  suiteId: number,
  testCaseIds: number[],
  fetchImpl?: FetchLike,
): Promise<unknown> {
  return adoRequest(
    cfg,
    `testplan/Plans/${planId}/Suites/${suiteId}/TestCase?api-version=7.1`,
    { method: 'POST', body: testCaseIds.map((id) => ({ workItem: { id } })) },
    fetchImpl,
  );
}
