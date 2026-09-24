import { XMLParser } from 'fast-xml-parser';

// ---------- JUnit (every test runner we use can emit it: Playwright, Maestro, k6, pytest, dotnet, ...) ----------

export interface JunitSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Failures of tests tagged @quarantine: reported, never gating (flaky-test policy). */
  quarantinedFailed: number;
  failedTests: string[];
}

export const QUARANTINE_TAG = '@quarantine';

type XmlNode = Record<string, unknown>;

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => name === 'testsuite' || name === 'testcase',
});

export function emptyJunit(): JunitSummary {
  return { total: 0, passed: 0, failed: 0, skipped: 0, quarantinedFailed: 0, failedTests: [] };
}

function isNode(value: unknown): value is XmlNode {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNodes(value: unknown): XmlNode[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  // Self-closing elements without attributes parse as '' — keep them as empty nodes.
  return list.map((item) => (isNode(item) ? item : {}));
}

function* suitesIn(node: XmlNode): Generator<XmlNode> {
  for (const suite of asNodes(node['testsuite'])) {
    yield suite;
    yield* suitesIn(suite);
  }
}

export function parseJunit(content: string): JunitSummary {
  const doc = xml.parse(content) as XmlNode;
  const root = isNode(doc['testsuites']) ? doc['testsuites'] : doc;
  const summary = emptyJunit();

  for (const suite of suitesIn(root)) {
    for (const testcase of asNodes(suite['testcase'])) {
      const name = [testcase['classname'], testcase['name']]
        .filter((part): part is string => typeof part === 'string' && part.length > 0)
        .join(' > ');
      summary.total += 1;
      if ('skipped' in testcase) {
        summary.skipped += 1;
      } else if ('failure' in testcase || 'error' in testcase) {
        if (name.includes(QUARANTINE_TAG)) {
          summary.quarantinedFailed += 1;
        } else {
          summary.failed += 1;
          summary.failedTests.push(name || '(unnamed test)');
        }
      } else {
        summary.passed += 1;
      }
    }
  }
  return summary;
}

export function addJunit(a: JunitSummary, b: JunitSummary): JunitSummary {
  return {
    total: a.total + b.total,
    passed: a.passed + b.passed,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    quarantinedFailed: a.quarantinedFailed + b.quarantinedFailed,
    failedTests: [...a.failedTests, ...b.failedTests],
  };
}

// ---------- SARIF (Semgrep, CodeQL, Trivy, gitleaks, ZAP, ...) ----------

export type SarifLevel = 'error' | 'warning' | 'note' | 'none';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface SarifSummary {
  total: number;
  suppressed: number;
  byLevel: Record<SarifLevel, number>;
  bySeverity: Record<Severity, number>;
  byTool: Record<string, number>;
  top: string[];
}

interface SarifRule {
  id?: string;
  properties?: Record<string, unknown>;
  defaultConfiguration?: { level?: string };
}

interface SarifResult {
  ruleId?: string;
  ruleIndex?: number;
  level?: string;
  properties?: Record<string, unknown>;
  suppressions?: { status?: string }[];
}

interface SarifRun {
  tool?: { driver?: { name?: string; rules?: SarifRule[] } };
  results?: SarifResult[];
}

const LEVELS: readonly SarifLevel[] = ['error', 'warning', 'note', 'none'];
const TOP_LIMIT = 20;

export function emptySarif(): SarifSummary {
  return {
    total: 0,
    suppressed: 0,
    byLevel: { error: 0, warning: 0, note: 0, none: 0 },
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
    byTool: {},
    top: [],
  };
}

/** Buckets the numeric `security-severity` property (CVSS-like, 0-10) the way GitHub/ADO security views do. */
export function severityBucket(score: unknown): Severity {
  const value = typeof score === 'number' ? score : typeof score === 'string' ? Number.parseFloat(score) : Number.NaN;
  if (Number.isNaN(value)) return 'unknown';
  if (value >= 9) return 'critical';
  if (value >= 7) return 'high';
  if (value >= 4) return 'medium';
  if (value > 0) return 'low';
  return 'unknown';
}

function toLevel(value: string | undefined): SarifLevel {
  return LEVELS.find((level) => level === value) ?? 'warning'; // SARIF default level is "warning"
}

export function parseSarif(content: string): SarifSummary {
  const log = JSON.parse(content) as { runs?: SarifRun[] };
  const summary = emptySarif();

  for (const run of log.runs ?? []) {
    const tool = (run.tool?.driver?.name ?? 'unknown').toLowerCase();
    const rules = run.tool?.driver?.rules ?? [];
    for (const result of run.results ?? []) {
      const isSuppressed = (result.suppressions ?? []).some((s) => (s.status ?? 'accepted') === 'accepted');
      if (isSuppressed) {
        summary.suppressed += 1;
        continue;
      }
      const rule =
        result.ruleIndex !== undefined ? rules[result.ruleIndex] : rules.find((r) => r.id === result.ruleId);
      const level = toLevel(result.level ?? rule?.defaultConfiguration?.level);
      const severity = severityBucket(result.properties?.['security-severity'] ?? rule?.properties?.['security-severity']);

      summary.total += 1;
      summary.byLevel[level] += 1;
      summary.bySeverity[severity] += 1;
      summary.byTool[tool] = (summary.byTool[tool] ?? 0) + 1;
      if (summary.top.length < TOP_LIMIT) {
        summary.top.push(`${tool}: ${result.ruleId ?? rule?.id ?? 'unknown-rule'} (${severity}/${level})`);
      }
    }
  }
  return summary;
}

export function addSarif(a: SarifSummary, b: SarifSummary): SarifSummary {
  const byTool: Record<string, number> = { ...a.byTool };
  for (const [tool, count] of Object.entries(b.byTool)) byTool[tool] = (byTool[tool] ?? 0) + count;
  return {
    total: a.total + b.total,
    suppressed: a.suppressed + b.suppressed,
    byLevel: {
      error: a.byLevel.error + b.byLevel.error,
      warning: a.byLevel.warning + b.byLevel.warning,
      note: a.byLevel.note + b.byLevel.note,
      none: a.byLevel.none + b.byLevel.none,
    },
    bySeverity: {
      critical: a.bySeverity.critical + b.bySeverity.critical,
      high: a.bySeverity.high + b.bySeverity.high,
      medium: a.bySeverity.medium + b.bySeverity.medium,
      low: a.bySeverity.low + b.bySeverity.low,
      unknown: a.bySeverity.unknown + b.bySeverity.unknown,
    },
    byTool,
    top: [...a.top, ...b.top].slice(0, TOP_LIMIT),
  };
}

// ---------- Stryker mutation report (mutation-testing-report-schema) ----------

const NOT_VALID = new Set(['CompileError', 'RuntimeError', 'Ignored']);
const DETECTED = new Set(['Killed', 'Timeout']);

/** Mutation score in percent (2 decimals), or null when no valid mutants exist. */
export function parseStrykerScore(content: string): number | null {
  const report = JSON.parse(content) as { files?: Record<string, { mutants?: { status?: string }[] }> };
  let valid = 0;
  let detected = 0;
  for (const file of Object.values(report.files ?? {})) {
    for (const mutant of file.mutants ?? []) {
      const status = mutant.status ?? '';
      if (NOT_VALID.has(status)) continue;
      valid += 1;
      if (DETECTED.has(status)) detected += 1;
    }
  }
  return valid === 0 ? null : Math.round((detected / valid) * 10000) / 100;
}
