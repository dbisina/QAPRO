import { describe, expect, it } from 'vitest';
import { renderReleaseVerdict, renderReqAnalysisComment } from '../src/render.js';

describe('renderReqAnalysisComment', () => {
  it('sorts findings by severity and escapes table cells', () => {
    const markdown = renderReqAnalysisComment({
      workItemId: 1,
      riskTier: 'high',
      readiness: 'needs-clarification',
      summary: 'Summary.',
      findings: [
        { dimension: 'ui', severity: 'low', title: 'Low one', detail: 'd', suggestion: 's' },
        { dimension: 'security', severity: 'critical', title: 'A | B', detail: 'd', suggestion: 'line1\nline2' },
      ],
      proposedAcceptanceCriteria: ['Scenario: x'],
      openQuestions: ['Why?'],
    });
    expect(markdown.indexOf('critical')).toBeLessThan(markdown.indexOf('| low |'));
    expect(markdown).toContain('A \\| B');
    expect(markdown).toContain('line1 line2');
    expect(markdown).toContain('```gherkin\nScenario: x\n```');
  });
});

describe('renderReleaseVerdict', () => {
  it('shows the recommendation, blockers and evidence status', () => {
    const markdown = renderReleaseVerdict({
      releaseId: '2026.09.1',
      recommendation: 'no-go',
      confidence: 0.92,
      summary: 'Checkout regression failed.',
      blockingIssues: ['gate-uat.json: 2 tests failed'],
      risks: [],
      evidenceReviewed: [{ source: 'gate-uat.json', status: 'fail' }],
      dimensionCoverage: [{ dimension: 'security', status: 'covered' }],
    });
    expect(markdown).toContain('(advisory): NO-GO');
    expect(markdown).toContain('confidence 92%');
    expect(markdown).toContain('- FAIL: gate-uat.json');
  });
});
