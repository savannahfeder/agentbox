// What broke: a test run on the Mac crashed out of memory, and nobody knew
// which test. Measured 2026-10-25 by running every test file on its own under
// /usr/bin/time: the heaviest were the ones that start an in-process Postgres
// (PGlite). One costs about 650 MB, and 15 of the 16 files that opened one
// never shut it, so each database a file opened stayed in memory until the
// file ended. a-phone-reply-carries-on-in-the-cloud-with-the-computer-shut
// opened a fresh one before every test and peaked at 2 GB.
//
// This reads every test file as text and fails on a database it opens and
// never closes, and on one opened before each test with no afterEach to shut it.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const self = path.basename(fileURLToPath(import.meta.url));
const files = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.mjs') && f !== self)
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(testsDir, f), 'utf8') }))
  .filter((f) => /new PGlite\(/.test(f.text));

/** The names a file gives the databases it opens: `db = new PGlite(` and `const old = new PGlite(`. */
function databasesOpened(text) {
  return [...text.matchAll(/(?:const |let )?([A-Za-z_$][\w$]*)\s*=\s*new PGlite\(/g)].map((m) => m[1]);
}

/** A database opened in a beforeEach, and the file has no afterEach to shut it. */
function openedBeforeEachWithNoAfterEach(text) {
  const opensInBeforeEach = /beforeEach\(\s*async\s*\(\)\s*=>\s*\{[^}]*new PGlite\(/.test(text);
  return opensInBeforeEach && !/afterEach\(/.test(text);
}

it('finds the files that open a test database', () => {
  expect(files.length).toBeGreaterThan(0);
});

it('every database a test file opens, it closes', () => {
  const open = files.flatMap((f) => [...new Set(databasesOpened(f.text))]
    .filter((name) => !new RegExp(`\\b${name.replace('$', '\\$')}\\??\\.close\\(`).test(f.text))
    .map((name) => `${f.name}: ${name}`));
  expect(open).toEqual([]);
});

it('a database made before each test is shut after each test', () => {
  expect(files.filter((f) => openedBeforeEachWithNoAfterEach(f.text)).map((f) => f.name)).toEqual([]);
});

it('the reading catches an unclosed database and passes a closed one', () => {
  expect(databasesOpened('let db; db = new PGlite(); const old = new PGlite();')).toEqual(['db', 'old']);
  expect(databasesOpened('const x = 1;')).toEqual([]);
  expect(openedBeforeEachWithNoAfterEach('beforeEach(async () => { db = new PGlite(); });')).toBe(true);
  expect(openedBeforeEachWithNoAfterEach('beforeEach(async () => { db = new PGlite(); }); afterEach(() => db.close());')).toBe(false);
  expect(openedBeforeEachWithNoAfterEach('beforeAll(async () => { db = new PGlite(); });')).toBe(false);
});
