// Deterministic quality gate. Reads JUnit / SARIF / Stryker evidence, applies tool-config/gates.json,
// writes a JSON + Markdown verdict and exits 1 on failure so the pipeline stage fails.
//
//   tsx src/bin/gate.ts --stage pr --junit-dir qa-results/junit --sarif-dir qa-results/sarif \
//     [--stryker qa-results/mutation/mutation.json] [--policy tool-config/gates.json] [--out qa-results/gate-pr]

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { addJunit, addSarif, emptyJunit, emptySarif, parseJunit, parseSarif, parseStrykerScore } from '../evidence.js';
import type { JunitSummary, SarifSummary } from '../evidence.js';
import { evaluateGate, renderGateMarkdown } from '../gate.js';
import type { Evidence, GatePolicy } from '../gate.js';

const { values } = parseArgs({
  options: {
    stage: { type: 'string' },
    policy: { type: 'string', default: 'tool-config/gates.json' },
    'junit-dir': { type: 'string' },
    'sarif-dir': { type: 'string' },
    stryker: { type: 'string' },
    out: { type: 'string' },
  },
});

const stage = values.stage;
if (!stage) {
  console.error('gate: --stage is required (pr | dev | uat | prod)');
  process.exit(1);
}
const policy = (JSON.parse(readFileSync(values.policy, 'utf8')) as GatePolicy).stages[stage];
if (!policy) {
  console.error(`gate: stage "${stage}" is not defined in ${values.policy}`);
  process.exit(1);
}

function filesIn(dir: string | undefined, extensions: string[]): string[] {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((name) => join(dir, name))
    .filter((path) => extensions.some((ext) => path.toLowerCase().endsWith(ext)) && statSync(path).isFile());
}

const junitFiles = filesIn(values['junit-dir'], ['.xml']);
const sarifFiles = filesIn(values['sarif-dir'], ['.sarif', '.sarif.json']);
const allFiles = [...junitFiles, ...sarifFiles, ...(values.stryker && existsSync(values.stryker) ? [values.stryker] : [])];

const evidence: Evidence = {};
if (junitFiles.length > 0) {
  evidence.junit = junitFiles.reduce<JunitSummary>((acc, file) => addJunit(acc, parseJunit(readFileSync(file, 'utf8'))), emptyJunit());
}
if (sarifFiles.length > 0) {
  evidence.sarif = sarifFiles.reduce<SarifSummary>((acc, file) => addSarif(acc, parseSarif(readFileSync(file, 'utf8'))), emptySarif());
}
if (values.stryker && existsSync(values.stryker)) {
  evidence.mutationScore = parseStrykerScore(readFileSync(values.stryker, 'utf8'));
}
if (allFiles.length > 0) {
  const oldest = Math.min(...allFiles.map((file) => statSync(file).mtimeMs));
  evidence.oldestEvidenceAgeHours = (Date.now() - oldest) / 3_600_000;
}

const result = evaluateGate(policy, evidence);
const markdown = renderGateMarkdown(stage, result, evidence);
const outBase = values.out ?? `qa-results/gate-${stage}`;
mkdirSync(dirname(outBase), { recursive: true });
writeFileSync(`${outBase}.json`, JSON.stringify({ stage, ...result, evidence }, null, 2));
writeFileSync(`${outBase}.md`, markdown);

console.log(markdown);
if (process.env['TF_BUILD']) {
  // Later (advisory) AI steps branch on these, e.g. run failure-triager only when tests failed.
  console.log(`##vso[task.setvariable variable=QA_GATE_PASS]${result.pass}`);
  console.log(`##vso[task.setvariable variable=QA_TESTS_FAILED]${evidence.junit?.failed ?? 0}`);
  console.log(`##vso[task.setvariable variable=QA_SARIF_TOTAL]${evidence.sarif?.total ?? 0}`);
  console.log(`##vso[task.uploadsummary]${resolve(`${outBase}.md`)}`);
  for (const failure of result.failures) console.log(`##vso[task.logissue type=error]QA gate (${stage}): ${failure}`);
}
process.exit(result.pass ? 0 : 1);
