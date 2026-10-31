// "There's also this other tab for teammates that I feel doesn't need to be a
// tab, and there are these individual chats with each teammate. I just find
// myself a little bit confused." With teammates on, the sidebar had a block of
// its own (a team chat page, a roster tab, one row per teammate) beside
// Groups, and a teammate's page mixed what it said to you with every run,
// pass and word it traded with other teammates. Now one Chats page lists AI
// teammates, people and groups, each a section that folds; a teammate's chat
// holds only what passes between you and it, and the rest is its Log.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatWith, logOf, foldedSet, toggleFold } from '../renderer/src/teammates/chat-lines.ts';
import { ChatsContext } from '../renderer/src/teammates/ChatsColumn.tsx';
import { GroupsColumn, GroupsHead } from '../renderer/src/team/rooms/GroupsColumn.tsx';
import { SidebarGroups } from '../renderer/src/team/rooms/GroupsSidebar.tsx';

const MKT = 't-aaaaaaaaaa';
const QA = 't-bbbbbbbbbb';
const msg = (id, from, to, text, ts, extra = {}) => ({ id, kind: 'msg', from, to, text, ts, ...extra });
const act = (id, from, verb, ts, extra = {}) => ({ id, kind: 'act', from, verb, ts, ...extra });
const run = (id, verb, ts, extra = {}) => ({ id, kind: 'run', teammate: MKT, item: `w-${id}`, product: 'p', title: id, verb, ts, ...extra });
const VIEW = {
  list: [],
  chat: [
    msg('m-1', 'you', [MKT], 'Can we get a launch video?', 1),
    msg('m-2', MKT, [], 'Yes. Two cuts by Friday.', 2),
    msg('m-3', MKT, [QA], '@Quality lead can you check the clip plays on a phone?', 3),
    msg('m-4', QA, [MKT], 'It stalls at 4 seconds on a slow phone.', 4),
    { id: 'p-1', kind: 'pass', from: MKT, to: QA, title: 'Check the clip', ts: 5 },
    act('a-1', MKT, 'learned', 6, { text: 'Open on the product', ref: 'k-1' }),
    act('a-2', MKT, 'lesson', 7, { text: 'Two cuts side by side', ref: 'p-9' }),
    act('a-3', MKT, 'paused', 8),
    act('a-4', MKT, 'hops', 9, { ref: 'p-1' }),
  ],
  runs: [run('picked', 'picked', 10), run('sent', 'sent', 11, { waiting: true }), run('done', 'finished', 12)],
};

describe('a teammate\'s chat', () => {
  it('holds your words to it, its words to you, what it sent you, what it saved, and work it holds for you', () => {
    expect(chatWith(VIEW, MKT).map((e) => e.id)).toEqual(['m-1', 'm-2', 'a-1', 'a-2', 'a-4', 'sent']);
  });

  it('leaves its talk with other teammates, passes, runs and pauses to its Log', () => {
    expect(logOf(VIEW, MKT).map((e) => e.id)).toEqual(['m-3', 'm-4', 'p-1', 'a-3', 'picked', 'done']);
  });

  it('a message from one teammate to another is in neither one\'s chat with you', () => {
    expect(chatWith(VIEW, QA).map((e) => e.id)).not.toContain('m-4');
    expect(chatWith(VIEW, QA).map((e) => e.id)).not.toContain('m-3');
  });
});

describe('a section of the Chats list', () => {
  it('stays folded once you fold it, and opens again on a second press', () => {
    const once = toggleFold(null, 'groups');
    expect([...foldedSet(once)]).toEqual(['groups']);
    expect([...foldedSet(toggleFold(once, 'groups'))]).toEqual([]);
    expect([...foldedSet('not json')]).toEqual([]);
  });
});

const groups = [
  { key: 'room:r-1', name: 'Northwind', faces: [], last: 'Maya: Stripe is wired', at: 0, unread: false, pinned: true },
  { key: 'direct:p-maya', name: 'Maya Chen', faces: [{ name: 'Maya Chen', url: null }], last: 'Keys before 6?', at: 0, unread: true, pinned: false },
];
const teammate = (over) => ({ id: MKT, name: 'Marketing lead', letter: 'M', role: null, status: 'active', paused: false, waiting: [], now: null, running: null, works: null, ...over });
const chats = (over = {}) => ({ teammates: [teammate({ waiting: [{ id: 'w', product: 'p', title: 't' }] })], groups, now: 0, onTeammate() {}, onNew() {}, onGroup() {}, ...over });
const column = (value, current = 'room:r-1') => renderToStaticMarkup(createElement(ChatsContext.Provider, { value }, createElement(GroupsColumn, { rows: groups, current, now: 0, onOpen() {} })));

