import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyJunit, emptySarif } from '../src/evidence.js';
import { evaluateGate, renderGateMarkdown } from '../src/gate.js';
import type { GatePolicy } from '../src/gate.js';

const policy = (JSON.parse(readFileSync('tool-config/gates.json', 'utf8')) as GatePolicy).stages;
const passingJunit = { ...emptyJunit(), total: 10, passed: 10 };

describe('evaluateGate', () => {
  it('passes clean PR evidence', () => {
    const result = evaluateGate(policy['pr']!, { junit: passingJunit, sarif: emptySarif(), mutationScore: 75 });
    expect(result).toEqual({ pass: true, failures: [], notes: [] });
  });

  it('fails closed when required evidence is missing', () => {
    const result = evaluateGate(policy['pr']!, {});
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual(['Missing required evidence: junit', 'Missing required evidence: sarif']);
  });

  it('treats an empty test suite as a failure, not a pass', () => {
    const result = evaluateGate(policy['dev']!, { junit: emptyJunit() });
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatch(/empty suite/);
  });

  it('blocks on failed tests but only notes quarantined ones', () => {
    const junit = { ...passingJunit, failed: 1, quarantinedFailed: 2, failedTests: ['@TC9 login'] };
    const result = evaluateGate(policy['dev']!, { junit });
    expect(result.failures).toEqual(['1 test(s) failed (allowed 0): @TC9 login']);
    expect(result.notes[0]).toMatch(/2 quarantined/);
  });

  it('blocks on critical findings and any leaked secret', () => {
    const sarif = { ...emptySarif(), total: 2, bySeverity: { ...emptySarif().bySeverity, critical: 1 }, byTool: { gitleaks: 1 } };
    const result = evaluateGate(policy['pr']!, { junit: passingJunit, sarif });
    expect(result.pass).toBe(false);
    expect(result.failures.join('\n')).toMatch(/severity "critical"/);
    expect(result.failures.join('\n')).toMatch(/tool "gitleaks"/);
  });

  it('enforces mutation score and evidence freshness', () => {
    expect(evaluateGate(policy['pr']!, { junit: passingJunit, sarif: emptySarif(), mutationScore: 40 }).failures).toEqual([
      'Mutation score 40% is below 60%',
    ]);
    const stale = evaluateGate(policy['uat']!, { junit: passingJunit, sarif: emptySarif(), oldestEvidenceAgeHours: 30 });
    expect(stale.failures[0]).toMatch(/stale/);
  });

  it('renders a readable summary', () => {
    const markdown = renderGateMarkdown('dev', { pass: false, failures: ['x'], notes: [] }, { junit: passingJunit });
    expect(markdown).toContain('QA gate: dev — FAIL');
    expect(markdown).toContain('- x');
  });
});
