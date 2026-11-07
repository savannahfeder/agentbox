// A THREAD WAITING ITS TURN ON THE COMPUTER READS QUEUED ON THE PHONE AND THE WEB.
//
// What she reported (2026-10-27, w-24119e8784, from her phone): "Bunch of my
// agents just say 'nothing running'." Read off the code that day: the copy of a
// thread the Mac sends up said whether an agent was on it this second (`live`)
// and nothing else. Which threads the Mac had queued, which were held because
// Claude Code or Codex was signed out or out of usage, which a dead worker had
// stopped, and whether the whole fleet was paused, never left the Mac. So the
// phone and the web read every thread waiting its turn as "Nothing running",
// the word the desktop keeps for a thread nothing will ever start, while the
// desktop beside it said "Queued". The only threads they called Queued were the
// ones sent from the phone that the Mac had not taken yet.
//
// Now the copy carries `wait`, the Mac's own reason, and the screens read it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneInbox } from '../main/phone-inbox.mts';
import { phoneWaitsOf } from '../shared/phone-snapshot.mjs';
import { phoneView, phoneSlug, waitFacts } from '../renderer/src/phone-rows';
import { liveLine } from '../renderer/src/live-line';
import { statusCell, factsFor } from '../renderer/src/status-word';
import { liveOf } from '../mobile/src/lib/thread-offers';

const T = Date.UTC(2026, 9, 27, 18, 0);
const A = 'w-aaaaaaaaaa';
const B = 'w-bbbbbbbbbb';
const C = 'w-cccccccccc';
const row = (id, extra = {}) => ({ id, title: `thread ${id}`, status: 'open', kind: 'directive', labels: ['founder'], createdAt: T - 60_000, updatedAt: T - 60_000, ...extra });

function publisher({ waits, items = [row(A), row(B)] }) {
  const sent = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-wait-'));
  const inbox = createPhoneInbox({
    backend: {
      async putPhoneProject() {}, async dropPhoneThreads() {}, async dropPhoneProject() {},
      async putPhoneThreads(device, project, batch) { for (const b of batch) sent.push({ item: b.item, wait: b.snapshot.wait ?? null }); },
      async waitingPhoneCommands() { return []; }, async claimPhoneCommand() { return null; }, async markPhoneCommand() {},
    },
    owner: 'o', device: 'a1b2c3d4e5f6', projects: () => [{ slug: 'p', name: 'P' }],
    listItems: () => items,
    historyOf: () => [], apply: async () => ({}), stateFile: path.join(dir, 's.json'),
    now: () => T, waitsOf: () => waits(),
  });
  return { inbox, sent };
}

describe('the Mac says why each thread is waiting', () => {
  it('reads the reason off its own status: stopped, shipping, signed out, at a limit, up next, queued', () => {
    const w = phoneWaitsOf({
      queued: ['q', 'n', 's'], runNow: ['n'], stalled: ['dead'], shipping: ['ship'],
      signInNeeded: { s: 'Codex' }, atLimit: { l: { tool: 'Claude Code', until: T + 3600_000 } }, paused: false,
    });
    expect(w.byId).toEqual({
      dead: { state: 'stalled' }, ship: { state: 'shipping' }, s: { state: 'signin', tool: 'Codex' },
      l: { state: 'limit', tool: 'Claude Code', until: T + 3600_000 }, n: { state: 'next' }, q: { state: 'queued' },
    });
    expect(w.paused).toBe(false);
  });

  it('says nothing about a thread it has no reason for, and nothing at all with no status', () => {
    expect(phoneWaitsOf({ queued: [], paused: false }).byId).toEqual({});
    expect(phoneWaitsOf(null)).toEqual({ byId: {}, paused: false });
  });

  it('carries the reason on the copy, and none on a thread that has none', async () => {
    const p = publisher({ waits: () => ({ byId: { [A]: { state: 'queued' } }, paused: false }) });
    await p.inbox.syncOnce();
    expect(p.sent.find((s) => s.item === A).wait).toEqual({ state: 'queued' });
    expect(p.sent.find((s) => s.item === B).wait).toBe(null);
  });

  it('sends the copy again when the reason changes, and not when it does not', async () => {
    let waits = { byId: { [A]: { state: 'queued' } }, paused: false };
    const p = publisher({ waits: () => waits });
    await p.inbox.syncOnce();
    p.sent.length = 0;
    await p.inbox.syncOnce();
    expect(p.sent).toEqual([]);
    waits = { byId: { [A]: { state: 'signin', tool: 'Codex' } }, paused: false };
    await p.inbox.syncOnce();
    expect(p.sent).toEqual([{ item: A, wait: { state: 'signin', tool: 'Codex' } }]);
    p.sent.length = 0;
    waits = { byId: {}, paused: false };
    await p.inbox.syncOnce();
    expect(p.sent).toEqual([{ item: A, wait: null }]);
  });

  it('paused says so on every open thread with no other reason, and never on a finished one', async () => {
    const p = publisher({
      waits: () => ({ byId: { [A]: { state: 'stalled' } }, paused: true }),
      items: [row(A), row(B), row(C, { status: 'done' })],
    });
    await p.inbox.syncOnce();
    expect(p.sent.find((s) => s.item === A).wait).toEqual({ state: 'stalled' });
    expect(p.sent.find((s) => s.item === B).wait).toEqual({ state: 'paused' });
    expect(p.sent.find((s) => s.item === C).wait).toBe(null);
  });

  it('a Mac that cannot say carries no reason rather than failing the pass', async () => {
    const p = publisher({ waits: () => { throw new Error('supervisor is busy'); } });
    await p.inbox.syncOnce();
    expect(p.sent.map((s) => s.wait)).toEqual([null, null]);
  });
});

