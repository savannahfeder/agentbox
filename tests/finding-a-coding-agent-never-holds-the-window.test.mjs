// FINDING A CODING AGENT NEVER HOLDS THE WINDOW AFTER LAUNCH (2026-10-22).
//
// The spinning wheel came up for 5 to 10 seconds while a thread's pictures
// loaded. The app's freeze log (memory-log/freeze-*.jsonl, 10-21 and 10-22)
// put 57 of its 74 freezes, roughly 104 s of 114 s, on one line: the login
// shell main/engine-bin.mjs ran with execFileSync to find Claude Code and
// Codex whenever its thirty-second answer had run out. On 10-22 the caller was
// the phone link's read every minute, and each launch added two; opening
// Settings asks the same way. Pictures are answered on the same thread, so
// they waited too.
//
// So once launch has an answer, the finder hands back what it holds at once
// and asks the shell again off the window's thread. Launch, and Check again
// (which forgets first), still wait for the shell, because they have nothing
// to hand back yet.

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveEngine, forgetEngine, lookAgain, askShell, askShellLater, shellRunner, shellRunnerLater } from '../main/engine-bin.mjs';

const HOME = '/Users/stranger';
const never = () => false;
const settle = () => new Promise((r) => setTimeout(r, 0));

// A lookup that counts, and a later one whose answer the test hands over.
function lookups(first = { path: '/opt/old/claude', answered: true }) {
  const seen = { now: 0, later: 0 };
  let answerLater;
  return {
    seen,
    give: (a) => answerLater(a),
    how: (now) => ({
      home: HOME, env: {}, exists: (p) => /^\/opt\/(old|new|stale)\//.test(p), dangles: never, now,
      shellLookup: () => { seen.now += 1; return first; },
      shellLookupLater: () => { seen.later += 1; return new Promise((r) => { answerLater = r; }); },
    }),
  };
}

afterEach(() => { forgetEngine('claude'); forgetEngine('codex'); });

describe('a read once launch has an answer', () => {
  it('waits for the shell at launch, when nothing is held', () => {
    const l = lookups();
    expect(resolveEngine('claude', null, l.how(1_000)).path).toBe('/opt/old/claude');
    expect(l.seen).toEqual({ now: 1, later: 0 });
  });

  it('asks nothing inside the thirty seconds', () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    resolveEngine('claude', null, l.how(30_999));
    expect(l.seen).toEqual({ now: 1, later: 0 });
  });

  it('past them, answers at once with what it holds and asks again in the background', () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    const read = resolveEngine('claude', null, l.how(31_001));
    expect(read).toMatchObject({ path: '/opt/old/claude', found: true });
    expect(l.seen).toEqual({ now: 1, later: 1 });
  });

  it('takes the background answer on the next read', async () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    resolveEngine('claude', null, l.how(31_001));
    l.give({ path: '/opt/new/claude', answered: true });
    await settle();
    expect(resolveEngine('claude', null, l.how(31_002)).path).toBe('/opt/new/claude');
    expect(l.seen).toEqual({ now: 1, later: 1 });
  });

  it('starts one background ask, however many reads come while it runs', () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    for (const t of [31_001, 40_000, 90_000]) resolveEngine('claude', null, l.how(t));
    expect(l.seen.later).toBe(1);
  });

  it('keeps each engine to itself', () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    resolveEngine('codex', null, l.how(1_000));
    resolveEngine('claude', null, l.how(31_001));
    expect(l.seen).toEqual({ now: 2, later: 1 });
  });

  it('drops an answer asked for before a forget', async () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    resolveEngine('claude', null, l.how(31_001));
    forgetEngine('claude');
    l.give({ path: '/opt/stale/claude', answered: true });
    await settle();
    expect(resolveEngine('claude', null, l.how(31_002)).path).toBe('/opt/old/claude');
    expect(l.seen.now).toBe(2);
  });

  it('keeps an answer that found something when the next ask hears nothing back', async () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    resolveEngine('claude', null, l.how(31_001));
    l.give({ path: null, answered: false });
    await settle();
    expect(resolveEngine('claude', null, l.how(31_002)).path).toBe('/opt/old/claude');
    // And does not ask again on every read after it.
    expect(l.seen.later).toBe(1);
  });

  it('takes a certain no over a held yes', async () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    resolveEngine('claude', null, l.how(31_001));
    l.give({ path: null, answered: true });
    await settle();
    expect(resolveEngine('claude', null, l.how(31_002))).toMatchObject({ path: null, found: false, certain: true });
  });

  it('asks again on the next read when a background ask fails', async () => {
    let tries = 0;
    const how = (now) => ({ ...lookups().how(now), shellLookupLater: () => { tries += 1; return Promise.reject(new Error('no')); } });
    resolveEngine('claude', null, how(1_000));
    resolveEngine('claude', null, how(31_001));
    await settle();
    resolveEngine('claude', null, how(31_002));
    expect(tries).toBe(2);
  });

  it('does not call a held path found once it is gone, and is not sure of the absence either', () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    const gone = resolveEngine('claude', null, { ...l.how(2_000), exists: never });
    expect(gone).toMatchObject({ found: false, certain: false });
    expect(l.seen).toEqual({ now: 1, later: 1 });
  });
});

