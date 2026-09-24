// Azure Pipelines leaves undefined variables as the literal text "$(NAME)".
// Treat those, and empty strings, as "not set" so they never reach Claude Code or the ADO client.
const UNRESOLVED_MACRO = /^\$\([^)]*\)$/;

export function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '' && !UNRESOLVED_MACRO.test(value);
}

export function sanitizeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (isSet(value)) clean[key] = value;
  }
  return clean;
}
