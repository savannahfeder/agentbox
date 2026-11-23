// A TEAMMATE'S TASK IN THE GROUP'S PANEL OPENS THEIR THREAD (synthetic team, 2026-11-20).
//
// In the team group's "Your team" panel a backend engineer saw "Sam, Payments
// API health endpoint, 1 agent", clicked it to read what the agent did, and got
// Sam's profile (rank, days in a row, agent hours) with no way to the thread.
// The whole row was one button to the profile. Measured on the panel's own
// elements: the task line is now a button that opens the thread when it is a
// shared thread you can read, while the face and the name still open the
// profile; and on which thread a line opens (threadOnLine).
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import React, { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PeoplePanel } from '../renderer/src/team/rooms/GroupPage.tsx';
import { Face } from '../renderer/src/team/people.tsx';
import { threadOnLine } from '../renderer/src/team/rooms/room-rules.ts';
import type { RoomCard, ThreadCard } from '../renderer/src/types.ts';
globalThis.React = React;

const person = (id: string, o: Partial<RoomCard> = {}): RoomCard => ({
  id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 0, hoursTotal: 0, hoursWeek: 0, hoursToday: 0, streak: 0, byMonth: [],
  teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o,
});
const thread = (personId: string, threadId: string, o: Partial<ThreadCard> = {}): ThreadCard => ({
  personId, threadId, visible: true, title: null, project: 'Payments API', state: 'running', priority: null, problem: null, progress: null, solution: null,
  blockedBy: [], blocks: [], people: null, updatedAt: 1000, ...o,
});
const sam = person('sam', { agents: 1, workingOn: 'Payments API health endpoint', workingThread: 'health' });

// The line once matched a card by its title; the title changed three times in
// a minute on the rerun and the link fell through to the profile. It goes by id.
describe('which thread a line opens', () => {
  it('the card the line carries the id of', () => {
    const cards = [thread('sam', 'old', { title: 'Payments API health endpoint', updatedAt: 2000 }), thread('sam', 'health', { title: 'Payments API health endpoint' })];
    expect(threadOnLine(sam, cards)).toEqual({ personId: 'sam', threadId: 'health' });
  });
  it('the same thread after its title changed', () => {
    expect(threadOnLine(sam, [thread('sam', 'health', { title: 'Health endpoint with uptime' })])?.threadId).toBe('health');
  });
  it('a thread that is waiting, not only one running', () => {
    expect(threadOnLine(sam, [thread('sam', 'health', { state: 'waiting' })])?.threadId).toBe('health');
  });
  it('not a card of that title with another id', () => {
    expect(threadOnLine(sam, [thread('sam', 'other', { title: 'Payments API health endpoint' })])).toBeNull();
  });
  it('not someone else’s card with that id', () => {
    expect(threadOnLine(sam, [thread('lena', 'health')])).toBeNull();
  });
  it('not one they keep from you', () => {
    expect(threadOnLine(sam, [thread('sam', 'health', { visible: false })])).toBeNull();
  });
  it('none when the line carries no id', () => {
    expect(threadOnLine({ ...sam, workingThread: null }, [thread('sam', 'health')])).toBeNull();
  });
  it('your own thread, which has no card when it is private', () => {
    expect(threadOnLine(person('me', { me: true, agents: 1, workingOn: 'Mine', workingThread: 'w-1' }), [])).toEqual({ personId: 'me', threadId: 'w-1' });
  });
});

// The panel's elements, rendered one level at a time, so a button's onClick can be pressed.
function all(node: ReactNode, out: ReactElement<Record<string, unknown>>[] = []): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) { for (const n of node) all(n, out); return out; }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement<Record<string, unknown>>;
  // A face reads the team (useContext), which only works inside a render; it holds no button.
  if (el.type === Face) return out;
  if (typeof el.type === 'function') return all((el.type as (p: unknown) => ReactNode)(el.props), out);
  out.push(el);
  all(el.props.children as ReactNode, out);
  return out;
}
const text = (el: ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, '');

describe('the row', () => {
  const room = { members: 2, wall: [sam, person('priya', { status: 'In reviews' })], teamId: 't' };
  const onPerson = vi.fn();
  const opened = vi.fn();
  const panel = createElement(PeoplePanel, { room, onPerson, threadOf: (c: RoomCard) => (c.id === 'sam' ? opened : null) });
  const buttons = all(PeoplePanel(panel.props)).filter((e) => e.type === 'button');

  it('opens the thread from the task line', () => {
    const line = buttons.find((b) => text(b) === 'Payments API health endpoint');
    expect(line).toBeTruthy();
    (line!.props.onClick as () => void)();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(onPerson).not.toHaveBeenCalled();
  });
  it('opens the profile from the name and the face', () => {
    const toProfile = buttons.filter((b) => b.props.title === "Open sam's page");
    expect(toProfile.length).toBe(2);
    for (const b of toProfile) (b.props.onClick as () => void)();
    expect(onPerson).toHaveBeenCalledWith('sam');
  });
  it('keeps a row with no thread to read as one button to the profile', () => {
    const row = buttons.find((b) => b.props.className === 'gr-prow' && text(b).includes('priya'));
    expect(row).toBeTruthy();
    expect(text(row!)).toContain('In reviews');
  });
  it('without a way to open threads, every row is the profile, as before', () => {
    const html = renderToStaticMarkup(createElement(PeoplePanel, { room, onPerson }));
    expect(html.match(/<button type="button" class="gr-prow"/g)).toHaveLength(2);
  });
});

describe('wired in', () => {
  const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('the group and a direct chat both pass the way to a thread', () => {
    expect(hook.match(/<PeoplePanel [^\n]*threadOf=\{threadOf\}/g)).toHaveLength(2);
  });
  it('the app opens the card the line names, as a teammate’s shared thread', () => {
    expect(app).toMatch(/threadOf: \(c\) => \{ const t = threadOnLine\(c, weekCards\); return t \? \(\) => openContinuedFrom\(t\.personId, t\.threadId\) : null; \}/);
  });
});
