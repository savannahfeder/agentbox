// THE TESTS THAT READ A FILE AS TEXT, which `vitest related` cannot see.
//
// `vitest related <files>` runs the tests that IMPORT what changed. Many tests
// here read a source file with readFileSync instead and check what it says,
// and those are invisible to it: on 2026-10-04 a359d81 shipped with three of
// them red because a change to Thread.tsx ran one test file, not four
// (tests/tooling/a-test-that-reads-a-file-runs-when-that-file-changes.test.mjs).
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
  const sources = changed.filter(Boolean);
  if (!sources.length) return [];
  const patterns = sources.map((f) => {
    const name = path.basename(f);
    // The name standing alone in quotes (a path.join piece), or closing a
    // longer quoted path or URL after a slash.
    return new RegExp(`['"\`](?:[^'"\`\\n]*/)?${escape(name)}['"\`]`);
  });
  // Match Vitest's nested tests/** scope, but never walk symlinked directories.
  function walk(dir, prefix = 'tests') {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) found.push(...walk(path.join(dir, entry.name), relative));
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')) found.push(relative);
    }
    return found;
  }
  let files;
  try { files = walk(path.join(root, 'tests')).sort(); } catch (error) {
    if (error.code === 'ENOENT' && !fs.existsSync(path.join(root, 'tests'))) return [];
    throw error;
  }
  const out = [];
  for (const f of files) {
    let text = '';
    text = fs.readFileSync(path.join(root, f), 'utf8');
    if (patterns.some((re) => re.test(text))) out.push(f);
  }
  return out;
}

const invoked = (() => { try { return fs.realpathSync(process.argv[1] ?? ''); } catch { return ''; } })();
if (invoked && invoked === fs.realpathSync(fileURLToPath(import.meta.url))) {
  for (const t of testsThatRead(process.argv.slice(2))) console.log(t);
}
