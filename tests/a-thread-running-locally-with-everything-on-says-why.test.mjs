// A THREAD RUNNING LOCALLY WITH EVERYTHING ON SAYS WHY (w-de59f3ff12).
//
// With the cloud set to Everything, In progress showed four threads running
// locally and two Queued, and nothing on screen said why: "The whole premise
// of the cloud is that everything runs in the cloud." Measured on the branch
// before the change: a local run's Status cell read "Working", the same word
// as a cloud run, and the snapshot carried no reason for either a local run or
// a queued one.
//
// The approved drawing (designs/w-de59f3ff12/r2-a-working-locally-hovered.png):
// the Status cell says "Working locally", and hovering it shows a card saying
// why. A queued thread keeps "Queued" and its card says what it waits for.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';
import { statusCell } from '../renderer/src/status-word.ts';
import { ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

function make({ cloudRuns = 'all', items = [], setUp = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'why-local-'));
  dirs.push(root);
  const product = { slug: 'p', dir: root, repoPath: '/r' };
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns },
    { listItems: () => items, listProducts: () => [product], isDue: () => true },
    root,
  );
  sup._cloudSetUp = () => setUp;
  sup._cloudReady = () => true;
  sup._cloudSignedInAtAll = () => true;
  return { sup, product };
}
const item = { id: 'w-1', product: 'p' };
const cwd = '/r/.claude/worktrees/w-1';

describe('why the app ran a thread locally', () => {
  it('names a thread you kept on this computer', () => {
    const { sup, product } = make();
    sup.threadOnMac['w-1'] = true;
    expect(sup._whyLocal({ item, product, cwd, engine: 'claude' })).toEqual({ why: 'kept' });
  });

  it('keeps the words a cloud run handed the thread back with', () => {
    const { sup, product } = make();
    const session = { cloud: true, result: 'Nothing else.\nAGENTBOX-NEEDS-THE-COMPUTER: your AWS sign-in' };
    expect(sup._noteCloudHandBack(item, session)).toBe(true);
    expect(sup._whyLocal({ item, product, cwd, engine: 'claude' })).toEqual({ why: 'handed-back', detail: 'your AWS sign-in' });
  });

  it('says a cloud run handed it back even when the run named nothing', () => {
    const { sup, product } = make();
    sup._noteCloudHandBack(item, { cloud: true, result: 'AGENTBOX-NEEDS-THE-COMPUTER:' });
    expect(sup._whyLocal({ item, product, cwd, engine: 'claude' })).toEqual({ why: 'handed-back', detail: null });
  });

  it('names a project the cloud does not take, and an engine with no cloud account', () => {
    const { sup, product } = make();
    sup.config.personalProducts = ['p'];
    expect(sup._whyLocal({ item, product, cwd, engine: 'claude' })).toEqual({ why: 'project' });
    sup.config.personalProducts = [];
    sup._cloudSignedInAtAll = () => false;
    expect(sup._whyLocal({ item, product, cwd, engine: 'claude' })).toEqual({ why: 'no-account', detail: 'claude' });
  });

  it('says a run started before Everything was on, and nothing at all with no cloud set up', () => {
    expect(make({ cloudRuns: null }).sup._whyLocal({ item, product: make().product, cwd, engine: 'claude' })).toEqual({ why: 'started-before' });
    const { sup, product } = make({ setUp: false });
    expect(sup._whyLocal({ item, product, cwd, engine: 'claude' })).toBe(null);
  });
});

describe('the snapshot says why', () => {
  const local = (over = {}) => ({ itemId: 'w-1', product: 'p', engine: 'claude', startedAt: Date.now(), tail: [], child: { kill() {} }, whyLocal: { why: 'kept' }, ...over });

  it('for a run on this computer, with Everything on', () => {
    const { sup } = make();
    sup.sessions.set('w-1', local());
    expect(sup.status().whyNotCloud).toEqual({ 'w-1': { at: 'mac', why: 'kept' } });
  });

  it('not for a run in the cloud, and not when the cloud only takes overflow', () => {
    const { sup } = make();
    sup.sessions.set('w-1', local({ cloud: true, whyLocal: null }));
    expect(sup.status().whyNotCloud).toEqual({});
    const full = make({ cloudRuns: null }).sup;
    full.sessions.set('w-1', local());
    expect(full.status().whyNotCloud).toEqual({});
  });

  it('for a queued thread waiting its turn for the cloud, two starting at a time', () => {
    const row = { id: 'w-2', product: 'p', status: 'open', title: 'Next', kind: 'task', labels: [], createdAt: 1, updatedAt: 1 };
    const { sup } = make({ items: [row] });
    sup._isFreshWork = () => true;
    sup._cloudStarting = () => 2;
    expect(sup.status().queued).toContain('w-2');
    expect(sup.status().whyNotCloud['w-2']).toEqual({ at: 'wait-cloud', why: 'two-at-a-time' });
  });

  it('for a queued thread that has to run on this computer', () => {
    const row = { id: 'w-2', product: 'p', status: 'open', title: 'Next', kind: 'task', labels: [], createdAt: 1, updatedAt: 1 };
    const { sup } = make({ items: [row] });
    sup._isFreshWork = () => true;
    sup.threadOnMac['w-2'] = true;
    expect(sup.status().whyNotCloud['w-2']).toEqual({ at: 'wait-mac', why: 'kept' });
  });
});

