// THE WINDOW WAITS ON NO NEW SUBPROCESS (2026-10-22).
//
// A synchronous child process in the app's own process stops everything that
// process does until the child exits: the window's input, its IPC and every
// picture in a thread. The spinning wheel of 10-22 was one of these, a login
// shell asked once a minute, held 6.5 s, 9.3 s and 6.5 s while the Mac was
// busy (tests/finding-a-coding-agent-never-holds-the-window). The freeze log
// also had git at 0.8 s in main/git-change.mts.
//
// So the ones that remain are listed here with when they run, and a new one
// fails this test. Turning one into an async call means lowering its number.
// It counts places, not callers: the 10-22 freeze was an old place reached
// from a new timer, which only the freeze log (main/freeze-recorder.mts) shows.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED = {
  'main/engine-bin.mts': [1, 'at launch, and when someone undoes a file they picked; every other look is in the background'],
  'main/source-updater.mts': [1, 'at launch'],
  'main/first-run.mts': [1, 'once, during the walk'],
  'main/supervisor.mts': [1, 'once per Mac, behind a flag file'],
  'main/start-hold.mts': [1, 'sysctl once before a restart brings agents back, two second deadline'],
  'main/task-folders.mts': [2, 'when a task folder is made or put away'],
  'main/worktree-include.mts': [3, 'when a task folder is made'],
  'main/harnesses/instructions-file.mts': [1, 'when a run starts'],
  'main/task-terminals.mts': [1, "when a task's terminal closes, two second deadline"],
  'main/git-change.mts': [1, 'a change card reading git; 0.8 s seen in the freeze log, next to move'],
  'main/cloud/org.mts': [1, "reading the cloud account's settings repository"],
  'main/cloud/host.mts': [1, 'runs in its own process, not the window\'s'],
  'scripts/brand-electron.mjs': [1, 'codesign, just before the app restarts itself from source'],
};
// Scripts the app's own process imports (main/main.mts, main/source-updater.mts).
const IMPORTED_SCRIPTS = ['scripts/brand-electron.mjs', 'scripts/linux-launcher.mjs'];

function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(rel);
    return /\.(mjs|mts|cjs|js)$/.test(e.name) ? [rel] : [];
  });
}
const BLOCKING = /\b(execFileSync|spawnSync|execSync)\(/g;
const countIn = (text) => text.split('\n')
  .filter((line) => !/^\s*(\/\/|\*)/.test(line))
  .reduce((n, line) => n + (line.match(BLOCKING)?.length ?? 0), 0);
const count = (rel) => countIn(fs.readFileSync(path.join(root, rel), 'utf8'));

describe("blocking subprocess calls in the app's own process", () => {
  const found = Object.fromEntries([...['main', 'shared'].flatMap(files), ...IMPORTED_SCRIPTS].map((rel) => [rel, count(rel)]).filter(([, n]) => n > 0));

  it('reads every script the app imports', () => {
    const imported = ['main', 'shared'].flatMap(files)
      .flatMap((rel) => [...fs.readFileSync(path.join(root, rel), 'utf8').matchAll(/['"](?:\.\.\/)+(scripts\/[^'"]+\.mjs)['"]/g)].map((m) => m[1]));
    expect([...new Set(imported)].sort()).toEqual([...IMPORTED_SCRIPTS].sort());
  });

  it('are only the listed ones, as many as listed', () => {
    expect(found).toEqual(Object.fromEntries(Object.entries(ALLOWED).map(([rel, [n]]) => [rel, n])));
  });

  it('counts a call, and not a comment or an async call', () => {
    expect(countIn("const out = execFileSync('git', ['status']);")).toBe(1);
    expect(countIn("  r = spawnSync(perl, []); s = execSync('ls');")).toBe(2);
    expect(countIn("// execFileSync('git') in a comment\n * spawnSync() in a doc")).toBe(0);
    expect(countIn("await execFileAsync('git'); spawn('git'); execFile('git')")).toBe(0);
  });
});
