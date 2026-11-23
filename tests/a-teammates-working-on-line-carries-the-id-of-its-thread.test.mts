// A TEAMMATE'S "WORKING ON" LINE CARRIES THE ID OF ITS THREAD (synthetic team rerun, 2026-11-20).
//
// In the team group's panel Theo's line changed three times in a minute
// (Find every route, Unvalidated payments API routes, Appointments are lost on
// restart), and the panel had to find the thread again by its words each time;
// when the words and the card's title differed, a click opened his profile.
// In the rerun every running thread was shared with the team and every
// person's "who sees what I'm working on" was Team, so the line was read off
// the shared cards, which carry the thread's id. Measured on wallCards: the
// line carries that id, a teammate's line is the card's even when they also
// name their work to everyone, a stranger's and a private one carry none, and
// your own line carries your running thread's id from this Mac.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { wallCards } from '../shared/room-cards.mts';

const NOW = Date.parse('2026-11-20T02:00:00Z');
const MIN = 60_000;
const THEO = 'p-theo', ME = 'p-sam';
const prof = (person_id: string, extra: Record<string, unknown> = {}) => ({ person_id, display_name: person_id, show_working: 'team', show_agents: true, ...extra });
const pres = (person_id: string, extra: Record<string, unknown> = {}) => ({ person_id, agents_running: 1, working_on: null, working_private: false, working_at: new Date(NOW - 5 * MIN).toISOString(), updated_at: new Date(NOW - MIN).toISOString(), ...extra });
const card = (threadId: string, title: string, extra: Record<string, unknown> = {}) => ({ personId: THEO, threadId, title, state: 'running', visible: true, updatedAt: NOW - 2 * MIN, ...extra });
const theo = (o: Partial<Parameters<typeof wallCards>[0]>) => wallCards({ members: [THEO, ME], meId: ME, now: NOW, teammates: [THEO], profiles: [prof(THEO)], presence: [pres(THEO)], ...o }).find((c) => c.id === THEO)!;

describe('a teammate’s line', () => {
  it('names their newest running shared thread and carries its id', () => {
    const c = theo({ teamCards: [card('w-old', 'Health endpoint', { updatedAt: NOW - 9 * MIN }), card('w-7c9c', 'Appointments lost on restart')] });
    expect(c).toMatchObject({ workingOn: 'Appointments lost on restart', workingThread: 'w-7c9c' });
  });
  it('is the card’s, words and id, when they also name their work to everyone', () => {
    const c = theo({ profiles: [prof(THEO, { show_working: 'everyone' })], presence: [pres(THEO, { working_on: 'Appointments are lost on restart. Persist them' })], teamCards: [card('w-7c9c', 'Appointments lost on restart')] });
    expect(c).toMatchObject({ workingOn: 'Appointments lost on restart', workingThread: 'w-7c9c' });
  });
  it('carries no id when what runs is not shared with you', () => {
    expect(theo({ teamCards: [] })).toMatchObject({ workingOn: null, workingPrivate: true, workingThread: null });
    expect(theo({ teamCards: [card('w-1', 'Kept', { visible: false })] }).workingThread).toBeNull();
  });
  it('carries no id when they hide what they work on', () => {
    expect(theo({ profiles: [prof(THEO, { show_working: 'none' })], teamCards: [card('w-1', 'Shared')] })).toMatchObject({ workingOn: null, workingThread: null });
  });
});

describe('someone outside your team', () => {
  it('may show you a name, never a thread to open', () => {
    const c = wallCards({ members: [THEO, ME], meId: ME, now: NOW, teammates: [], profiles: [prof(THEO, { show_working: 'everyone' })], presence: [pres(THEO, { working_on: 'Launch film' })], teamCards: [] }).find((x) => x.id === THEO)!;
    expect(c).toMatchObject({ workingOn: 'Launch film', workingThread: null });
  });
});

describe('your own line', () => {
  it('carries the id of the thread this Mac is running', () => {
    const me = wallCards({ members: [THEO, ME], meId: ME, now: NOW, teammates: [THEO], profiles: [prof(ME)], presence: [], teamCards: [], mine: { agents: 2, workingOn: 'Idempotency key', workingThread: 'w-14c5' } }).find((x) => x.me)!;
    expect(me).toMatchObject({ agents: 2, workingOn: 'Idempotency key', workingThread: 'w-14c5' });
  });
  it('this Mac hands its running thread’s id to the wall', () => {
    const rooms = fs.readFileSync(new URL('../main/team/rooms.mts', import.meta.url), 'utf8');
    expect(rooms).toMatch(/return \{ workingOn: [^\n]+, workingThread: lead\.itemId, agents: f\.running!\.length \};/);
  });
});
