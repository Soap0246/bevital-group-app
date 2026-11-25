/**
 * Client ↔ schema contract test.
 *
 * Neither app can be type-checked against the database (supabase-js is untyped here), so this test
 * statically scans their source and verifies, against the real migrated schema, that:
 *   • every .from('table') names an existing table
 *   • every plain column in a .select('...') exists (embedded selects are checked recursively)
 *   • every PostgREST relationship hint (!constraint_name) exists and points at the embedded table
 *   • every .rpc('fn', { p_x }) calls an existing function with parameter names that exist
 * It prevents the classic "works in TypeScript, fails at runtime" drift.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_DIRS = [path.join(ROOT, 'apps/mobile/src'), path.join(ROOT, 'apps/admin/src')];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) walk(p, out); }
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Split a PostgREST select string on top-level commas. */
function splitTop(s) {
  const parts = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

describe('app code ↔ database schema contract', () => {
  let cols, tables, fks, funcs;
  const files = SOURCE_DIRS.flatMap((d) => walk(d));

  before(async () => {
    const db = await createDb({ devSeed: false });
    const c = await db.query(`select table_name, column_name from information_schema.columns where table_schema = 'public'`);
    cols = new Map();
    for (const r of c.rows) cols.set(r.table_name, (cols.get(r.table_name) ?? new Set()).add(r.column_name));
    tables = new Set(cols.keys());
    const f = await db.query(`
      select con.conname, src.relname as src, dst.relname as dst
        from pg_constraint con join pg_class src on src.oid = con.conrelid join pg_class dst on dst.oid = con.confrelid
       where con.contype = 'f' and src.relnamespace = 'public'::regnamespace`);
    fks = new Map(f.rows.map((r) => [r.conname, r]));
    const p = await db.query(`
      select p.proname, p.proargnames from pg_proc p where p.pronamespace = 'public'::regnamespace`);
    funcs = new Map();
    for (const r of p.rows) funcs.set(r.proname, new Set(r.proargnames ?? []));
  });

  const problems = [];
  const checkSelect = (table, select, where) => {
    for (const token of splitTop(select)) {
      if (token === '*') continue;
      const m = /^(?:(\w+):)?(\w+)(?:!(\w+))?\((.*)\)$/s.exec(token);
      if (m) {
        const [, , rel, hint, inner] = m;
        let relTable = rel;
        if (hint) {
          const fk = fks.get(hint);
          if (!fk) { problems.push(`${where}: relationship hint "${hint}" does not exist`); continue; }
          relTable = fk.src === table ? fk.dst : fk.src;
          if (fk.dst !== rel && fk.src !== rel && relTable !== rel) problems.push(`${where}: hint "${hint}" does not connect ${table} and ${rel}`);
          relTable = rel;
        }
        if (!tables.has(relTable)) { problems.push(`${where}: embedded table "${relTable}" does not exist`); continue; }
        checkSelect(relTable, inner, where);
        continue;
      }
      const name = token.replace(/^\w+:/, '').replace(/::\w+$/, '').trim();
      if (!/^\w+$/.test(name)) continue;
      if (!cols.get(table)?.has(name)) problems.push(`${where}: column "${table}.${name}" does not exist`);
    }
  };

  it('every table referenced by .from() exists', () => {
    const missing = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) {
        if (!tables.has(m[1]) && !/storage/.test(src.slice(Math.max(0, m.index - 30), m.index))) missing.push(`${path.relative(ROOT, f)}: ${m[1]}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('every column and relationship in .select() strings exists', () => {
    let checked = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const re = /\.from\(\s*["'`](\w+)["'`]\s*\)\s*\.select\(\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2/gs;
      for (const m of src.matchAll(re)) {
        if (!tables.has(m[1])) continue;
        checkSelect(m[1], m[3], `${path.relative(ROOT, f)} → ${m[1]}`);
        checked++;
      }
      // selects held in constants (e.g. BOOKING_SELECT) used with the bookings table
      for (const m of src.matchAll(/const (\w*SELECT)\s*=\s*`([^`]*)`/g)) {
        checkSelect('bookings', m[2], `${path.relative(ROOT, f)} → ${m[1]}`);
        checked++;
      }
    }
    assert.ok(checked > 40, `expected to scan many selects, scanned ${checked}`);
    assert.deepEqual(problems, []);
  });

  it('every .rpc() call targets an existing function with valid parameter names', () => {
    const bad = []; let checked = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.rpc\(\s*["'`](\w+)["'`]\s*(?:,\s*\{([^}]*)\})?/gs)) {
        checked++;
        const params = funcs.get(m[1]);
        if (!params) { bad.push(`${path.relative(ROOT, f)}: function ${m[1]} does not exist`); continue; }
        for (const k of (m[2] ?? '').matchAll(/\b(p_\w+)\s*:/g)) {
          if (!params.has(k[1])) bad.push(`${path.relative(ROOT, f)}: ${m[1]} has no parameter ${k[1]}`);
        }
      }
    }
    assert.ok(checked >= 15, `expected to scan many rpc calls, scanned ${checked}`);
    assert.deepEqual(bad, []);
  });
});
