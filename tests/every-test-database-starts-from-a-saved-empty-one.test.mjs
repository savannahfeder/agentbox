// EVERY TEST DATABASE STARTS FROM A SAVED EMPTY ONE (w-8c1e33ee94).
//
// What broke: on 2026-11-04 a 16 GB Mac was barely usable, with four vitest
// workers at about 2 GB each. Measured that day on the whole suite, one file
// per worker: the median test file peaked at 90 MB, and every one of the 23
// files that open a PGlite database peaked at 770-1,100 MB. The peak is
// PGlite building a new database cluster (initdb) when it opens, before any
// migration runs: 865 MB and 3.9 s for `new PGlite()`, against 402 MB and
// 0.8 s for the same database loaded from a saved copy of an empty one.
//
// So tests open `new PGlite(await emptyDatabase())`, which loads that copy.
// It is built once per PGlite version per machine, in the temp folder.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { emptyDatabase, savedEmptyDatabasePath } from './an-empty-test-database.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const self = path.basename(fileURLToPath(import.meta.url));

describe('the test files', () => {
  const opening = fs.readdirSync(testsDir)
    .filter((f) => f.endsWith('.test.mjs') && f !== self)
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(testsDir, f), 'utf8') }))
    .filter((f) => /new PGlite\(/.test(f.text));

  it('include some that open a test database', () => {
    expect(opening.length).toBeGreaterThan(0);
  });

  it('open every database from the saved empty one', () => {
    // Statements only, so the sample strings in every-test-database-is-shut are not read as code.
    const fresh = opening.flatMap((f) => [...f.text.matchAll(/^\s*(?:const |let )?[\w$]+\s*=\s*new PGlite\(([^)]*)\)/gm)]
      .filter((m) => !/emptyDatabase\(/.test(m[1]))
      .map(() => f.name));
    expect(fresh).toEqual([]);
  });
});

describe('the saved empty database', () => {
  it('opens as a working database that takes roles, schemas and row rules', async () => {
    const db = new PGlite(await emptyDatabase());
    try {
      await db.exec(`
        create role authenticated;
        create schema auth;
        create table public.notes (id int primary key, body text);
        alter table public.notes enable row level security;
        insert into public.notes values (1, 'hello');
      `);
      const { rows } = await db.query('select body from public.notes');
      expect(rows).toEqual([{ body: 'hello' }]);
    } finally {
      await db.close();
    }
  });

  it('starts empty each time, so one test file cannot see another\'s rows', async () => {
    const a = new PGlite(await emptyDatabase());
    try {
      await a.exec('create table public.left_behind (id int);');
    } finally {
      await a.close();
    }
    const b = new PGlite(await emptyDatabase());
    try {
      const { rows } = await b.query("select count(*)::int as n from pg_tables where tablename = 'left_behind'");
      expect(rows[0].n).toBe(0);
    } finally {
      await b.close();
    }
  });

  it('keeps a small buffer cache, which a test database never fills', async () => {
    const db = new PGlite(await emptyDatabase());
    try {
      const { rows } = await db.query('show shared_buffers');
      expect(rows[0].shared_buffers).toBe('16MB');
    } finally {
      await db.close();
    }
  });

  it('is built once and then reused, not built again for every file', async () => {
    await emptyDatabase();
    const file = savedEmptyDatabasePath();
    const before = fs.statSync(file).mtimeMs;
    await emptyDatabase();
    expect(fs.statSync(file).mtimeMs).toBe(before);
  });

  it('is named for the PGlite version, so an upgrade builds a new one', () => {
    const { version } = JSON.parse(fs.readFileSync(path.join(testsDir, '..', 'node_modules', '@electric-sql', 'pglite', 'package.json'), 'utf8'));
    expect(path.basename(savedEmptyDatabasePath())).toContain(version);
  });
});
