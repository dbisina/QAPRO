import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type AgentModel = 'haiku' | 'sonnet' | 'opus';

export interface AgentSpec {
  name: string;
  description: string;
  model: AgentModel;
  tools: string[];
  instructions: string;
}

const MODELS: readonly string[] = ['haiku', 'sonnet', 'opus'];

export function isAgentModel(value: string | undefined): value is AgentModel {
  return value !== undefined && MODELS.includes(value);
}

/** Parses a Claude Code subagent file (.claude/agents/*.md): simple `key: value` frontmatter + markdown body. */
export function parseAgentMarkdown(markdown: string): AgentSpec {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown);
  const header = match?.[1];
  const body = match?.[2];
  if (header === undefined || body === undefined) {
    throw new Error('Agent file must start with a frontmatter block delimited by ---');
  }

  const fields = new Map<string, string>();
  for (const line of header.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  const name = fields.get('name');
  if (!name) throw new Error('Agent frontmatter is missing "name"');
  const model = fields.get('model');
  if (!isAgentModel(model)) {
    throw new Error(`Agent "${name}" must set model to one of: ${MODELS.join(', ')}`);
  }
  const tools = (fields.get('tools') ?? '')
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0);

  return { name, description: fields.get('description') ?? '', model, tools, instructions: body.trim() };
}

export function loadAgent(name: string, root: string = process.cwd()): AgentSpec {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid agent name: ${name}`);
  return parseAgentMarkdown(readFileSync(join(root, '.claude', 'agents', `${name}.md`), 'utf8'));
}