describe('the Groups page with teammates on', () => {
  it('lists AI teammates, then people, then groups, each under a heading that folds', () => {
    const html = column(chats());
    const order = ['AI teammates', 'People', 'Groups'].map((h) => html.indexOf(`>${h}<`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.indexOf('Marketing lead')).toBeLessThan(html.indexOf('Maya Chen'));
    expect(html.indexOf('Maya Chen')).toBeLessThan(html.indexOf('Northwind'));
    expect(html).toMatch(/aria-expanded="true"/);
    expect(html).toMatch(/aria-label="New teammate"/);
  });

  it('marks a teammate waiting on you with a dot, and lights the open chat', () => {
    expect(column(chats())).toMatch(/Marketing lead[\s\S]*?cx-need/);
    expect(column(chats(), 'room:r-1')).toMatch(/cx-row on[^>]*>[\s\S]*?Northwind/);
  });

  it('is the old column, unchanged, with teammates off', () => {
    const html = column(null);
    expect(html).not.toMatch(/AI teammates/);
    expect(html).toMatch(/class="gc-list"/);
  });

  it('calls the page Chats', () => {
    const head = (value) => renderToStaticMarkup(createElement(ChatsContext.Provider, { value }, createElement(GroupsHead, { current: groups[0], onFind() {} })));
    expect(head(chats())).toMatch(/gc-col-title">Chats</);
    expect(head(null)).toMatch(/gc-col-title">Groups</);
  });
});

describe('the sidebar', () => {
  it('names the one row Chats when teammates are on, and Groups when not', () => {
    const side = (props) => renderToStaticMarkup(createElement(SidebarGroups, { onGroupsPage: false, onGroups() {}, ...props }));
    expect(side({ label: 'Chats' })).toMatch(/aria-label="Chats"/);
    expect(side({})).toMatch(/aria-label="Groups"/);
  });

  it('has no Teammates block, team chat or roster tab of its own any more', () => {
    const hook = fs.readFileSync(new URL('../renderer/src/teammates/useTeammates.tsx', import.meta.url), 'utf8');
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(hook).not.toMatch(/<TeammatesRail /);
    expect(page).not.toMatch(/tm-tabs|function Roster\(/);
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    // With a team on too: every chat is on this page (w-2b3e1a85e5).
    expect(app).toMatch(/<ChatsContext\.Provider value=\{chatsValue\}>/);
  });
});

describe('a teammate\'s page', () => {
  const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
  it('puts About, Log and Pause behind one ⋯ button, not buttons of their own', () => {
    expect(page).toMatch(/aria-label="Teammate options"/);
    for (const w of ['About', 'Log', 'Pause', 'Resume']) expect(page).toContain(`'${w}'`);
  });

  it('writes to it in the app\'s own chat box', () => {
    expect(page).toMatch(/className="rm-compose tq-compose"/);
  });

  it('says quietly when it saved something, with a way to see it', () => {
    expect(page).toMatch(/Saved to its instructions/);
    expect(page).toMatch(/See it/);
  });

  it('says in its header that it is an AI teammate, unless it has a role to show', () => {
    expect(page).toMatch(/\{!book && <span className="tq-role">\{titleAside\(shown\.kind, t\.role, t\)\}<\/span>\}/);
  });

  it('describes it in words beside a square list of facts', () => {
    for (const k of ['Model', 'Works in', 'On its own', 'Playbooks', 'This week']) expect(page).toContain(`<dt>${k}</dt>`);
    expect(page).toMatch(/Tell \$\{t\.name\} what to change about its job/);
  });

  // The first build offered "Direct", a person's direct-message record, as a
  // project to work in.
  it('offers projects to work in, never a chat with a person', () => {
    const offers = page.match(/const real = products\.filter\(\(p\) => [^;]+;/g);
    expect(offers).toHaveLength(2);
    for (const o of offers) expect(o).toMatch(/!p\.team\?\.direct/);
  });

  it('opens a playbook with where each lesson came from in a table', () => {
    expect(page).toMatch(/Where it learned this/);
    expect(fs.readFileSync(new URL('../renderer/src/teammates/teammates.css', import.meta.url), 'utf8')).toMatch(/\.tq-from-table \{[^}]*border-radius: 0/);
  });
});

// The first build of the Log listed yesterday's 7:40pm lines above today's
// 4:20pm ones with only a clock time, so it read as out of order.
describe('a teammate\'s Log', () => {
  it('says which day its lines are from when the day changes', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    const log = page.slice(page.indexOf('function LogPanel('), page.indexOf('\nfunction ', page.indexOf('function LogPanel(') + 10));
    expect(log).toMatch(/dayOf\(e\.ts\)/);
    expect(log).toMatch(/className="tq-log-day"/);
  });
});