describe('a run started locally with Everything on', () => {
  it('carries why on its session from the moment it starts', async () => {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'why-local-run-')));
    dirs.push(tmp);
    const root = path.join(tmp, 'store');
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(repo, '.claude', 'worktrees'), { recursive: true });
    fs.mkdirSync(path.join(root, 'team'), { recursive: true });
    fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
    const store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
    const row = { ...store.fileItem('team', { title: 'Deploy the site', kind: 'task', body: 'Deploy it.' }), product: 'team' };
    fs.mkdirSync(path.join(repo, '.claude', 'worktrees', row.id), { recursive: true });
    const worker = path.join(tmp, 'claude.sh');
    fs.writeFileSync(worker, '#!/bin/sh\nsleep 5\n', { mode: 0o755 });
    const storeMcp = path.join(tmp, 'store-mcp.sh');
    fs.writeFileSync(storeMcp, '#!/bin/sh\n');
    const sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, storeMcpCommand: storeMcp, claudeBin: worker, cloudRuns: 'all' }, store, tmp);
    sup.writeMcpConfig = () => null;
    sup._workerEnv = () => ({});
    // The thread's folder is ready, so the start goes straight to choosing where.
    const folder = path.join(repo, '.claude', 'worktrees', row.id);
    sup._folderFirst = () => false;
    sup._photoFirst = () => false;
    sup.workFolderFor = () => folder;
    sup._cloudSetUp = () => true;
    sup._cloudReady = () => true;
    sup._cloudSignedInAtAll = () => true;
    sup.threadOnMac[row.id] = true;
    try {
      sup.spawnWorker(row);
      const session = sup.sessions.get(row.id);
      expect(session?.cloud).toBe(false);
      expect(session?.whyLocal).toEqual({ why: 'kept' });
    } finally {
      for (const s of sup.sessions.values()) s.child?.kill?.('SIGKILL');
      sup.stop?.();
    }
  });
});

describe('the Status cell', () => {
  const NOW = Date.parse('2026-10-23T20:00:00Z');
  const row = { id: 'w-1', product: 'p', productName: 'P', status: 'open', title: 'Release check', kind: 'task', labels: ['founder'], priority: 7, epoch: 1, claim: null, createdAt: NOW - 60_000, updatedAt: NOW - 60_000 };
  const session = (over = {}) => ({ itemId: 'w-1', product: 'p', startedAt: NOW - 60_000, tail: [], ...over });
  const facts = (over = {}) => ({ inProgress: true, now: NOW, ...over });

  it('says Working locally and why, for a run handed back by the cloud', () => {
    const cell = statusCell(row, facts({ session: session(), whyNotCloud: { at: 'mac', why: 'handed-back', detail: 'your AWS sign-in' } }));
    expect(cell.word).toBe('Working locally');
    expect(cell.why).toEqual({ head: 'Running locally', body: 'Its cloud run needed your AWS sign-in, which only this computer has.' });
  });

  it('says a run handed back to merge into main in plain words, not as something it needed', () => {
    const cell = statusCell(row, facts({ session: session(), whyNotCloud: { at: 'mac', why: 'handed-back', detail: 'merging into main' } }));
    expect(cell.why.body).toBe('Merging into main happens on this computer.');
  });

  it('says plain Working for a cloud run and for a local run with nothing to explain', () => {
    expect(statusCell(row, facts({ session: session({ where: 'cloud' }) })).word).toBe('Working');
    const plain = statusCell(row, facts({ session: session() }));
    expect(plain.word).toBe('Working');
    expect(plain.why).toBeUndefined();
  });

  it('keeps Queued, with a card saying it waits for the cloud', () => {
    const cell = statusCell(row, facts({ queued: ['w-1'], whyNotCloud: { at: 'wait-cloud', why: 'two-at-a-time' } }));
    expect(cell.word).toBe('Queued');
    expect(cell.why).toEqual({ head: 'Queued for the cloud', body: 'The cloud starts two threads at a time, and this one is in line.' });
  });

  it('draws the card under the word in the list, hidden until hovered', () => {
    const fleet = { sessions: new Map([['w-1', session()]]), queued: [], whyNotCloud: { 'w-1': { at: 'mac', why: 'kept' } } };
    const html = renderToStaticMarkup(React.createElement(FleetContext.Provider, { value: fleet },
      React.createElement(ThreadCells, { item: row, product: { slug: 'p', name: 'P' }, now: NOW, tab: 'progress' })));
    expect(html).toContain('Working locally');
    expect(html).toMatch(/class="th-why-card"[^>]*><b>Running locally<\/b><span>You chose to keep this thread on this computer\.<\/span>/);
  });
});
