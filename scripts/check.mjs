#!/usr/bin/env node
// CI check: every generated file matches what scripts/generate.mjs writes, the
// Cursor and Agent Plugins manifests pass their published JSON schemas, versions
// agree and every named asset exists.
// Schemas are fetched from their publishers; the copies in scripts/schemas/ are
// the fallback when offline, and a difference between the two is reported.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_DIR, ROOT, loadSource, render } from './generate.mjs';

const SCHEMAS = [
  {
    file: '.cursor-plugin/plugin.json',
    vendored: 'scripts/schemas/cursor/plugin.schema.json',
    url: 'https://raw.githubusercontent.com/cursor/plugins/main/schemas/plugin.schema.json',
  },
  {
    file: '.cursor-plugin/marketplace.json',
    vendored: 'scripts/schemas/cursor/marketplace.schema.json',
    url: 'https://raw.githubusercontent.com/cursor/plugins/main/schemas/marketplace.schema.json',
  },
  {
    file: 'plugin.json',
    vendored: 'scripts/schemas/agent-plugins/plugin.schema.json',
    url: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  },
  {
    file: 'mcp.json',
    vendored: 'scripts/schemas/agent-plugins/mcp.schema.json',
    url: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  },
];

const errors = [];
const notes = [];

// 1. Generated files are up to date.
const files = render(loadSource());
for (const [path, expected] of Object.entries(files)) {
  const full = join(ROOT, path);
  if (!existsSync(full)) errors.push(`${path} is missing; run node scripts/generate.mjs`);
  else if (!readFileSync(full).equals(Buffer.from(expected)))
    errors.push(`${path} differs from what scripts/generate.mjs writes; run it (don't edit generated files by hand)`);
}

// 2. Schemas.
for (const { file, vendored, url } of SCHEMAS) {
  const local = readFileSync(join(ROOT, vendored), 'utf8');
  let text = local;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
    if (text !== local) notes.push(`${url} has changed since ${vendored} was saved; validated against the published one`);
  } catch (e) {
    notes.push(`could not fetch ${url} (${e.message}); validated against ${vendored}`);
  }
  const schema = JSON.parse(text);
  const value = JSON.parse(files[file]);
  for (const problem of validate(value, schema, schema, '')) errors.push(`${file}${problem}`);
}

// 3. Every manifest carries the same version (Cursor's CI and xAI's catalog bot rely on it).
const version = loadSource().version;
for (const path of Object.keys(files).filter((p) => p.endsWith('.json') && !p.includes('marketplace'))) {
  const v = JSON.parse(files[path]).version;
  if (v !== undefined && v !== version) errors.push(`${path} has version ${v}, expected ${version}`);
}

// 4. Every asset a manifest names exists, relative to its plugin's folder.
for (const [path, contents] of Object.entries(files)) {
  if (!path.endsWith('.json')) continue;
  const base = path.startsWith(`${CLAUDE_DIR}/`) ? CLAUDE_DIR : '';
  for (const [, asset] of contents.matchAll(/"(?:\.\/)?(assets\/[^"]+)"/g))
    if (!existsSync(join(ROOT, base, asset))) errors.push(`${path} names ${join(base, asset)}, which does not exist`);
}

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
console.log(`ok: ${Object.keys(files).length} generated files up to date, ${SCHEMAS.length} schemas pass`);

// A small JSON Schema validator: the keywords Cursor's draft-07 and Agent Plugins'
// draft 2020-12 schemas use, with local $refs. `format` is not asserted.
function validate(value, schema, root, at) {
  if (schema === true) return [];
  if (schema === false) return [`${at || '/'}: not allowed`];
  if (schema.$ref) {
    const target = schema.$ref
      .replace(/^#\//, '')
      .split('/')
      .reduce((node, key) => node?.[key], root);
    if (!target) return [`${at}: unresolved $ref ${schema.$ref}`];
    return validate(value, target, root, at);
  }

  const out = [];
  const here = at || '/';
  if (schema.type && !types(schema.type).some((t) => is(t, value))) return [`${here}: expected ${schema.type}`];
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const))
    out.push(`${here}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value)))
    out.push(`${here}: must be one of ${JSON.stringify(schema.enum)}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${here}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${here}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) out.push(`${here}: does not match ${schema.pattern}`);
  }

  if (Array.isArray(value)) {
    if (schema.items) value.forEach((item, i) => out.push(...validate(item, schema.items, root, `${at}/${i}`)));
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${here}: fewer than ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
      out.push(`${here}: items are not unique`);
  }

  if (is('object', value)) {
    const keys = Object.keys(value);
    for (const key of schema.required ?? []) if (!(key in value)) out.push(`${here}: missing ${key}`);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties)
      out.push(`${here}: fewer than ${schema.minProperties} properties`);
    for (const key of keys) {
      const child = `${at}/${key}`;
      if (schema.propertyNames) out.push(...validate(key, schema.propertyNames, root, child));
      if (schema.properties && key in schema.properties) out.push(...validate(value[key], schema.properties[key], root, child));
      else if (schema.additionalProperties !== undefined)
        out.push(...validate(value[key], schema.additionalProperties, root, child).map((e) =>
          schema.additionalProperties === false ? `${child}: unknown property` : e,
        ));
    }
  }

  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s) => validate(value, s, root, at).length === 0).length;
    if (passing !== 1) out.push(`${here}: must match exactly one schema in oneOf (matches ${passing})`);
  }
  if (schema.anyOf && !schema.anyOf.some((s) => validate(value, s, root, at).length === 0))
    out.push(`${here}: must match a schema in anyOf`);
  if (schema.allOf) for (const s of schema.allOf) out.push(...validate(value, s, root, at));
  if (schema.not && validate(value, schema.not, root, at).length === 0) out.push(`${here}: must not match`);
  return out;
}

function types(type) {
  return Array.isArray(type) ? type : [type];
}

function is(type, value) {
  switch (type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'integer':
      return Number.isInteger(value);
    case 'null':
      return value === null;
    default:
      return typeof value === type;
  }
}
