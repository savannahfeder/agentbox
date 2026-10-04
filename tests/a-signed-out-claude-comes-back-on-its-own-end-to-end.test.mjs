// A SIGNED-OUT CLAUDE COMES BACK ON ITS OWN, PROVED WITH REAL PROCESSES.
//
// 2026-10-04: her Claude Code login expired at about 11:30 and every agent
// stopped. She typed /login, pressed Resume all agents, and replied "continue",
// and her rows stayed "Queued" until a fixed half-hour bench ran out at 12:04.
// cda2a8a fixed it, and tests/agents-come-back-the-moment-she-signs-in-again
// pins each piece by calling the supervisor's methods directly. This file is
// the end-to-end proof that the pieces meet: a real Store on disk, a real
// Supervisor driving real ticks, and a real child process standing in for the
// `claude` binary. The stand-in fails exactly the way her CLI did ("Failed to
// authenticate: OAuth session expired and could not be refreshed", an error
// result, exit 1) until a login is written into its home, then works.
//
// Measured when this was written: from the login landing to the worker
// starting took one tick, under a second on the clock (the number is printed
// by the test as `sign-in to spawn`).

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const PRODUCT = 'myproduct';
const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';

let root, home, data, log, fake, savedPerson;
let store, sup;

// The stand-in for `claude`. Paths are baked in because the supervisor scrubs
// CLAUDE_* from a worker's environment. It logs every worker run (the row
// namer also calls the binary, with `-p <prompt> --model`; those are told apart
// by `stream-json`, which only a worker run asks for).
const writeFake = () => {
  const src = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const worker = args.includes('stream-json');
const login = ${JSON.stringify(path.join('HOME_PLACEHOLDER', '.claude.json'))};
let signedIn = false;
try { signedIn = JSON.parse(fs.readFileSync(login, 'utf8')).signedIn === true; } catch {}
if (worker) fs.appendFileSync(${JSON.stringify('LOG_PLACEHOLDER')}, (signedIn ? 'in' : 'out') + '\\n');
if (!worker) { process.stdout.write('A short name'); process.exit(0); }
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
if (!signedIn) {
  out({ type: 'system', subtype: 'init', session_id: 'sess-out-' + process.pid });
  out({ type: 'result', subtype: 'success', is_error: true, result: ${JSON.stringify(SIGNED_OUT)}, session_id: 'sess-out-' + process.pid });
  process.stderr.write(${JSON.stringify(SIGNED_OUT)} + '\\n');
  setTimeout(() => process.exit(1), 50);
} else {
  // Signed in, and speaking the same stream-json the real CLI does: the prompt
  // arrives on stdin as a user message, is echoed back (--replay-user-messages),
  // answered, and the process stays up until the app closes its input.
  out({ type: 'system', subtype: 'init', session_id: 'sess-in-' + process.pid });
  let buf = '';
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let at;
    while ((at = buf.indexOf('\\n')) >= 0) {
      const line = buf.slice(0, at); buf = buf.slice(at + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type !== 'user') continue;
      out({ ...msg, session_id: 'sess-in-' + process.pid });
      out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done. The toggle is in.' }] }, session_id: 'sess-in-' + process.pid });
      out({ type: 'result', subtype: 'success', is_error: false, result: 'Done. The toggle is in.', session_id: 'sess-in-' + process.pid });
    }
  });
  process.stdin.on('end', () => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}
