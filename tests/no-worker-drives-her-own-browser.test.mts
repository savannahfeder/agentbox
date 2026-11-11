// NO WORKER DRIVES A PERSON'S OWN BROWSER UNLESS THEY TURNED IT ON.
//
// Her decision on w-5ebf7bf7bb, 2026-09-23: having Claude Code drive your real
// browser is viable, she does not want to use it, and she does not want Claude
// Code to have the ability at all; if it is ever built it needs careful
// permissioning first. On w-007ab2ab26, 2026-11-09, she narrowed it: "that
// shouldn't be a rule for everyone as it might block some users, but i do llike
// it as a rule for me." So it became a switch, off on every computer until its
// person turns it on (tests/an-agent-uses-your-chrome-only-once-you-turn-it-on).
//
// The reason it is still a test and not a note: the flag is one word,
// `--chrome`, and an easy thing for a later session to add in good faith while
// chasing parity with the terminal clients. The browser a person uses is signed
// into everything they have, so it may come in through one file, behind that
// switch, and nowhere else.
//
// A browser an agent may drive without asking has to carry nothing: the pane on
// the `persist:junk` partition, a separate store with no logins in it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** Everything that builds or spawns a session. */
const SPAWNING = ['main', 'shared'];
const THE_ONE_DOOR = path.join('main', 'your-chrome.mts');

function* files(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(rel);
    else if (/\.(mjs|mts|cjs)$/.test(entry.name)) yield rel;
  }
}

describe('the browser an agent may reach', () => {
  it('is the person’s own only through the one file behind their switch', () => {
    const naming = [];
    for (const dir of SPAWNING) {
      for (const rel of files(dir)) {
        // The flag itself, however it is quoted, and the same thing spelled as
        // an argument in a list.
        if (/['"`]--chrome['"`]/.test(read(rel))) naming.push(rel);
      }
    }
    expect(naming).toEqual([THE_ONE_DOOR]);
  });

  it('is behind a switch that is only on when saved as true', () => {
    expect(read(THE_ONE_DOOR)).toContain('config?.agentsUseYourChrome !== true');
  });

  it('is the pane the app ships, which carries no logins, when nobody turned it on', () => {
    expect(read('main/main.mts')).toContain("session.fromPartition('persist:junk')");
  });

  it('is written down where a session will read it before it builds one', () => {
    const law = read('CLAUDE.md');
    expect(law).toContain('NO WORKER EVER DRIVES THE USER'); // the heading
    expect(law).toContain('--chrome');
    expect(law).toContain('main/your-chrome.mts');
  });
});
