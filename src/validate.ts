import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchemaObject, ValidateFunction } from 'ajv';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });

export function loadSchema(path: string): AnySchemaObject {
  return JSON.parse(readFileSync(path, 'utf8')) as AnySchemaObject;
}

export function compileSchema(schema: AnySchemaObject): ValidateFunction {
  // Ajv refuses to register the same $id twice; reuse the compiled validator instead.
  const id = typeof schema.$id === 'string' ? schema.$id : undefined;
  const existing = id === undefined ? undefined : ajv.getSchema(id);
  return existing ?? ajv.compile(schema);
}

export function validate(schema: AnySchemaObject, data: unknown): ValidationResult {
  const check = compileSchema(schema);
  const valid = check(data);
  const errors = (check.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
  return { valid, errors };
}
