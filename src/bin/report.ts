// Renders agent output for humans.
//   tsx src/bin/report.ts release-verdict --in qa-results/release-verdict.json --out qa-results/release-verdict.md

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { renderReleaseVerdict } from '../render.js';
import type { ReleaseVerdict } from '../types.js';
import { loadSchema, validate } from '../validate.js';

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({ args: rest, options: { in: { type: 'string' }, out: { type: 'string' } } });

if (command !== 'release-verdict' || !values.in || !values.out) {
  console.error('usage: report.ts release-verdict --in <verdict.json> --out <verdict.md>');
  process.exit(1);
}

const data: unknown = JSON.parse(readFileSync(values.in, 'utf8'));
const check = validate(loadSchema('schemas/release-verdict.schema.json'), data);
if (!check.valid) {
  console.error(`report: ${values.in} is not a valid release verdict: ${check.errors.join('; ')}`);
  process.exit(1);
}

const markdown = renderReleaseVerdict(data as ReleaseVerdict);
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${markdown}\n`);
console.log(markdown);
if (process.env['TF_BUILD']) console.log(`##vso[task.uploadsummary]${resolve(values.out)}`);
