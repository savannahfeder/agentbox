// THE TEAM PAGE IS NAMED FOR THE TEAM, AND READS AS CARDS.
//
// The owner, 2026-11-02, on the layout where Chats held the team: "I'm looking
// at a page called Chats and the main page just shows what everyone's up to...
// rename it something other than Chats", "the everyone page looks pretty bad",
// and on a person's page "the right sidebar... is way too wide and that makes
// the chat too narrow". Seen in light at 1440x900: the page and its sidebar row
// said Chats; the day was a flat grid of 13px rows under a label column; the
// side panel took 330 of the 960 points beside the chat. Narrowed to 264, its
// titles cut off mid-word ("Add the seat count to the book…"), and its dots
// meant the opposite of the Everyone cards' dots. Then: the list of people on
// the left was "a bit wide" at 300, and a section with nothing in it said 0.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('naming', () => {
  it('calls the page and its sidebar row Team on that layout', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/chatsPlaceShown \? <h1 className="workspace-title">Team<\/h1>/);
    expect(app).toMatch(/homeLayout === 'chats' \? 'Team' : undefined\)/);
    expect(read('renderer/src/team/rooms/useRooms.tsx')).toMatch(/sidebarGroups: \(onGroupsPage: boolean, chats\?: \(\) => void, label\?: string\) =>/);
  });
});

describe('the Everyone view', () => {
  it('draws each person as a card, with each line marked by what it is', () => {
    const css = read('renderer/src/team/today.css');
    expect(css).toMatch(/\.team-page \.td-person \{[^}]*border: 1px solid var\(--line\);[^}]*border-radius: var\(--artifact-corner\)/);
    expect(css).toMatch(/\.team-page \.td-sec\[data-group="working"\] \.td-line::before/);
    expect(css).toMatch(/\.team-page \.td-sec\[data-group="done"\] \.td-line::before/);
    expect(read('renderer/src/team/TodayPage.tsx')).toMatch(/<div className="td-sec" data-group=\{id\.split\('\/'\)\.pop\(\)\}>/);
  });
});

describe('a person\'s page', () => {
  it('gives the chat the room, with a narrower side', () => {
    expect(read('renderer/src/team/everything/everything.css')).toMatch(/\.pl-side \{ width: 272px;/);
  });
  it('wraps a long title to a second line rather than cutting it', () => {
    const css = read('renderer/src/team/everything/everything.css');
    expect(css).toMatch(/\.pl-t \{[^}]*-webkit-line-clamp: 2/);
    expect(css).not.toMatch(/\.pl-t \{[^}]*white-space: nowrap/);
  });
  it('marks working with a ring and done with a dot, as the Everyone cards do', () => {
    const css = read('renderer/src/team/everything/everything.css');
    expect(css).toMatch(/\.pl-row i \{[^}]*border: 1\.5px solid var\(--accent\)/);
    expect(css).toMatch(/\.pl-row\.done i \{ border: 0; background: var\(--text-faint\); \}/);
  });
});

describe('the list beside it', () => {
  it('is 240 wide, leaving the rest to the page', () => {
    expect(read('renderer/src/team/rooms/rooms.css')).toMatch(/^\.gc-list \{ width: 240px;/m);
  });
  it('says no 0 on a section with nothing in it', () => {
    const col = read('renderer/src/teammates/ChatsColumn.tsx');
    expect(col).toContain('{count > 0 && <em>{count}</em>}');
    expect(col).not.toContain('<span>{title}</span><em>{count}</em>');
  });
  it('nor does a board column or a section of threads', () => {
    const pages = read('renderer/src/threads/Pages.tsx');
    expect(pages).toContain("{col.state === 'waiting' && !withOthers ? 'Needs you' : col.label}{count > 0 && <b>{count}</b>}");
    expect(pages).toContain('{label}{count > 0 && <b>{count}</b>}');
  });
});

describe('a group opened from Team', () => {
  it('keeps the page called Team, not Chats', () => {
    expect(read('renderer/src/team/rooms/GroupsColumn.tsx')).toContain("{chats ? (team ? 'Team' : 'Chats') : 'Groups'}");
    expect(read('renderer/src/App.tsx')).toContain('<span className="workspace-title gc-col-title">{homeLayout === \'chats\' ? \'Team\' : \'Chats\'}</span>');
  });
});

describe('the command bar', () => {
  // A tester typed "Sofia" and got only "Waits on Sofia", an action, and no Sofia.
  it('finds a person on the team by name, and opens their page in Team', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/const persons = \(chatsValue\?\.persons \?\? \[\]\)\.filter\(\(p\) => p\.name\.toLowerCase\(\)\.split\(\/\\s\+\/\)\.some\(\(w\) => w\.startsWith\(q\.toLowerCase\(\)\)\)\);/);
    expect(app).toContain("run: () => { setModal(null); openChatsPlace(`person:${p.id}`); }");
  });
});

describe('a teammate’s thread opened from their page in Team', () => {
  // A tester opened Dev's "Seat picker for group bookings" from Dev's page: the
  // page was titled Threads, its back link said Threads, and no sidebar row was lit.
  const app = read('renderer/src/App.tsx');
  it('stays titled Team, with Team lit in the sidebar', () => {
    expect(app).toContain("const cardFromPlace = homeLayout === 'chats' && !!chatsPlace && !!openCard;");
    expect(app).toContain("<h1 className=\"workspace-title\">{openCard ? (cardFromPlace ? 'Team' : 'Inbox') : 'Team'}</h1>");
    expect(app).toContain('roomsUi.sidebarGroups(roomShown || directOpen || teammatesShown || chatsPlaceShown || cardFromPlace,');
  });
  it('goes back to the page it came from, by name', () => {
    expect(app).toContain("backLabel={roomsUi.roomName ?? (cardFromPlace ? (chatsPlace === 'team' ? 'Everyone' : members.find((m) => m.key === chatsPlace)?.name ?? 'Team') : 'Inbox')}");
  });
});
