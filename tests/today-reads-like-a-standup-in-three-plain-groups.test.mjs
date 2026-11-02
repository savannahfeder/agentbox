// TODAY READS LIKE A STANDUP IN THREE PLAIN GROUPS (2026-11-01).
//
// Read in light mode on the team version: the page opened on "4 things need
// you" underlined in orange, then gave each person up to seven sections whose
// mono caps labels wrapped ("WAITING ON / YOU"), and a "Waiting on you"
// section under each person repeated the Needs you tab, so a teammate's setup
// thread ("Set up Chief of staff") read as their work. Measured by building a
// day from the store's shapes and reading what the page draws per person.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { teamToday, groupsOf, shownDay, linesToStep, todayLine, GROUPS } from '../renderer/src/team/today.ts';

const NOW = new Date(2026, 9, 31, 15, 0).getTime();
const at = (h) => new Date(2026, 9, 31, h, 0).getTime();
const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const item = (o) => ({ product: 'lumen', status: 'open', labels: [], updatedAt: at(9), createdAt: at(8), title: o.id, ...o });
const card = (o) => ({ visible: true, state: 'running', project: 'Lumen', blockedBy: [], blocks: [], people: null, priority: null, progress: null, updatedAt: at(10), ...o });
const base = {
  range: 'today', now: NOW, me: 'p-me', products: [{ slug: 'lumen', name: 'Lumen', team: {} }, { slug: 'direct-dev', name: 'Dev', team: { direct: true } }],
  decisions: [], mentions: [], people: [{ id: 'p-dev', name: 'Dev Patel' }], mates: [{ id: 't-cos', name: 'Chief of staff' }],
  mateOf: (r) => r.labels?.find((l) => l.startsWith('teammate:'))?.slice(9) ?? null,
};
const titles = (lines) => lines.map((l) => l.title);
const of = (people, key) => people.find((p) => p.key === key);

describe('each person says at most three things', () => {
  const day = teamToday({
    ...base,
    items: [
      item({ id: 'done', title: 'Pricing page copy', status: 'done', updatedAt: at(11) }),
      item({ id: 'shipped', title: 'Group bookings v1', status: 'done', shippedAt: at(12), updatedAt: at(12) }),
      item({ id: 'moving', title: 'Seat picker', updatedAt: at(13) }),
      item({ id: 'stuck', title: 'Go-live checklist', status: 'blocked' }),
      item({ id: 'mine', product: 'direct-dev', title: 'Read the contract', labels: ['given-task'], assignee: 'p-me', createdBy: 'p-dev' }),
    ],
    cards: [],
    decisions: [{ roomId: 'r1', messageId: 'm1', kind: 'decision', body: 'Per-clinic passwords', saidBy: 'p-me', by: 'p-me', on: true, at: at(10) }],
    needs: [item({ id: 'ask', title: 'My agent asks' })],
  });
  const me = groupsOf(of(day.people, 'me'));

  it('working on holds open tasks and threads that moved', () => {
    expect(titles(me.working)).toEqual(['Read the contract', 'Seat picker']);
  });
  it('done holds shipped, finished and decided, newest first, each saying which it was only when not plain done', () => {
    expect(titles(me.done)).toEqual(['Group bookings v1', 'Pricing page copy', 'Per-clinic passwords']);
    expect(me.done.map((l) => l.tag ?? null)).toEqual(['Shipped', null, 'Decided']);
  });
  it('blocked holds what is stuck', () => {
    expect(titles(me.blocked)).toEqual(['Go-live checklist']);
  });
  it('what waits on you is in no group: Needs you says it', () => {
    expect(Object.values(me).flat().map((l) => l.title)).not.toContain('My agent asks');
    expect(linesToStep(day.people).map((s) => s.line.title)).not.toContain('My agent asks');
  });
  it('the groups are named in sentence case, in standup order', () => {
    expect(GROUPS.map((g) => g.label)).toEqual(['Working on', 'Done', 'Blocked']);
  });
});

describe('a blocked task is blocked, not being worked on', () => {
  const day = teamToday({
    ...base,
    items: [
      item({ id: 'gate', product: 'direct-dev', title: 'Sign the lease', labels: ['given-task'], assignee: 'p-dev', createdBy: 'p-me' }),
      item({ id: 'held', product: 'direct-dev', title: 'Move in', labels: ['given-task'], assignee: 'p-dev', createdBy: 'p-me', blockedBy: ['name:the landlord'] }),
    ],
    cards: [], needs: [],
  });
  const dev = groupsOf(of(day.people, 'person:p-dev'));
  it('goes under Blocked with whom it waits on, and its free sibling stays under Working on', () => {
    expect(titles(dev.blocked)).toEqual(['Move in']);
    expect(dev.blocked[0].on).toBe('the landlord');
    expect(titles(dev.working)).toEqual(['Sign the lease']);
  });
});

describe('a setup thread is not anyone\'s work', () => {
  const setup = item({ id: 'cos-setup', title: 'Set up Chief of staff', labels: ['teammate:t-cos'], updatedAt: at(14) });
  it('the teammate whose only line is its setup is named as quiet, not drawn', () => {
    const shown = shownDay(teamToday({ ...base, items: [setup], cards: [], needs: [setup] }));
    expect(of(shown.people, 'mate:t-cos')).toBeUndefined();
    expect(shown.quiet).toContain('Chief of staff');
    expect(JSON.stringify(shown.people.map(groupsOf))).not.toContain('Set up Chief of staff');
  });
  it('a teammate with real work is still drawn, and work named "Set up …" by a person still counts', () => {
    const shown = shownDay(teamToday({
      ...base, needs: [setup],
      items: [setup, item({ id: 'brief', title: 'Morning brief', labels: ['teammate:t-cos'], status: 'done', updatedAt: at(8) })],
      cards: [card({ personId: 'p-dev', threadId: 'ci', title: 'Set up CI for the app', state: 'done' })],
    }));
    expect(titles(groupsOf(of(shown.people, 'mate:t-cos')).done)).toEqual(['Morning brief']);
    expect(titles(groupsOf(of(shown.people, 'person:p-dev')).done)).toEqual(['Set up CI for the app']);
  });
});

describe('the line over the page', () => {
  it('is a plain sentence, or nothing when nothing needs you', () => {
    expect(todayLine({ needYou: 4, blocked: 2, shipped: 2, listed: 0 })).toBe('4 things need you');
    expect(todayLine({ needYou: 1, blocked: 0, shipped: 0 })).toBe('1 thing needs you');
    expect(todayLine({ needYou: 0, blocked: 3, shipped: 1 })).toBe('');
  });
});

describe('the page', () => {
  const page = read('renderer/src/team/TodayPage.tsx');
  const css = read('renderer/src/team/today.css');
  const rule = (sel) => new RegExp(`^${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`, 'm').exec(css)?.[1] ?? '';
  it('draws no Waiting on you section and no orange dot', () => {
    expect(page).not.toContain('label="Waiting on you"');
    expect(page).not.toContain('td-dot');
  });
  it('labels are quiet sentence case that never wrap', () => {
    expect(rule('.td-label')).not.toMatch(/uppercase|var\(--mono\)/);
    expect(rule('.td-label')).toMatch(/white-space: nowrap/);
  });
  it('the top line is quiet, not underlined in orange', () => {
    expect(css).not.toMatch(/text-decoration-color: var\(--accent\)/);
  });
  it('keeps the person-by-person layout and the day switch', () => {
    expect(page).toContain('td-person');
    expect(page).toMatch(/This week/);
  });
});
