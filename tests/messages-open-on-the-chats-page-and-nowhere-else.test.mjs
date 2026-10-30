// MESSAGES OPEN ON THE CHATS PAGE AND NOWHERE ELSE (w-2b3e1a85e5).
//
// w-b5f23cff71 opened every chat under Everything else's cards and took the
// Chats page away once a team was on. The sidebar's Chats row came back on
// 2026-10-28, which left the same chat in two places: under the cards from a
// card's Messages tab, and on the Chats page from the sidebar. Then: "having
// messages in two places might be a little confusing so we just need a better
// entry point into messages... we already built out the chat page. I think it
// worked pretty well." Read off App.tsx that day: a chatsPage flag picked one
// place or the other per open. Now a chat always opens on the Chats page, team
// or no team. A card's Message button is the way in from Everything else, and a
// person who shares no threads opens their chat there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SpaceBar } from '../renderer/src/team/everything/TeamStrip.tsx';
import { cardOpens } from '../renderer/src/team/everything/whose-board.ts';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

describe('what a card opens', () => {
  const sharing = new Set(['p-maya']);
  const chats = new Set(['p-maya', 'p-jun']);
  const opens = (key) => cardOpens(key, { team: 'room:r-team', shares: (id) => sharing.has(id), hasChat: (id) => chats.has(id) });

  it('is their work for you, the Team, an AI teammate and a person who shares threads', () => {
    expect(opens('me')).toBe('agents');
    expect(opens('room:r-team')).toBe('agents');
    expect(opens('mate:m-qa')).toBe('agents');
    expect(opens('person:p-maya')).toBe('agents');
  });

  it('is their chat for a person who shares no threads', () => {
    expect(opens('person:p-jun')).toBe('messages');
  });

  it('is the line that says so for a person who shares nothing and has no chat yet', () => {
    expect(opens('person:p-priya')).toBe('agents');
  });

  it('is the chat for a group chat or a direct record', () => {
    expect(opens('room:r-launch')).toBe('messages');
    expect(opens('direct:w-77')).toBe('messages');
  });
});

describe('the bar over someone\'s work', () => {
  const m = { key: 'person:p-maya', kind: 'person', name: 'Maya Costa', agents: 3, now: null };

  it('has a Message button where their tabs were', () => {
    const html = renderToStaticMarkup(h(SpaceBar, { m, tabs: [], onMessage() {} }));
    expect(html).toContain('class="ev-msg"');
    expect(html).toContain('Message');
    expect(html).not.toContain('tm-tab');
  });

  it('has none over your own threads', () => {
    expect(renderToStaticMarkup(h(SpaceBar, { m: { ...m, key: 'me', kind: 'me', name: 'You' }, tabs: [] }))).not.toContain('ev-msg');
  });
});

describe('in the app', () => {
  it('draws the Chats page with its list beside the chat, team or no team', () => {
    expect(app).toContain('<ChatsContext.Provider value={chatsValue}>');
    expect(app).not.toMatch(/inline: teamMode/);
    expect(app).not.toMatch(/chatsPage|inTeamChat|evFill/);
  });

  it('draws no chat under the cards', () => {
    expect(app).not.toContain('className="ev-space"');
    expect(app).toMatch(/const evOn = teamMode && search === null && !settingsOpen && !teamShown && !focusedRepeat && !focused && !teammatesShown && !roomShown/);
  });

  it('keeps the sidebar\'s Chats row the one it is without a team', () => {
    expect(app).toContain('groups={roomsUi.live ? roomsUi.sidebarGroups(roomShown || directOpen || teammatesShown, teammatesUi.live ? openChats : undefined) : teammatesUi.rail(teammatesShown)} />');
    expect(app).toContain('onGroupsPage={roomShown || directOpen}');
    expect(app).toContain('onTeammatesPage={teammatesShown}');
  });

  it('sends a card\'s Message to their chat', () => {
    expect(app).toMatch(/onMessage=\{\(\) => pickMember\(evMember\.key, 'messages'\)\}/);
  });
});
