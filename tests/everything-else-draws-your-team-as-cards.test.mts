// "It feels like I'm going to a separate app, a separate thing, and I could
// easily never touch any of those things in the app." With teammates or Rooms
// on, chats lived on a Chats page of their own behind a sidebar row. Now the
// inbox has two tabs, Needs you and Everything else; Everything else draws
// your team as cards, and a card opens the chat the Chats page used to hold
// right under them (the teammate chat, the group chat, the direct record),
// so a short chat starts at the top as those chats always did. Checked on the
// built app with a made-up team (scripts/scratch, designs/w-b5f23cff71).
// Since w-2b3e1a85e5 a card opens work under the cards and its chat on the Chats page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';
import { TeamStrip, CornerFaces } from '../renderer/src/team/everything/TeamStrip.tsx';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const rooms = read('renderer/src/team/rooms/useRooms.tsx');

const members = [
  { key: 'me', kind: 'me', name: 'You', faceName: 'Sam Rivera', agents: 2, now: 'Signup flow' },
  { key: 'room:r-team', kind: 'chat', team: true, name: 'Team chat', faces: [{ name: 'Maya Costa', url: null }], last: 'Theo: Lock screen works', unread: true, agents: null, now: null },
  { key: 'person:p-maya', kind: 'person', name: 'Maya Costa', agents: 14, now: 'Billing page', level: 80 },
  { key: 'mate:t-ada', kind: 'mate', name: 'Ada', letter: 'A', role: 'Maintainer', agents: 6, now: 'Triage' },
];
const strip = (props = {}) => renderToStaticMarkup(h(TeamStrip, { members, picked: 'me', onPick() {}, onMove() {}, ...props }));

describe('the tabs, with a team on', () => {
  const tabs = (on) => renderToStaticMarkup(h(StateTabs, { view: on ? 'progress' : 'inbox', counts: { inbox: 3, progress: 5 }, onView() {}, onSearch() {},
    team: { on, onNeeds() {}, onEverything() {}, corner: on ? null : h('i', { className: 'corner' }) } }));

  it('are two: Needs you with its number, and Everything else', () => {
    const html = tabs(false);
    expect(html.match(/class="tm-tab( [^"]*)?"/g)).toHaveLength(2);
    expect(html).toContain('Needs you<b>3</b>');
    expect(html).toContain('Everything else');
    expect(html).not.toContain('In progress');
  });

  it('light Everything else while it is open, and put the team\'s faces before Search only on Needs you', () => {
    expect(tabs(true)).toMatch(/class="tm-tab on"[^>]*>Everything else/);
    expect(tabs(false)).toMatch(/class="corner"><\/i><button[^>]*class="th-search"/);
    expect(tabs(true)).not.toContain('corner');
  });

  it('stay four without a team, once something is in Later', () => {
    const html = renderToStaticMarkup(h(StateTabs, { view: 'inbox', counts: { snoozed: 1 }, onView() {} }));
    expect(html.match(/class="tm-tab( [^"]*)?"/g)).toHaveLength(4);
  });
  it('are three while Later is empty', () => {
    const html = renderToStaticMarkup(h(StateTabs, { view: 'inbox', counts: {}, onView() {} }));
    expect(html.match(/class="tm-tab( [^"]*)?"/g)).toHaveLength(3);
  });
});

describe('the cards', () => {
  it('can each be dragged, and say which one is open', () => {
    const html = strip();
    expect(html.match(/draggable="true"/g)).toHaveLength(4);
    expect(html).toMatch(/class="ev-card me on"/);
  });

  // The newest line went with what people are on (tests/a-card-says-who-not-what-they-are-on).
  it('draw a chat as a chat: no fill, its people\'s faces and a speech mark, never agents', () => {
    const html = strip();
    const chat = html.slice(html.indexOf('ev-card chat'), html.indexOf('ev-card person'));
    expect(chat).toContain('ev-bubble');
    // One person's face (tests/two-people-in-a-chat-show-as-two-faces).
    expect(chat).toContain('tm-av');
    expect(chat).not.toContain('Theo: Lock screen works');
    expect(chat).not.toContain('AGENTS');
    const person = html.slice(html.indexOf('ev-card person'));
    expect(person).not.toContain('ev-bubble');
    expect(person).toContain('14 agents working');
  });

  // They used to shrink to one line while a chat was open; they stay as they
  // are now (tests/the-cards-are-the-same-whoever-is-picked).

  it('end with a card that makes a new AI teammate', () => {
    expect(strip({ onAdd() {} })).toContain('New teammate');
    expect(strip()).not.toContain('New teammate');
  });

  it('on Needs you are the people and AI teammates as faces, never the chats', () => {
    const html = renderToStaticMarkup(h(CornerFaces, { members, onPick() {} }));
    expect(html.match(/class="ev-cf"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Open Maya Costa"');
  });
});

// The chat itself is on the Chats page (w-2b3e1a85e5, tests/messages-open-on-the-chats-page-and-nowhere-else).
describe('a card opens its chat', () => {
  it('opens a person\'s chat in Groups while Rooms is live, else their direct record', () => {
    expect(app).toMatch(/const chat = person \? personChats\.get\(person\) : undefined;\s*const talk = person && !\(roomsUi\.live && chat\) \? directWith\(person\) : null;/);
  });

  it('leaves the group\'s list and, for the team or one person, its people to the cards', () => {
    expect(rooms).toContain('page = <GroupPage key={open.id} inline={inline}');
    expect(rooms).toContain('people={inline && (open.teamId || open.members <= 2) ? null : <PeoplePanel');
  });

});