describe('looking again on purpose', () => {
  it('asks even inside the thirty seconds, and settles once the answer is held', async () => {
    const l = lookups();
    resolveEngine('claude', null, l.how(1_000));
    const looked = lookAgain('claude', { now: 2_000, shellLookupLater: () => ({ path: '/opt/new/claude', answered: true }) });
    await looked;
    expect(resolveEngine('claude', null, l.how(2_001)).path).toBe('/opt/new/claude');
    expect(l.seen).toEqual({ now: 1, later: 0 });
  });

  it('settles, and never throws, when the shell cannot be asked', async () => {
    await expect(lookAgain('codex', { shellLookupLater: () => { throw new Error('no shell'); } })).resolves.toBeUndefined();
  });
});

// Stand-in shells: each takes [flags, command] the way zsh -lic does.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-shells-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const shell = (name, body) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
};
const asks = shell('asks', 'exec /bin/sh -c "$2"');
// What `exec tmux` in a profile does: the shell is gone before the question.
const leaves = shell('leaves', 'exit 1');
const hangs = shell('hangs', 'exec sleep 30');
// A profile that starts something which keeps the shell's output open.
const lingers = shell('lingers', 'sleep 3 &\nexec /bin/sh -c "$2"');
const outcome = (f) => { try { return { out: f() }; } catch (e) { return { code: e.code ?? null, status: e.status ?? null }; } };
const outcomeLater = async (p) => { try { return { out: await p }; } catch (e) { return { code: e.code ?? null, status: e.status ?? null }; } };

describe('the background shell says what the waiting one says', () => {
  it.each([
    ['an answer', asks, 'echo /opt/x/claude'],
    ['a no from the shell', asks, 'command -v agentbox-nothing-by-this-name'],
    ['a shell that left before the question', leaves, 'echo /opt/x/claude'],
    ['a shell that is not there', path.join(dir, 'no-such-shell'), 'echo /opt/x/claude'],
    ['a shell ended by a signal', asks, 'kill -9 $$'],
  ])('%s', async (_, sh, command) => {
    const waited = outcome(() => shellRunner(process.env)(sh, ['-c', command], 4000));
    const later = await outcomeLater(shellRunnerLater(process.env)(sh, ['-c', command], 4000));
    expect(later).toEqual(waited);
  });

  it('ends a shell that does not answer by its deadline, and says so', async () => {
    const at = Date.now();
    const later = await outcomeLater(shellRunnerLater(process.env)(hangs, ['-c', 'true'], 300));
    expect(later.code).toBe('ETIMEDOUT');
    expect(Date.now() - at).toBeLessThan(3000);
  });

  // The shell itself answered, so what it said is kept; the waiting runner
  // threw ETIMEDOUT here after holding the window for the whole deadline.
  it('is over by its deadline even when the profile leaves something holding the output', async () => {
    const at = Date.now();
    const later = await outcomeLater(shellRunnerLater(process.env)(lingers, ['-c', 'echo /opt/x/claude'], 500));
    expect(later).toEqual({ out: '/opt/x/claude\n' });
    expect(Date.now() - at).toBeLessThan(2000);
  });

  it('reaches the same verdict as askShell over every probe', async () => {
    const env = { SHELL: asks };
    const run = (sh, args, t) => shellRunner(process.env)(sh === '/bin/zsh' || sh === '/bin/bash' ? asks : sh, args, t);
    const runLater = (sh, args, t) => shellRunnerLater(process.env)(sh === '/bin/zsh' || sh === '/bin/bash' ? asks : sh, args, t);
    for (const bin of ['sh', 'agentbox-nothing-by-this-name']) {
      expect(await askShellLater({ env, bin, run: runLater })).toEqual(askShell({ env, bin, run }));
    }
  });
});
