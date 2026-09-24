import { describe, expect, it, vi } from 'vitest';
import {
  adoConfigFromEnv,
  adoRequest,
  buildTestCasePatch,
  htmlToText,
  mergeTags,
  parentId,
  selectNewTestCases,
  stepsXml,
  toAgentContext,
} from '../src/ado.js';
import type { TestCaseDraft } from '../src/types.js';

const draft: TestCaseDraft = {
  title: 'Rejects expired card',
  priority: 1,
  type: 'negative',
  technique: 'boundary-value',
  surface: 'api',
  automationCandidate: true,
  acceptanceCriterionRef: 'AC2',
  preconditions: ['Card expired yesterday'],
  steps: [{ action: 'POST /pay with <expired> card', expected: 'HTTP 402 & "card_expired"' }],
};

describe('adoConfigFromEnv', () => {
  it('prefers the pipeline token and ignores unresolved macros', () => {
    const cfg = adoConfigFromEnv({ SYSTEM_COLLECTIONURI: 'https://dev.azure.com/org/', SYSTEM_TEAMPROJECT: 'P', SYSTEM_ACCESSTOKEN: 't', ADO_PAT: 'p' });
    expect(cfg).toEqual({ orgUrl: 'https://dev.azure.com/org', project: 'P', authorization: 'Bearer t' });
    const pat = adoConfigFromEnv({ ADO_ORG_URL: 'https://dev.azure.com/org', ADO_PROJECT: 'P', SYSTEM_ACCESSTOKEN: '$(System.AccessToken)', ADO_PAT: 'p' });
    expect(pat.authorization).toBe(`Basic ${Buffer.from(':p').toString('base64')}`);
    expect(() => adoConfigFromEnv({ ADO_ORG_URL: 'x', ADO_PROJECT: 'P' })).toThrow(/ADO_PAT/);
  });
});

describe('adoRequest', () => {
  it('retries on 429 honouring Retry-After, then returns JSON', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 7 }), { status: 200 }));
    const cfg = { orgUrl: 'https://dev.azure.com/org', project: 'My Project', authorization: 'Bearer t' };
    await expect(adoRequest(cfg, 'wit/workitems/7', {}, fetchImpl)).resolves.toEqual({ id: 7 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://dev.azure.com/org/My%20Project/_apis/wit/workitems/7');
  });
});

describe('payload builders', () => {
  it('merges tags, replacing the qa:* family', () => {
    expect(mergeTags('team-a; qa:risk-low; qa:ready', ['qa:risk-high', 'qa:blocked'], ['qa:risk-', 'qa:ready', 'qa:blocked'])).toBe(
      'team-a; qa:risk-high; qa:blocked',
    );
  });

  it('writes escaped test steps XML', () => {
    expect(stepsXml(draft.steps)).toBe(
      '<steps id="0" last="2"><step id="2" type="ValidateStep">' +
        '<parameterizedString isformatted="true">POST /pay with &lt;expired&gt; card</parameterizedString>' +
        '<parameterizedString isformatted="true">HTTP 402 &amp; &quot;card_expired&quot;</parameterizedString>' +
        '<description/></step></steps>',
    );
  });

  it('links the test case to its requirement with "Tests"', () => {
    const patch = buildTestCasePatch(draft, 'https://dev.azure.com/org/_apis/wit/workItems/42');
    expect(patch.at(-1)).toEqual({
      op: 'add',
      path: '/relations/-',
      value: { rel: 'Microsoft.VSTS.Common.TestedBy-Reverse', url: 'https://dev.azure.com/org/_apis/wit/workItems/42' },
    });
  });

  it('skips test cases that already exist (idempotent re-runs)', () => {
    const second = { ...draft, title: 'Accepts valid card' };
    expect(selectNewTestCases([draft, second, { ...second }], [' rejects expired card '])).toEqual([second]);
  });
});

describe('agent context', () => {
  it('converts HTML fields to text and finds the parent', () => {
    expect(htmlToText('<div>Line&nbsp;1</div><ul><li>A &amp; B</li></ul>')).toBe('Line 1\n- A & B');
    const item = {
      id: 5,
      url: 'u',
      fields: { 'System.Title': 'T', 'System.Description': '<p>Hi</p>', 'System.State': '' },
      relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://x/_apis/wit/workItems/3', attributes: { name: 'Parent' } }],
    };
    expect(toAgentContext(item)).toEqual({ id: 5, url: 'u', title: 'T', description: 'Hi', links: [{ rel: 'Parent', url: 'https://x/_apis/wit/workItems/3' }] });
    expect(parentId(item)).toBe(3);
  });
});
