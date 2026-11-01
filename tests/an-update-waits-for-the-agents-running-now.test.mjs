// AN UPDATE WAITS FOR THE AGENTS RUNNING NOW (w-2a5f57325e, 2026-11-01).
//
// On 2026-10-31 the app folder moved to a new main three times in about ten
// minutes and the app restarted under its workers. Each worker came back, but
// its helpers (three builders, three watch jobs, three testers and their
// copies of the app) did not, and both of one thread's runs went into
// runs.jsonl as failed. Measured before this change: `install()` on the source
// updater fast-forwarded, built and relaunched at once whatever was running;
// there was no way for it to know.
//
// Now Restart waits until no local agent is mid-run, and pressing it again
// restarts now. The wait comes before the fast-forward and the build, because
// a rebuilt renderer/dist under a window that keeps running for hours breaks
// its lazy imports.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSourceUpdater } from '../main/source-updater.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { SidebarUpdate } from '../renderer/src/components/SidebarUpdate.tsx';
import { updateLook } from '../renderer/src/update-row.ts';

const git = (cwd, ...args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
}).trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let tmp, mine, theirs;

function commit(cwd, file, text, message) {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'update-waits-'));
  const origin = path.join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(tmp, 'seed');
  git(tmp, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, 'notes.txt', 'x\n', 'First');
  git(seed, 'push', '-q', 'origin', 'main');
  mine = path.join(tmp, 'mine');
  theirs = path.join(tmp, 'theirs');
  git(tmp, 'clone', '-q', origin, mine);
  git(tmp, 'clone', '-q', origin, theirs);
  commit(theirs, 'a.txt', 'a\n', 'Something new');
  git(theirs, 'push', '-q', 'origin', 'main');
});

afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

async function aReadyUpdate(running) {
  const relaunched = [];
  const built = [];
  const u = createSourceUpdater({
    appDir: mine,
    log: { info() {}, warn() {}, error() {} },
    npm: async (args) => { built.push(args.join(' ')); return { code: 0, out: '' }; },
    brand: async () => {},
    relaunch: () => relaunched.push(Date.now()),
    running: () => running.n,
    waitEveryMs: 20,
  });
  await u.check();
  expect(u.state().phase).toBe('ready');
  return { u, relaunched, built };
}
const head = () => git(mine, 'rev-parse', 'HEAD');

describe('pressing Restart while agents are running', () => {
  it('waits, without moving the folder or building, and says how many it waits for', async () => {
    const running = { n: 3 };
    const { u, relaunched, built } = await aReadyUpdate(running);
    const before = head();
    expect(u.install()).toBe(true);
    await wait(150);
    expect(relaunched).toEqual([]);
    expect(built).toEqual([]);
    expect(head()).toBe(before);
    expect(u.state().waitingFor).toBe(3);
    expect(u.state().ready).toBe(true);
    running.n = 1;
    await wait(80);
    expect(u.state().waitingFor).toBe(1);
    u.stop();
  });

  it('restarts by itself once the last one finishes', async () => {
    const running = { n: 2 };
    const { u, relaunched } = await aReadyUpdate(running);
    u.install();
    await wait(80);
    running.n = 0;
    for (let i = 0; i < 50 && !relaunched.length; i += 1) await wait(20);
    await u.settled();
    expect(relaunched.length).toBe(1);
    expect(head()).toBe(git(theirs, 'rev-parse', 'HEAD'));
    expect(u.state().waitingFor).toBe(null);
  });

  it('pressing it again restarts now', async () => {
    const running = { n: 2 };
    const { u, relaunched } = await aReadyUpdate(running);
    u.install();
    await wait(60);
    expect(relaunched).toEqual([]);
    expect(u.install()).toBe(true);
    await u.settled();
    expect(relaunched.length).toBe(1);
  });

  it('an agent that starts during the build holds the relaunch until it finishes', async () => {
    const running = { n: 0 };
    const { u, relaunched } = await aReadyUpdate(running);
    // The build is where a new run slips in: by the time it ends, one is going.
    u.install();
    running.n = 1;
    await u.settled();
    await wait(80);
    expect(relaunched).toEqual([]);
    expect(u.state().waitingFor).toBe(1);
    running.n = 0;
    for (let i = 0; i < 50 && !relaunched.length; i += 1) await wait(20);
    expect(relaunched.length).toBe(1);
  });

  it('a check while it waits leaves the wait alone', async () => {
    const running = { n: 1 };
    const { u, relaunched } = await aReadyUpdate(running);
    u.install();
    await u.check();
    expect(u.state().waitingFor).toBe(1);
    running.n = 0;
    for (let i = 0; i < 50 && !relaunched.length; i += 1) await wait(20);
    expect(relaunched.length).toBe(1);
  });
});

describe('with nothing running', () => {
  it('restarts at once, as before', async () => {
    const { u, relaunched } = await aReadyUpdate({ n: 0 });
    u.install();
    await u.settled();
    expect(relaunched.length).toBe(1);
    expect(u.state().waitingFor).toBe(null);
  });
});

describe('what the screen says while it waits', () => {
  const card = (props) => renderToStaticMarkup(createElement(SidebarUpdate, { installing: false, collapsed: false, onRestart() {}, onClose() {}, ...props }));

  it('the card names the agents and offers to restart now', () => {
    const html = card({ waitingFor: 3 });
    expect(html).toContain('Restarts when the 3 agents running now finish.');
    expect(html).toContain('Restart now');
  });
  it('one agent is one agent', () => {
    expect(card({ waitingFor: 1 })).toContain('Restarts when the agent running now finishes.');
  });
  it('not waiting, the card is the one it always was', () => {
    const html = card({});
    expect(html).not.toContain('Restart now');
    expect(html).not.toContain('running now');
  });
  it('the Settings row says the same and its button restarts now', () => {
    const look = updateLook({ phase: 'ready', ready: true, source: true, waitingFor: 2, newVersion: 'abc1234', changes: [], behind: 1 });
    expect(look.sentence).toContain('Restarts when the 2 agents running now finish.');
    expect(look.button).toBe('Restart now');
    expect(look.restart).toBe(true);
    expect(look.busy).toBe(false);
  });
});

describe('which runs an update waits for', () => {
  const sup = (sessions, shipping = false) => Object.assign(Object.create(Supervisor.prototype), {
    sessions: new Map(sessions.map((s, i) => [`w-${i}`, s])),
    shipQueue: { busy: shipping ? Promise.resolve() : null },
  });

  it('every run on this computer', () => {
    expect(sup([{ engine: 'claude' }, { engine: 'codex' }]).runsAQuitStops()).toBe(2);
  });
  it('not a Claude run in the cloud, which carries on while the app restarts', () => {
    expect(sup([{ engine: 'claude', cloud: true }]).runsAQuitStops()).toBe(0);
  });
  it('a Codex run in the cloud, which a quit cancels', () => {
    expect(sup([{ engine: 'codex', cloud: true }]).runsAQuitStops()).toBe(1);
  });
  it('a ship under way, whose tests and push the quit would cut off', () => {
    expect(sup([], true).runsAQuitStops()).toBe(1);
  });
  it('nothing, when nothing is going', () => {
    expect(sup([]).runsAQuitStops()).toBe(0);
  });
});
