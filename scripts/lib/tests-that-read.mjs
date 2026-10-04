// THE TESTS THAT READ A FILE AS TEXT, which `vitest related` cannot see.
//
// `vitest related <files>` runs the tests that IMPORT what changed. Many tests
// here read a source file with readFileSync instead and check what it says,
// and those are invisible to it: on 2026-10-04 a359d81 shipped with three of
// them red because a change to Thread.tsx ran one test file, not four
// (tests/a-test-that-reads-a-file-runs-when-that-file-changes.test.mjs).
//
// A test reads a file when its text names it the ways tests here do: the
// repo path ('renderer/src/components/Thread.tsx'), a URL ending in it, or
// path.join pieces ending in the file's own name ('components', 'Thread.tsx').
// A quoted name is required, so a comment that merely says "Thread" does not
// count, and 'AgentThread.tsx' is not 'Thread.tsx'.
//
// Usage: node scripts/lib/tests-that-read.mjs <changed files...>
//   prints one test file per line.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function testsThatRead(changed, root = process.cwd()) {
  const sources = changed.filter((f) => f && !f.startsWith('tests/'));
  if (!sources.length) return [];
  const patterns = sources.map((f) => {
    const name = path.basename(f);
    // The name standing alone in quotes (a path.join piece), or closing a
    // longer quoted path or URL after a slash.
    return new RegExp(`['"\`](?:[^'"\`\\n]*/)?${escape(name)}['"\`]`);
  });
  let files = [];
  try { files = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.mjs')); } catch { return []; }
  const out = [];
  for (const f of files) {
    let text = '';
    try { text = fs.readFileSync(path.join(root, 'tests', f), 'utf8'); } catch { continue; }
    if (patterns.some((re) => re.test(text))) out.push(`tests/${f}`);
  }
  return out;
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  for (const t of testsThatRead(process.argv.slice(2))) console.log(t);
}
