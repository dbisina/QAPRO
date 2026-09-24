import type { JunitSummary, SarifLevel, SarifSummary, Severity } from './evidence.js';

// "LLM authors, tools judge": this module is the judge. It is pure, deterministic and has no AI in it.

export type EvidenceKind = 'junit' | 'sarif' | 'mutation';

export interface StagePolicy {
  /** Evidence that must exist. Missing required evidence fails the gate (fail closed). */
  requireEvidence?: EvidenceKind[];
  /** Fails when any evidence file is older than this (e.g. uat reads the nightly heavy-suite results). */
  maxEvidenceAgeHours?: number;
  junit?: { maxFailed?: number; minTotal?: number };
  sarif?: {
    maxBySeverity?: Partial<Record<Severity, number>>;
    maxByLevel?: Partial<Record<SarifLevel, number>>;
    maxByTool?: Record<string, number>;
  };
  mutation?: { minScore?: number };
}

export interface GatePolicy {
  stages: Record<string, StagePolicy>;
}

export interface Evidence {
  junit?: JunitSummary;
  sarif?: SarifSummary;
  mutationScore?: number | null;
  oldestEvidenceAgeHours?: number;
}

export interface GateResult {
  pass: boolean;
  failures: string[];
  notes: string[];
}

function hasEvidence(kind: EvidenceKind, evidence: Evidence): boolean {
  if (kind === 'junit') return evidence.junit !== undefined;
  if (kind === 'sarif') return evidence.sarif !== undefined;
  return typeof evidence.mutationScore === 'number';
}

function checkLimits(
  failures: string[],
  label: string,
  counts: Readonly<Record<string, number>>,
  limits: Readonly<Record<string, number | undefined>> | undefined,
): void {
  for (const [key, max] of Object.entries(limits ?? {})) {
    if (max === undefined) continue;
    const count = counts[key] ?? 0;
    if (count > max) failures.push(`${count} security/static finding(s) with ${label} "${key}" (allowed ${max})`);
  }
}

export function evaluateGate(policy: StagePolicy, evidence: Evidence): GateResult {
  const failures: string[] = [];
  const notes: string[] = [];

  for (const kind of policy.requireEvidence ?? []) {
    if (!hasEvidence(kind, evidence)) failures.push(`Missing required evidence: ${kind}`);
  }

  const maxAge = policy.maxEvidenceAgeHours;
  const age = evidence.oldestEvidenceAgeHours;
  if (maxAge !== undefined && age !== undefined && age > maxAge) {
    failures.push(`Evidence is stale: oldest file is ${age.toFixed(1)}h old (limit ${maxAge}h)`);
  }

  const { junit, sarif } = evidence;
  if (junit && policy.junit) {
    const { minTotal, maxFailed } = policy.junit;
    if (minTotal !== undefined && junit.total < minTotal) {
      failures.push(`Only ${junit.total} test(s) ran (minimum ${minTotal}); an empty suite is not a pass`);
    }
    if (maxFailed !== undefined && junit.failed > maxFailed) {
      const sample = junit.failedTests.slice(0, 5).join('; ');
      failures.push(`${junit.failed} test(s) failed (allowed ${maxFailed}): ${sample}`);
    }
  }
  if (junit && junit.quarantinedFailed > 0) {
    notes.push(`${junit.quarantinedFailed} quarantined test(s) failed (reported, not gating)`);
  }

  if (sarif && policy.sarif) {
    checkLimits(failures, 'severity', sarif.bySeverity, policy.sarif.maxBySeverity);
    checkLimits(failures, 'level', sarif.byLevel, policy.sarif.maxByLevel);
    checkLimits(failures, 'tool', sarif.byTool, policy.sarif.maxByTool);
  }
  if (sarif && sarif.suppressed > 0) notes.push(`${sarif.suppressed} suppressed finding(s) excluded`);

  const minScore = policy.mutation?.minScore;
  if (minScore !== undefined && typeof evidence.mutationScore === 'number' && evidence.mutationScore < minScore) {
    failures.push(`Mutation score ${evidence.mutationScore}% is below ${minScore}%`);
  }

  return { pass: failures.length === 0, failures, notes };
}

export function renderGateMarkdown(stage: string, result: GateResult, evidence: Evidence): string {
  const lines = [`## QA gate: ${stage} — ${result.pass ? 'PASS' : 'FAIL'}`, ''];
  if (result.failures.length > 0) {
    lines.push('### Blocking', ...result.failures.map((f) => `- ${f}`), '');
  }
  if (result.notes.length > 0) {
    lines.push('### Notes', ...result.notes.map((n) => `- ${n}`), '');
  }
  lines.push('### Evidence');
  const { junit, sarif, mutationScore } = evidence;
  lines.push(
    junit
      ? `- Tests: ${junit.total} total, ${junit.passed} passed, ${junit.failed} failed, ${junit.skipped} skipped`
      : '- Tests: none found',
  );
  lines.push(
    sarif
      ? `- Static/security: ${sarif.total} finding(s) — critical ${sarif.bySeverity.critical}, high ${sarif.bySeverity.high}, errors ${sarif.byLevel.error}`
      : '- Static/security: none found',
  );
  lines.push(`- Mutation score: ${typeof mutationScore === 'number' ? `${mutationScore}%` : 'n/a'}`);
  if (sarif && sarif.top.length > 0) lines.push('', '<details><summary>Top findings</summary>', '', ...sarif.top.map((t) => `- ${t}`), '', '</details>');
  return `${lines.join('\n')}\n`;
}
