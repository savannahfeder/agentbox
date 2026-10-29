// THE CARDS ARE THE SAME WHOEVER IS PICKED (w-b5f23cff71). It was "a chat opens
// under the same cards" until chats moved to the Chats page (w-2b3e1a85e5).
//
// "I didn't like those cards up front ... when you click on a person's face,
// it shows In Progress or the chat, and it keeps the same stuff up top. That's
// exactly what we should be doing: in this chat everything is just another
// chat and you don't need a separate UI there." Opening a chat under
// Everything else shrank the cards to a strip of one-line chips, so the team
// chat (design 81) read as another page from the one with your threads (80),
// where the full cards stayed. Now the cards are the same full cards whatever
// is open under them; only the space below changes.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamStrip } from '../renderer/src/team/everything/TeamStrip.tsx';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/team/everything/everything.css');

const members = [
  { key: 'me', kind: 'me', name: 'You', faceName: 'Sam Rivera', agents: 2, now: 'Signup flow' },
  { key: 'room:r-team', kind: 'chat', team: true, name: 'Team chat', faces: [{ name: 'Maya Costa', url: null }], last: 'Theo: Lock screen works', unread: true, agents: 3, now: null },
  { key: 'person:p-maya', kind: 'person', name: 'Maya Costa', agents: 14, now: 'Billing page', level: 80 },
];

describe('the cards over an open chat', () => {
  it('are the full cards, the same as over your own threads', () => {
    for (const picked of ['me', 'room:r-team', 'person:p-maya']) {
      const html = renderToStaticMarkup(h(TeamStrip, { members, picked, onPick() {}, onMove() {} }));
      expect(html).toContain('class="ev-strip"');
      expect(html.match(/class="ev-t"/g)).toHaveLength(3);
      expect(html).toContain('14 AGENTS');
    }
  });

  it('have no one-line form left to switch to', () => {
    expect(read('renderer/src/team/everything/TeamStrip.tsx')).not.toMatch(/compact/);
    expect(css).not.toMatch(/\.compact/);
    expect(app).not.toMatch(/compact=\{/);
  });

  it('have no chat under them to make room for', () => {
    expect(css).not.toMatch(/\.ev-space|\.ev-open/);
  });
});
