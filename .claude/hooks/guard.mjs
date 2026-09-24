#!/usr/bin/env node
// PreToolUse guard for Bash/PowerShell. Exit code 2 blocks the command and shows the reason to Claude.
// Always-on rules stop destructive commands everywhere; QA_ENV=prod adds a read-only rule set.
// This is defence in depth: prod identities are read-only anyway (docs/architecture.md §4, §8).
import { pathToFileURL } from 'node:url';

/** @type {Array<[RegExp, string]>} */
const ALWAYS = [
  [/\brm\b[^|;&\n]*\s-(?:[a-zA-Z]*[rR][a-zA-Z]*|-recursive)\b/, 'recursive delete'],
  [/\bRemove-Item\b[^|;\n]*-Recurse\b/i, 'recursive delete (PowerShell)'],
  [/\bgit\s+push\b[^|;&\n]*\s(?:--force(?:-with-lease)?|-f)\b/, 'force push'],
  [/\bgit\s+reset\b[^|;&\n]*--hard\b/, 'hard reset'],
  [/\b(?:drop|truncate)\s+(?:table|database|schema)\b/i, 'destructive SQL'],
  [/\bdelete\s+from\b/i, 'SQL delete'],
  [/\bterraform\s+(?:apply|destroy)\b/, 'infrastructure change'],
  [/\baz\s+[^|;&\n]*\bdelete\b/, 'Azure delete'],
  [/\bkubectl\s+(?:delete|drain|cordon|scale|apply|patch|edit|replace)\b/, 'Kubernetes change'],
  [/\baz\s+keyvault\s+secret\s+(?:show|download|backup|list-versions)\b/, 'reading secrets'],
  [/(?:^|[\s'"=/])\.env(?:\.[\w-]+)?(?=$|[\s'"])/, 'touching .env files'],
  [/\b(?:mkfs|Format-Volume|diskpart)\b/i, 'disk formatting'],
];

/** @type {Array<[RegExp, string]>} */
const PROD = [
  [/\bcurl\b[^|;&\n]*(?:-X\s*|--request\s+)(?:POST|PUT|PATCH|DELETE)\b/i, 'mutating HTTP call in prod'],
  [/\bcurl\b[^|;&\n]*\s(?:-d|--data(?:-raw|-binary|-urlencode)?|-F|--form)\b/, 'mutating HTTP call in prod'],
  [/\bInvoke-(?:RestMethod|WebRequest)\b[^|;\n]*-Method\s+(?:Post|Put|Patch|Delete)\b/i, 'mutating HTTP call in prod'],
  [/\baz\s+[^|;&\n]*\b(?:create|update|set|start|stop|restart|deploy|import|purge)\b/, 'Azure write in prod'],
  [/\bk6\s+run\b/, 'load test in prod'],
  [/\baz\s+load\b/, 'load test in prod'],
  [/\bzap-(?:full|api)-scan\b/i, 'active DAST in prod'],
  [/\bchaos\b/i, 'chaos experiment in prod'],
  [/\bgit\s+push\b/, 'git push from a prod job'],
];

/**
 * @param {string} command
 * @param {Record<string, string | undefined>} env
 * @returns {{ block: boolean, reason?: string }}
 */
export function evaluate(command, env) {
  const rules = env.QA_ENV === 'prod' ? [...ALWAYS, ...PROD] : ALWAYS;
  for (const [pattern, reason] of rules) {
    if (pattern.test(command)) return { block: true, reason };
  }
  return { block: false };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write('qa-platform guard: could not parse hook input; blocking to fail safe.\n');
    process.exit(2);
  }
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') process.exit(0);
  const verdict = evaluate(command, process.env);
  if (verdict.block) {
    process.stderr.write(
      `Blocked by qa-platform guard: ${verdict.reason}. ` +
        'QA agents must not run this. If it is genuinely needed, a human runs it outside the agent.\n',
    );
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
