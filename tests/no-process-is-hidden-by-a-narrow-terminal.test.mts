// NO PROCESS IS HIDDEN BY A NARROW TERMINAL.
//
// `ps` on a Mac cuts every line to the terminal's width, and to 79 columns when
// there is no terminal, which is how it runs under a test. A headless Chrome's
// `--user-data-dir` sits well past that cut, so `processes()` handed back lines
// with no profile in them: `holdersOf` found no browser, `freeProfile` and
// `sweep` stopped nothing, and the helpers holding a profile folder open were
// left running. Linux `ps` writes the whole line into a pipe, which is why only
// macOS saw it.
//
// COLUMNS=79 puts this box in the Mac's place: with it set, all four cases of
// a-driven-browser-takes-its-helpers-and-its-profile-with-it failed here with
// the Mac's error, in the Mac's 60 seconds.
import { it, expect, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { processes } from '../scripts/lib/chrome-guard.mjs';
import { holdersOf } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';

const running = [];
const columns = process.env.COLUMNS;
afterEach(() => {
  for (const pid of running.splice(0)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  if (columns === undefined) delete process.env.COLUMNS;
  else process.env.COLUMNS = columns;
});

// Shaped like a headless Chrome's command line: flags of its own first, so the
// profile is past column 79, and the binary first, so `holdersOf` knows it.
const FLAGS = Array.from({ length: 6 }, (_, i) => `--a-flag-of-its-own-number-${i}`).join(' ');

function browserOn(profile) {
  const child = spawn('/bin/sh', ['-c', 'while :; do sleep 0.2; done', '/bin/sh', FLAGS, `--user-data-dir=${profile}`], { stdio: 'ignore' });
  running.push(child.pid);
  return child;
}

/** Up and in the table: waited for rather than slept through, so a loaded box is no trouble. */
async function listed(pid) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    if (processes().some((p) => p.pid === pid)) return;
    if (Date.now() > deadline) throw new Error(`the stand-in browser ${pid} never reached the process table`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const commandOf = (pid) => processes().find((p) => p.pid === pid)?.command ?? '';
const profilePath = (name) => path.join(os.tmpdir(), `narrow-ps-${name}-${process.pid}`);

it('hands back the whole command line when there is no terminal to measure', async () => {
  const profile = profilePath('whole');
  const child = browserOn(profile);
  process.env.COLUMNS = '79';

  await listed(child.pid);

  expect(commandOf(child.pid).length).toBeGreaterThan(79);
  expect(commandOf(child.pid)).toContain(`--user-data-dir=${profile}`);
}, 15_000);

it('finds the browser on a profile named past the cut, and no other', async () => {
  const profile = profilePath('mine');
  const child = browserOn(profile);
  process.env.COLUMNS = '79';
  await listed(child.pid);

  expect(holdersOf(profile, processes, '/bin/sh')).toContain(child.pid);
  expect(holdersOf(profilePath('theirs'), processes, '/bin/sh')).not.toContain(child.pid);
}, 15_000);

it('reads the same on a wide terminal as on a narrow one', async () => {
  const profile = profilePath('wide');
  const child = browserOn(profile);
  await listed(child.pid);

  process.env.COLUMNS = '400';
  const wide = commandOf(child.pid);
  process.env.COLUMNS = '79';

  expect(commandOf(child.pid)).toBe(wide);
  expect(wide).toContain(`--user-data-dir=${profile}`);
}, 15_000);
