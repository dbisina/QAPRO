import { describe, expect, it } from 'vitest';
import { addJunit, parseJunit, parseSarif, parseStrykerScore, severityBucket } from '../src/evidence.js';

const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="checkout">
    <testcase classname="checkout" name="@TC1 pays by card"/>
    <testcase classname="checkout" name="@TC2 rejects expired card"><failure message="expected 402">stack</failure></testcase>
    <testcase classname="checkout" name="@TC3 flaky banner @quarantine"><failure message="timeout"/></testcase>
    <testcase classname="checkout" name="@TC4 apple pay"><skipped/></testcase>
    <testsuite name="nested">
      <testcase classname="nested" name="errors count as failures"><error message="boom"/></testcase>
    </testsuite>
  </testsuite>
</testsuites>`;

describe('parseJunit', () => {
  it('counts pass, fail, skip, quarantine and nested suites', () => {
    const summary = parseJunit(JUNIT);
    expect(summary).toMatchObject({ total: 5, passed: 1, failed: 2, skipped: 1, quarantinedFailed: 1 });
    expect(summary.failedTests).toEqual(['checkout > @TC2 rejects expired card', 'nested > errors count as failures']);
  });

  it('handles a bare <testsuite> root and adds summaries', () => {
    const single = parseJunit('<testsuite name="s"><testcase name="a"/></testsuite>');
    expect(single.total).toBe(1);
    expect(addJunit(single, single).total).toBe(2);
  });
});

const SARIF = JSON.stringify({
  version: '2.1.0',
  runs: [
    {
      tool: { driver: { name: 'Trivy', rules: [{ id: 'CVE-1', properties: { 'security-severity': '9.8' } }, { id: 'CVE-2', properties: { 'security-severity': '5.0' }, defaultConfiguration: { level: 'note' } }] } },
      results: [{ ruleId: 'CVE-1', level: 'error' }, { ruleIndex: 1 }, { ruleId: 'CVE-1', suppressions: [{ status: 'accepted' }] }],
    },
    { tool: { driver: { name: 'gitleaks' } }, results: [{ ruleId: 'aws-key' }] },
  ],
});

describe('parseSarif', () => {
  it('buckets severity, level and tool and skips accepted suppressions', () => {
    const summary = parseSarif(SARIF);
    expect(summary.total).toBe(3);
    expect(summary.suppressed).toBe(1);
    expect(summary.bySeverity).toMatchObject({ critical: 1, medium: 1, unknown: 1 });
    expect(summary.byLevel).toMatchObject({ error: 1, note: 1, warning: 1 });
    expect(summary.byTool).toEqual({ trivy: 2, gitleaks: 1 });
  });

  it('maps security-severity scores to buckets', () => {
    expect(severityBucket('9.0')).toBe('critical');
    expect(severityBucket(7)).toBe('high');
    expect(severityBucket('4.1')).toBe('medium');
    expect(severityBucket('0.5')).toBe('low');
    expect(severityBucket(undefined)).toBe('unknown');
  });
});

describe('parseStrykerScore', () => {
  it('computes detected / valid mutants', () => {
    const report = JSON.stringify({
      files: {
        'a.ts': { mutants: [{ status: 'Killed' }, { status: 'Timeout' }, { status: 'Survived' }, { status: 'NoCoverage' }] },
        'b.ts': { mutants: [{ status: 'CompileError' }, { status: 'Ignored' }] },
      },
    });
    expect(parseStrykerScore(report)).toBe(50);
    expect(parseStrykerScore(JSON.stringify({ files: {} }))).toBeNull();
  });
});
