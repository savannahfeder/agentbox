// THE THREAD YOU ARE IN MOVES TO THE CLOUD, FROM THE MAC OR THE PHONE (w-f43613624f).
//
// After the cloud menu learned to move every run on this Mac, the reply was:
// "what about for individual chats. quite often i want to move the one i'm in
// or looking at to cloud." Measured on the branch: with the cloud on
// Everything, an open thread running here offered "Keep on this Mac" and no
// way to send it now; the list row offered nothing; and the phone, where they
// work this week, could not ask at all, because its copy of a thread never
// said whether the cloud could take it and no phone command could move one.
//
// Now the thread's working line has a Move to cloud button, its ⋯ menu and ⌘K
// offer the move in every cloud mode, the list row offers it on hover, and the
// phone site and app send it to the computer as a command. A move someone
// asks for goes ahead of the ones Everything makes by itself.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Supervisor } from '../main/supervisor.mjs';
import { createPhoneInbox, applyThrough } from '../main/phone-inbox.mjs';
import { PHONE_COMMANDS } from '../shared/phone-snapshot.mjs';
import { REQUEST_CHANNELS } from '../shared/bridge-map.mjs';
import { threadPlace } from '../renderer/src/cloud-menu.ts';
import { ThreadMenu } from '../renderer/src/threads/ThreadMenu.tsx';
import { placeView } from '../renderer/src/threads/PlaceButton.tsx';
import { ThreadCells, MoveToCloudContext } from '../renderer/src/threads/Pages.tsx';
import { FleetContext } from '../renderer/src/fleet.ts';
import { commandFor, phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { offersOf } from '../mobile/src/lib/thread-offers';
import { planFor } from '../mobile/src/lib/actions';

globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const NOW = Date.now();
const DEV = 'a1b2c3d4e5f6';

function make() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'move-one-'));
  dirs.push(root);
  const rows = [];
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 6, maxCloudSessions: 10, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => rows, listProducts: () => [{ slug: 'p', dir: root, repoPath: '/r' }], isDue: () => true },
    root,
  );
  sup._cloudSetUp = () => true;
  sup._cloudReady = () => true;
  sup._cloudSignedInAtAll = () => true;
  sup._cloudVersionGaps = () => [];
  sup.transcriptFile = (rec) => (rec?.sessionId ? '/t.jsonl' : null);
  const killed = [];
  const run = (id, startedAt) => {
    rows.push({ id, product: 'p', status: 'claimed' });
    sup.sessions.set(id, { itemId: id, product: 'p', cwd: `/r/.claude/worktrees/${id}`, engine: 'claude', startedAt, tail: [], child: { kill: () => killed.push(id) } });
    sup._liveSessions[id] = { product: 'p', sessionId: `s-${id}`, engine: 'claude' };
  };
  return { sup, rows, run, killed };
}

describe('on the Mac', () => {
  it('the one you asked for goes first, ahead of a younger one Everything would move (the reported case)', () => {
    const { sup, rows, run, killed } = make();
    run('w-old', NOW - 60 * 60_000);
    run('w-young', NOW - 60_000);
    sup._cloudStarting = () => 1;
    expect(sup.moveToCloud(['w-old'])).toEqual({ moving: 1 });
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual(['w-old']);
  });

  it('asking again moves it even inside the half hour a moved thread is otherwise left alone', () => {
    const { sup, rows, run, killed } = make();
    run('w-a', NOW);
    sup._movedToCloudAt = { 'w-a': NOW - 60_000 };
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual([]);
    sup.moveToCloud(['w-a']);
    sup._moveRunsToTheCloud(rows);
    expect(killed).toEqual(['w-a']);
  });

  it('the thread\'s menu offers the move with Everything on too', () => {
    const cloud = { setUp: true, mode: 'all', projects: ['p'], movable: ['w-a'] };
    expect(threadPlace({ id: 'w-a', product: 'p' }, {}, cloud)).toBe('move');
    expect(threadPlace({ id: 'w-b', product: 'p' }, {}, cloud)).toBe('here');
  });

  // The working line's own button was turned down ("looks very bad"); the top
  // bar's place button carries the move (the-cloud-button-on-a-thread-...).
  it('the top bar says the run is on this Mac, and picking Cloud moves it', () => {
    const html = renderToStaticMarkup(React.createElement(ThreadMenu, { onFinish: () => {}, place: 'move', onPlace: () => {} }));
    expect(html).toMatch(/class="ts-done ts-place[^"]*"[^>]*>.*This Mac/);
    expect(placeView({ place: 'move' }).pickCloud).toBe('move');
  });

  it('the list row offers it on hover', () => {
    const row = { id: 'w-a', product: 'p', title: 'Fix the inbox', status: 'claimed', labels: [], priority: 0, createdAt: NOW, updatedAt: NOW };
    const fleet = { sessions: new Map([['w-a', { startedAt: NOW, tail: [], activity: [] }]]), queued: [], whyNotCloud: { 'w-a': { at: 'mac', why: 'moving' } } };
    const draw = (ids) => renderToStaticMarkup(React.createElement(MoveToCloudContext.Provider, { value: { ids: new Set(ids), move: () => {} } },
      React.createElement(FleetContext.Provider, { value: fleet },
        React.createElement(ThreadCells, { item: row, product: { slug: 'p', name: 'P' }, now: NOW, tab: 'progress' }))));
    expect(draw(['w-a'])).toMatch(/class="th-row-act"[^>]*>.*Move to cloud<\/button>/);
    expect(draw([])).not.toContain('Move to cloud');
  });
});

