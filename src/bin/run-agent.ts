// Runs one qa-platform agent headless and fails the step unless it returns schema-valid JSON.
//
//   tsx src/bin/run-agent.ts --agent req-analyst --schema schemas/req-analysis.schema.json \
//     --input out/work-item.json --task "Analyse this PBI" --out out/req-analysis.json [--model sonnet]
//
// Every flag can also come from env (QA_AGENT, QA_SCHEMA, QA_INPUT, QA_TASK, QA_OUT, QA_MAX_TURNS, QA_MODEL),
// which keeps pipeline YAML free of shell-quoting problems.
// Exit codes: 0 ok · 1 usage · 2 invalid agent output · 3 Claude Code failed.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { isAgentModel, loadAgent } from '../agent-spec.js';
import {
  buildAgentPrompt,
  buildClaudeArgs,
  buildRepairArgs,
  buildRepairPrompt,
  extractJsonObject,
  parseClaudeEnvelope,
} from '../agent-run.js';
import type { ClaudeEnvelope } from '../agent-run.js';
import { isSet, sanitizeEnv } from '../env.js';
import { loadSchema, validate } from '../validate.js';

function fail(code: number, message: string): never {
  console.error(`run-agent: ${message}`);
  process.exit(code);
}

function pick(flag: string | undefined, envName: string): string | undefined {
  if (isSet(flag)) return flag;
  const fromEnv = process.env[envName];
  return isSet(fromEnv) ? fromEnv : undefined;
}

const { values } = parseArgs({
  options: {
    agent: { type: 'string' },
    schema: { type: 'string' },
    input: { type: 'string' },
    task: { type: 'string' },
    out: { type: 'string' },
    model: { type: 'string' },
    'max-turns': { type: 'string' },
  },
});

const agentName = pick(values.agent, 'QA_AGENT') ?? fail(1, '--agent is required');
const schemaPath = pick(values.schema, 'QA_SCHEMA') ?? fail(1, '--schema is required');
const outPath = pick(values.out, 'QA_OUT') ?? fail(1, '--out is required');
const task = pick(values.task, 'QA_TASK') ?? fail(1, '--task is required');
const inputPath = pick(values.input, 'QA_INPUT');
const maxTurns = Number.parseInt(pick(values['max-turns'], 'QA_MAX_TURNS') ?? '25', 10);
const modelOverride = pick(values.model, 'QA_MODEL');
if (modelOverride !== undefined && !isAgentModel(modelOverride)) fail(1, `--model must be haiku, sonnet or opus`);

const spec = loadAgent(agentName);
const schemaText = readFileSync(schemaPath, 'utf8');
const schema = loadSchema(schemaPath);
const prompt = buildAgentPrompt({
  instructions: spec.instructions,
  task,
  input: inputPath === undefined ? '' : readFileSync(inputPath, 'utf8'),
  schemaText,
});
const timeoutMs = Number.parseInt(process.env['QA_AGENT_TIMEOUT_MS'] ?? `${20 * 60 * 1000}`, 10);

function runClaude(claudeArgs: string[], stdin: string): { envelope: ClaudeEnvelope; ok: boolean; detail: string } {
  const proc = spawnSync(process.env['CLAUDE_BIN'] ?? 'claude', claudeArgs, {
    input: stdin,
    encoding: 'utf8',
    env: sanitizeEnv(process.env),
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (proc.error) fail(3, `could not run Claude Code: ${proc.error.message}`);
  let envelope: ClaudeEnvelope;
  try {
    envelope = parseClaudeEnvelope(proc.stdout);
  } catch {
    fail(3, `unexpected Claude Code output (exit ${proc.status}): ${proc.stderr.slice(0, 2000) || proc.stdout.slice(0, 2000)}`);
  }
  return { envelope, ok: proc.status === 0 && !envelope.isError, detail: envelope.result.slice(0, 2000) || proc.stderr.slice(0, 2000) };
}

function check(text: string): { output?: Record<string, unknown>; errors: string[] } {
  let output: Record<string, unknown>;
  try {
    output = extractJsonObject(text);
  } catch (error) {
    return { errors: [(error as Error).message] };
  }
  const result = validate(schema, output);
  return { output, errors: result.valid ? [] : result.errors };
}

function sum(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

const started = Date.now();
const first = runClaude(buildClaudeArgs(spec, maxTurns, modelOverride), prompt);
const audit = {
  agent: spec.name,
  model: modelOverride ?? spec.model,
  sessionId: first.envelope.sessionId,
  numTurns: first.envelope.numTurns,
  costUsd: first.envelope.costUsd,
  durationMs: 0,
  promptSha256: createHash('sha256').update(prompt).digest('hex'),
  buildId: process.env['BUILD_BUILDID'] ?? null,
  timestamp: new Date().toISOString(),
  repaired: false,
  valid: false,
};

mkdirSync(dirname(outPath), { recursive: true });
function finish(code: number, message?: string): never {
  audit.durationMs = Date.now() - started;
  writeFileSync(`${outPath}.audit.json`, JSON.stringify(audit, null, 2));
  console.log(`QA_AUDIT ${JSON.stringify(audit)}`);
  if (message) fail(code, message);
  process.exit(code);
}

if (!first.ok) finish(3, `Claude Code reported an error: ${first.detail}`);

let checked = check(first.envelope.result);
let lastText = first.envelope.result;
if (checked.errors.length > 0 && first.envelope.sessionId !== null) {
  console.error(`run-agent: output breaks the schema (${checked.errors.length} error(s)); asking the agent to repair it once`);
  const repair = runClaude(buildRepairArgs(spec, first.envelope.sessionId, modelOverride), buildRepairPrompt(checked.errors));
  audit.repaired = true;
  audit.numTurns = sum(audit.numTurns, repair.envelope.numTurns);
  audit.costUsd = sum(audit.costUsd, repair.envelope.costUsd);
  if (repair.ok) {
    checked = check(repair.envelope.result);
    lastText = repair.envelope.result;
  }
}

if (checked.errors.length > 0 || checked.output === undefined) {
  writeFileSync(`${outPath}.invalid.txt`, checked.output === undefined ? lastText : JSON.stringify(checked.output, null, 2));
  finish(2, `output does not match ${schemaPath}:\n  ${checked.errors.join('\n  ')}`);
}

audit.valid = true;
writeFileSync(outPath, `${JSON.stringify(checked.output, null, 2)}\n`);
finish(0);