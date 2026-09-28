// FOUND WHILE HARDENING THE SPOOL, AND NOT ONE OF THE THREE THAT WERE REPORTED
// (2026-09-04).
//
// `listPending` read every `*.request.json` in the spool with a bare
// `fs.readFileSync`, which follows links and opens whatever it finds. The spool
// is worker-writable, and both of those are reachable:
//
// - A NAMED PIPE named `<uuid>.request.json` HANGS AGENTBOX'S MAIN PROCESS.
//   `readFileSync` on a fifo with no writer blocks in a synchronous call, so
//   the app stops -- no cards, no inbox, no menu, no ⌘R -- until somebody
//   writes to the pipe or kills it. `mkfifo` is one command and the spool is
//   `additionalDirectories`. Measured: opening the same fifo with O_NONBLOCK
//   and asking `fstat` returns immediately and says `isFIFO`.
//
// - A REQUEST SYMLINKED AT ONE OF HER FILES makes Agentbox read that file every
//   time the snapshot polls. It cannot be shown on a card (it will not parse as
//   the request shape) but there is no reason for the app to open it at all.
//
// - AND SIZE WAS UNBOUNDED. A worker can write a gigabyte and Agentbox would read
//   all of it into memory on every poll of the inbox.
//
// So the spool opens with O_RDONLY|O_NOFOLLOW|O_NONBLOCK, asks `fstat` what it
// actually got, and reads only a regular file of a sane size. Anything else is
// skipped exactly the way an unparseable request has always been skipped.

import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listPending, spoolDir, MAX_REQUEST_BYTES } from '../main/approvals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');

const dirs = [];
function spool() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-notafile-'));
  dirs.push(root);
  const dir = spoolDir(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'real.request.json'),
    JSON.stringify({ id: 'real', at: 1, product: 'agentbox', item: 'w-1', tool: 'Bash', input: { command: 'echo hi' } }));
  return { root, dir };
}
afterAll(() => { for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

describe('a named pipe wearing a request file\'s name', () => {
  it('does not stop the app that reads the spool', () => {
    const { root, dir } = spool();
    execFileSync('mkfifo', [path.join(dir, 'pipe.request.json')]);

    // IN A CHILD, WITH A DEADLINE, ON PURPOSE. The unfixed `readFileSync`
    // blocks inside a synchronous call, so a vitest timeout could not fire and
    // this file would take the whole suite down with it rather than going red.
    const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-probe-'));
    dirs.push(probeDir);
    const probe = path.join(probeDir, 'probe.mjs');
    fs.writeFileSync(probe, `import { listPending } from ${JSON.stringify(path.join(repo, 'main', 'approvals.mjs'))};\n`
      + 'process.stdout.write(JSON.stringify(listPending(process.argv[2]).map((r) => r.id)));\n');
    const ran = spawnSync(process.execPath, [probe, root], { timeout: 8_000, encoding: 'utf8' });

    // RED IF THE FIX IS REVERTED: the child never exits, so `status` is null
    // and it is killed on the timeout.
    expect({ status: ran.status, signal: ran.signal }).toEqual({ status: 0, signal: null });
    expect(JSON.parse(ran.stdout)).toEqual(['real']);
  }, 20_000);
});

describe('a request file that is really a link to one of hers', () => {
  it('is skipped rather than opened', () => {
    const { root, dir } = spool();
    const hers = path.join(root, 'founder.md');
    fs.writeFileSync(hers, JSON.stringify({ id: 'linked', at: 0, tool: 'Bash', input: {} }));
    fs.symlinkSync(hers, path.join(dir, 'linked.request.json'));

    expect(listPending(root).map((r) => r.id)).toEqual(['real']);
  });

  it('and so is a directory, and a request too big to be one', () => {
    const { root, dir } = spool();
    fs.mkdirSync(path.join(dir, 'folder.request.json'));
    // PERFECTLY VALID JSON, and only the size keeps it out. Written as garbage
    // the first time, which meant it was skipped for being unparseable and the
    // cap was never actually under test -- found by reverting the fix and
    // watching this stay green.
    fs.writeFileSync(path.join(dir, 'huge.request.json'), JSON.stringify(
      { id: 'huge', at: 0, product: null, item: null, tool: 'Bash', input: { command: 'x'.repeat(MAX_REQUEST_BYTES) } }));
    expect(fs.statSync(path.join(dir, 'huge.request.json')).size).toBeGreaterThan(MAX_REQUEST_BYTES);

    expect(listPending(root).map((r) => r.id)).toEqual(['real']);
  });

  it('reads a request right up to the size a real one could be', () => {
    // The case that must NOT match: the cap is a guard against a worker filling
    // memory, never a reason to drop a card. main/codex-approvals.mjs already
    // cuts a card's text at CARD_CAP (4,000 characters), so anything near the
    // cap here is far past any honest request.
    const { root, dir } = spool();
    const command = 'e'.repeat(MAX_REQUEST_BYTES - 200);
    fs.writeFileSync(path.join(dir, 'big.request.json'),
      JSON.stringify({ id: 'big', at: 2, product: null, item: null, tool: 'Bash', input: { command } }));
    expect(fs.statSync(path.join(dir, 'big.request.json')).size).toBeLessThanOrEqual(MAX_REQUEST_BYTES);

    expect(listPending(root).map((r) => r.id).sort()).toEqual(['big', 'real']);
  });
});