describe('the phone and the web read it', () => {
  const DEV = 'a1b2c3d4e5f6';
  const slug = phoneSlug(DEV, 'p');
  const thread = (id, wait, extra = {}) => ({ device: DEV, project: 'p', item: id, snapshot: { v: 2, item: row(id), history: [], ...(wait ? { wait } : {}), ...extra } });
  const view = (...threads) => phoneView({ projects: [{ device: DEV, project: 'p', name: 'P' }], threads, commands: [] }, T);
  const fleetOf = (v) => ({ sessions: new Map(), queued: v.queued, runNow: v.runNow, signInNeeded: v.signInNeeded, atLimit: v.atLimit, stalled: v.stalled, shipping: v.shipping, paused: v.paused });
  const wordFor = (v, id) => statusCell(v.items.find((i) => i.id === id), { ...factsFor(fleetOf(v), id), inProgress: true, now: T }).word;

  it('the thread she reported: waiting its turn on the Mac reads Queued, not Nothing running', () => {
    const v = view(thread(A, { state: 'queued' }));
    expect(v.queued).toEqual([A]);
    expect(wordFor(v, A)).toBe('Queued');
    const item = v.items.find((i) => i.id === A);
    expect(liveOf(item, { session: null, inProgress: true, now: T, ...waitFacts(v, A) })).toMatchObject({ state: 'queued', word: 'Queued' });
  });

  it('every other reason reads as the desktop reads it', () => {
    const v = view(
      thread(A, { state: 'next' }),
      thread(B, { state: 'signin', tool: 'Codex' }),
      thread(C, { state: 'limit', tool: 'Claude Code', until: T + 3600_000 }),
      thread('w-dddddddddd', { state: 'stalled' }),
      thread('w-eeeeeeeeee', { state: 'shipping' }),
    );
    expect(wordFor(v, A)).toBe('Up next');
    expect(wordFor(v, B)).toBe('Signed out');
    expect(wordFor(v, C)).toBe('At its limit');
    expect(wordFor(v, 'w-dddddddddd')).toBe('Stopped');
    expect(wordFor(v, 'w-eeeeeeeeee')).toBe('Shipping');
  });

  it('paused reads Paused', () => {
    const v = view(thread(A, { state: 'paused' }));
    expect(v.paused).toBe(true);
    expect(wordFor(v, A)).toBe('Paused');
  });

  it('a thread with no reason still reads Nothing running, which is then true', () => {
    const v = view(thread(A, null), thread(B, { state: 'queued' }));
    expect(wordFor(v, A)).toBe('Nothing running');
    expect(liveLine(v.items.find((i) => i.id === A), { session: null, ...waitFacts(v, A), inProgress: true, now: T })?.state).toBe('idle');
  });

  it('a running agent outranks any reason the copy still carries', () => {
    const v = view(thread(A, { state: 'queued' }, { live: { since: T - 60_000, where: 'mac', doing: [], at: T } }));
    const session = v.running.find((r) => r.itemId === A);
    expect(liveLine(v.items.find((i) => i.id === A), { session, ...waitFacts(v, A), inProgress: true, now: T })?.state).toBe('working');
  });

  it('a reason that is not one of the words is ignored', () => {
    const v = view(thread(A, { state: 'whatever' }), thread(B, 'queued'));
    expect(v.queued).toEqual([]);
    expect(v.paused).toBe(false);
  });

  it('the phone app says Stopped on a thread a dead worker left', () => {
    const v = view(thread(A, { state: 'stalled' }));
    expect(liveOf(v.items.find((i) => i.id === A), { session: null, inProgress: true, now: T, ...waitFacts(v, A) }))
      .toMatchObject({ state: 'stalled', word: 'Stopped', working: false });
  });

  it('reaches the web app through its snapshot', () => {
    const src = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
    for (const key of ['runNow', 'signInNeeded', 'atLimit', 'stalled', 'shipping', 'paused']) expect(src).toContain(`${key}: view.${key}`);
  });

  it('reaches the phone app\'s thread page', () => {
    const src = fs.readFileSync(new URL('../mobile/src/app/thread/[product]/[id].tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/waitFacts\(c\.view, /);
  });

  it('is wired to the supervisor on the Mac', () => {
    const src = fs.readFileSync(new URL('../main/main.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/waits: \(\) => phoneWaitsOf\(supervisor\.status\(\)\)/);
    expect(fs.readFileSync(new URL('../main/team/index.mts', import.meta.url), 'utf8')).toMatch(/waitsOf: /);
  });
});
