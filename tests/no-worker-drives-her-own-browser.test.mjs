// NO WORKER EVER DRIVES THE BROWSER SHE ACTUALLY USES.
//
// Her decision on w-5ebf7bf7bb, 2026-09-23, while the parity project was
// weighing browser support: having Claude Code drive your real browser is
// viable, she does not want to use it, and she does not want Claude Code to have
// the ability at all. If browser work is ever built here it needs careful
// permissioning first.
//
// The reason it is a test and not a note: the flag that would do it is one word,
// `--chrome`, and it would be an easy thing for a later session to add in good
// faith while chasing parity with the terminal clients. The browser she uses is
// signed into everything she has, so an agent with the keyboard there holds every
// account she holds, and no per-run approval makes that legible in the moment.
//
// A browser an agent may drive has to carry nothing. The app already ships one:
// the pane on the `persist:junk` partition, a separate store with no logins in
// it, described in main/main.mjs as a browser a human drives. That is the only
// door this may come through, and it needs its own permission design first.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** Everything that builds or spawns a session. */
const SPAWNING = ['main', 'shared'];

function* files(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(rel);
    else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.cjs')) yield rel;
  }
}

describe('the browser an agent may reach', () => {
  it('is never the one she is signed into', () => {
    const offenders = [];
    for (const dir of SPAWNING) {
      for (const rel of files(dir)) {
        const text = read(rel);
        // The flag itself, however it is quoted, and the same thing spelled as
        // an argument in a list.
        if (/['"`]--chrome['"`]/.test(text)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is the pane the app ships, which carries no logins', () => {
    // If this line ever goes, the sentence above stops being true and the rule
    // in CLAUDE.md has nothing behind it.
    expect(read('main/main.mjs')).toContain("session.fromPartition('persist:junk')");
  });

  it('is written down where a session will read it before it builds one', () => {
    const law = read('CLAUDE.md');
    expect(law).toContain('NO WORKER EVER DRIVES THE USER'); // the heading
    expect(law).toContain('--chrome');
  });
});