describe('from the phone', () => {
  it('the computer says on each running thread whether the cloud could take it', () => {
    const { sup, run } = make();
    run('w-a', NOW);
    expect(sup.liveFor('p', 'w-a')).toMatchObject({ where: 'mac', movable: true });
    sup.setThreadOnMac({ 'w-a': true });
    sup._movableSeen = null;
    expect(sup.liveFor('p', 'w-a').movable).toBeUndefined();
  });

  it('its copy carries that, and is sent again when it changes', async () => {
    let movable = true;
    const sent = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'move-one-phone-'));
    dirs.push(dir);
    const inbox = createPhoneInbox({
      backend: {
        async putPhoneProject() {}, async dropPhoneThreads() {}, async dropPhoneProject() {},
        async putPhoneThreads(_d, _p, batch) { for (const b of batch) sent.push(b.snapshot.live ?? null); },
        async waitingPhoneCommands() { return []; }, async claimPhoneCommand() { return null; }, async markPhoneCommand() {},
      },
      owner: 'o', device: DEV, projects: () => [{ slug: 'p', name: 'P' }],
      listItems: () => [{ id: 'w-aaaaaaaaaa', title: 't', status: 'claimed', kind: 'directive', labels: [], createdAt: NOW, updatedAt: NOW }],
      historyOf: () => [], apply: async () => ({}), stateFile: path.join(dir, 's.json'),
      now: () => NOW, liveOf: () => ({ since: NOW - 1000, where: 'mac', doing: [], ...(movable ? { movable: true } : {}) }),
    });
    await inbox.syncOnce();
    expect(sent.at(-1)).toMatchObject({ where: 'mac', movable: true });
    movable = false;
    await inbox.syncOnce();
    expect(sent.at(-1).movable).toBeUndefined();
  });

  it('the phone site reads it, offers the move, and sends it as a command the computer acts on', async () => {
    const live = { since: NOW - 1000, at: NOW, where: 'mac', doing: [], movable: true };
    const v = phoneView({ projects: [{ device: DEV, project: 'p', name: 'P' }], threads: [{ device: DEV, project: 'p', item: 'w-a', snapshot: { v: 2, item: { id: 'w-a', title: 't', status: 'claimed', labels: [], createdAt: NOW, updatedAt: NOW }, history: [], live } }], commands: [] }, NOW);
    const session = v.running.find((r) => r.itemId === 'w-a');
    expect(session.movable).toBe(true);
    // No cloud status on the phone, only the computer's word on the run.
    expect(threadPlace({ id: 'w-a', product: phoneSlug(DEV, 'p') }, session, null)).toBe('move');
    const cmd = commandFor(REQUEST_CHANNELS.moveToCloud, { product: phoneSlug(DEV, 'p'), id: 'w-a', ids: ['w-a'] });
    expect(cmd).toMatchObject({ device: DEV, project: 'p', item: 'w-a', kind: 'move-to-cloud' });
    expect(PHONE_COMMANDS).toContain('move-to-cloud');
    const calls = [];
    const apply = applyThrough(new Map([['zero:move-to-cloud', async (_e, args) => { calls.push(args); return { moving: 1 }; }]]));
    await apply({ ...cmd, project: 'p' });
    expect(calls).toEqual([{ ids: ['w-a'] }]);
  });

  it('the phone app offers it in the thread\'s sheet and sends the same door', () => {
    const item = { id: 'w-a', product: 'p', status: 'claimed', labels: [] };
    expect(offersOf(item, { session: { startedAt: NOW, movable: true }, inProgress: true, now: NOW }).moveToCloud).toBe(true);
    expect(offersOf(item, { session: { startedAt: NOW, movable: true, where: 'cloud' }, inProgress: true, now: NOW }).moveToCloud).toBe(false);
    expect(offersOf(item, { session: { startedAt: NOW }, inProgress: true, now: NOW }).moveToCloud).toBe(false);
    expect(planFor({ kind: 'move-to-cloud' }, item, NOW).steps).toEqual([{ door: 'moveToCloud', payload: { product: 'p', id: 'w-a', ids: ['w-a'] } }]);
    expect(read('mobile/src/ui/ThreadMenu.tsx')).toMatch(/label="Move to cloud"/);
    expect(read('renderer/src/phone-send.ts')).toMatch(/moveToCloud: \(p: unknown\) => leave\(REQUEST_CHANNELS\.moveToCloud, p\)/);
  });

  it('the database takes the new command', () => {
    const last = fs.readdirSync(new URL('../cloud/supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => read(`cloud/supabase/migrations/${f}`)).filter((sql) => /phone_commands_kind_check/.test(sql)).at(-1);
    expect(last).toMatch(/'move-to-cloud'/);
    for (const kind of PHONE_COMMANDS) expect(last).toContain(`'${kind}'`);
    expect(last).toMatch(/phone_commands_setting_names_no_project/);
  });
});