`.replace('HOME_PLACEHOLDER', home).replace('LOG_PLACEHOLDER', log);
  fs.writeFileSync(fake, src, { mode: 0o755 });
};

const runs = () => { try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
const signIn = () => {
  const file = path.join(home, '.claude.json');
  fs.writeFileSync(file, JSON.stringify({ signedIn: true }));
  // A clear step past the moment the trouble was noted, whatever the clock's grain.
  const t = Date.now() / 1000 + 2;
  fs.utimesSync(file, t, t);
};
const waitFor = async (cond, ms = 5000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (cond()) return true; await new Promise((r) => setTimeout(r, 20)); }
  return cond();
};
// One real tick, then wait for whatever it spawned to finish and be reaped.
const tickAndSettle = async () => {
  await sup.tick();
  await waitFor(() => !sup._preparing?.size && !sup.sessions.size);
};
const row = (id) => store.readItem(PRODUCT, id, Date.now());

const build = async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-out-e2e-'));
  home = path.join(root, 'home');
  data = path.join(root, 'data');
  log = path.join(root, 'claude-runs.log');
  fake = path.join(root, 'claude');
  fs.mkdirSync(home);
  fs.mkdirSync(data);
  // Signed out: the login file exists from before, holding nothing.
  fs.writeFileSync(path.join(home, '.claude.json'), '{}');
  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(path.join(home, '.claude.json'), old, old);
  writeFake();
  const dir = path.join(root, PRODUCT);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: PRODUCT, name: 'My Product' }));
  const config = {
    home, accountRoot: root, storeRoot: root, products: [], personalProducts: [],
    accountId: 'nobody', claudeBin: fake, storeMcpCommand: null,
    authProfiles: ['default'], maxConcurrentSessions: 3, sessionArgs: [],
    autonomousProducts: [PRODUCT],
  };
  store = await new Store(config).init();
  sup = new Supervisor(config, store, root, data);
  // No naming pass or message sorting in the way; they are not under test.
  sup.nameTheRows = () => {};
  sup.sortTheMessages = () => {};
};

beforeAll(() => { savedPerson = process.env.AGENTBOX_PERSON_ID; delete process.env.AGENTBOX_PERSON_ID; });
afterAll(() => { if (savedPerson !== undefined) process.env.AGENTBOX_PERSON_ID = savedPerson; });
afterEach(() => {
  try { sup?.stop(); } catch {}
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
});

describe('her morning, start to finish, with a real claude process', { timeout: 20_000 }, () => {
  it('signed out, replied, signed in: the next tick runs it and the row gets its answer', async () => {
    await build();
    const made = store.fileItem(PRODUCT, { title: 'Add a dark mode toggle', kind: 'task', body: 'Please add a toggle.', labels: ['founder'] });

    // 1. It spawns, dies on the login, and the account is benched.
    await tickAndSettle();
    expect(runs()).toEqual(['out']);
    expect(sup._profileTrouble.default?.cause).toBe('signed-out');
    expect(sup._hasSlotFor('claude')).toBe(false);
    expect(sup.status().signInNeeded).toEqual({ [made.id]: 'Claude Code' });
    expect(row(made.id).status).toBe('open');

    // 2. Her "continue" while still signed out: nothing is spawned to die,
    //    and the reply is not spent.
    store.answerItem(PRODUCT, made.id, { answer: 'continue' });
    for (let i = 0; i < 3; i++) await tickAndSettle();
    expect(runs()).toEqual(['out']);
    expect(sup._answerDelivered(row(made.id))).toBe(false);

    // 3. She signs in. The very next tick runs it, and it finishes.
    signIn();
    const signedInAt = Date.now();
    await sup.tick();
    const spawned = await waitFor(() => runs().length === 2, 3000);
    const took = Date.now() - signedInAt;
    console.log(`sign-in to spawn: 1 tick, ${took} ms`);
    expect(spawned).toBe(true);
    expect(runs()).toEqual(['out', 'in']);
    await waitFor(() => !sup.sessions.size && !sup._preparing?.size);
    await waitFor(() => /toggle is in/.test(row(made.id).result ?? ''));
    expect(row(made.id).result).toMatch(/toggle is in/);
    expect(sup.status().signInNeeded).toEqual({});
    expect(sup._profileTrouble.default).toBeUndefined();
  });

  it('must NOT run anything while signed out and nothing was written, until the bench ends', async () => {
    await build();
    store.fileItem(PRODUCT, { title: 'Write the changelog', kind: 'task', body: 'Please.', labels: ['founder'] });
    await tickAndSettle();
    expect(runs()).toEqual(['out']);
    for (let i = 0; i < 4; i++) await tickAndSettle();
    expect(runs()).toEqual(['out']);
    // Five minutes on (moved by hand rather than waited out), the bench ends
    // and it tries once more, and dies once more.
    sup._profileCooldown.default = Date.now() - 1;
    sup._spawnCooldownUntil = 0;
    await tickAndSettle();
    expect(runs()).toEqual(['out', 'out']);
    expect(sup._hasSlotFor('claude')).toBe(false);
  });

  it('Resume after signing in runs it at once', async () => {
    await build();
    const made = store.fileItem(PRODUCT, { title: 'Fix the footer', kind: 'task', body: 'Please.', labels: ['founder'] });
    await tickAndSettle();
    expect(runs()).toEqual(['out']);
    signIn();
    const out = sup.resumeItems([made.id]);
    expect(out.resumed + out.queued).toBe(1);
    await waitFor(() => runs().length === 2, 3000);
    expect(runs()).toEqual(['out', 'in']);
    await waitFor(() => /toggle is in/.test(row(made.id).result ?? ''));
    expect(row(made.id).result).toMatch(/toggle is in/);
  });

  // THE CASE THAT MATTERS MOST, AND THE ONE THIS FILE CAUGHT. Most of her rows
  // got no reply: they were just stuck. When a fresh row's run died on the
  // login, the app wrote its own sentence onto the row ("Claude Code could not
  // sign in..."), and `awaitingHer` read that as an agent having answered her,
  // so the fresh-work pass walked past the row forever. Signing in brought the
  // account back and nothing ran: 0 runs after sign-in, measured here before
  // the fix.
  it('a stuck row with no reply runs on its own the tick after she signs in', async () => {
    await build();
    const made = store.fileItem(PRODUCT, { title: 'Ship the pricing page', kind: 'task', body: 'Please.', labels: ['founder'] });
    await tickAndSettle();
    expect(runs()).toEqual(['out']);
    expect(row(made.id).result).toMatch(/sign in/i);
    signIn();
    await sup.tick();
    expect(await waitFor(() => runs().length === 2, 3000)).toBe(true);
    expect(runs()).toEqual(['out', 'in']);
    await waitFor(() => /toggle is in/.test(row(made.id).result ?? ''));
    expect(row(made.id).result).toMatch(/toggle is in/);
  });

  it('must NOT re-run a row an agent really answered, just because the account came back', async () => {
    await build();
    const made = store.fileItem(PRODUCT, { title: 'A question for her', kind: 'task', body: 'Please.', labels: ['founder'] });
    await tickAndSettle();
    expect(runs()).toEqual(['out']);
    // A real answer lands on the row after the sign-out note (another run, or
    // the other Mac): that one IS waiting on her.
    await new Promise((r) => setTimeout(r, 5));
    store.recordSessionResult(PRODUCT, made.id, { result: 'Which colour do you want?', status: 'open' });
    signIn();
    for (let i = 0; i < 2; i++) await tickAndSettle();
    expect(runs()).toEqual(['out']);
  });
});
