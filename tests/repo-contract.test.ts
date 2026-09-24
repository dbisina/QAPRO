// "QA the QA": every agent file parses, points at a real schema, and every schema compiles
// and accepts a realistic example. Breaking an agent contract fails CI before it reaches a pipeline.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAgentMarkdown } from '../src/agent-spec.js';
import { compileSchema, loadSchema, validate } from '../src/validate.js';

const agentFiles = readdirSync('.claude/agents').filter((file) => file.endsWith('.md'));
const schemaFiles = readdirSync('schemas').filter((file) => file.endsWith('.schema.json'));

describe('agents', () => {
  it.each(agentFiles)('%s is valid and references an existing schema', (file) => {
    const spec = parseAgentMarkdown(readFileSync(join('.claude/agents', file), 'utf8'));
    expect(`${spec.name}.md`).toBe(file);
    const schemaRef = /schemas\/[a-z-]+\.schema\.json/.exec(spec.instructions)?.[0];
    expect(schemaRef, 'agent must name its output schema').toBeDefined();
    expect(existsSync(schemaRef!)).toBe(true);
    for (const skill of spec.instructions.match(/\.claude\/skills\/[a-z0-9-]+\/SKILL\.md/g) ?? []) {
      expect(existsSync(skill), `${file} references missing ${skill}`).toBe(true);
    }
  });

  it('only the release judge runs on Opus (cost policy)', () => {
    const opus = agentFiles.filter((file) => parseAgentMarkdown(readFileSync(join('.claude/agents', file), 'utf8')).model === 'opus');
    expect(opus).toEqual(['release-judge.md']);
  });
});

describe('schemas', () => {
  it.each(schemaFiles)('%s compiles in strict mode', (file) => {
    expect(() => compileSchema(loadSchema(join('schemas', file)))).not.toThrow();
  });

  it('accepts a realistic req-analysis and rejects an unknown dimension', () => {
    const schema = loadSchema('schemas/req-analysis.schema.json');
    const analysis = {
      workItemId: 42,
      riskTier: 'high',
      readiness: 'needs-clarification',
      summary: 'Card payments lack failure handling and a latency target.',
      findings: [
        { dimension: 'performance', severity: 'medium', title: 'No latency target', detail: 'AC says "fast".', suggestion: 'State p95 < 800 ms.', evidence: 'AC3' },
      ],
      proposedAcceptanceCriteria: ['Scenario: Expired card is rejected\n  Given ...'],
      openQuestions: ['Which card brands are supported?'],
    };
    expect(validate(schema, analysis)).toEqual({ valid: true, errors: [] });
    const bad = { ...analysis, findings: [{ ...analysis.findings[0], dimension: 'vibes' }] };
    expect(validate(schema, bad).valid).toBe(false);
  });

  it('accepts a realistic test-case set', () => {
    const result = validate(loadSchema('schemas/test-cases.schema.json'), {
      workItemId: 42,
      coverageNotes: 'AC1-AC3 covered; 3DS out of scope.',
      testCases: [
        {
          title: 'Expired card is rejected',
          priority: 1,
          type: 'negative',
          technique: 'boundary-value',
          surface: 'api',
          automationCandidate: true,
          acceptanceCriterionRef: 'AC2',
          preconditions: [],
          steps: [{ action: 'POST /pay with card expiring yesterday', expected: '402 card_expired' }],
        },
      ],
    });
    expect(result.errors).toEqual([]);
  });
});
