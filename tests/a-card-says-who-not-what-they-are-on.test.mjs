// A CARD SAYS WHO, NOT WHAT THEY ARE ON (w-2b3e1a85e5).
//
// "I found the cards at the top, especially when they have images of team
// members, to be a little unnecessarily wide... I also don't need to know what
// people are actively doing, so I don't need to see the active task. I feel
// like the cards can be a little bit narrower and a little bit taller... Being
// able to put more in that row would actually be preferable." Measured on the
// 2026-10-28 drawing at her zoom: four cards to a row, each 290 points or
// wider, with a line of what each was on and names cut to "Growth mar...".
// Now a card is a face over a name over the agents line, and a row holds twice
// as many.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeamStrip } from '../renderer/src/team/everything/TeamStrip.tsx';
import { buildMembers } from '../renderer/src/team/everything/members.ts';

const css = fs.readFileSync(new URL('../renderer/src/team/everything/everything.css', import.meta.url), 'utf8');
const members = [
  { key: 'me', kind: 'me', name: 'You', faceName: 'Sam Rivera', avatarUrl: 'https://example.com/sam.png', agents: 16, now: 'Fix mobile inbox crowding', level: 53 },
  { key: 'room:r-team', kind: 'chat', team: true, name: 'Team', faces: [{ name: 'Maya Costa', url: null }], last: 'Maya: Pushed the new colours', unread: true, agents: 6, now: null },
  { key: 'person:p-maya', kind: 'person', name: 'Maya Costa', agents: 3, now: 'Brand colours for the launch' },
  { key: 'person:p-jun', kind: 'person', name: 'Jun Park', agents: null, now: 'Not on Rooms yet' },
  { key: 'mate:t-ada', kind: 'mate', name: 'Growth marketer', letter: 'G', role: 'Posts and outreach', agents: 0, now: 'Waiting on you' },
  { key: 'room:r-launch', kind: 'chat', team: false, name: 'Launch crew', faces: [{ name: 'Maya Costa', url: null }, { name: 'Jun Park', url: null }], last: 'Maya: the deck is in', unread: true, agents: null, now: null },
  { key: 'room:r-design', kind: 'chat', team: false, name: 'Design review', faces: [{ name: 'Maya Costa', url: null }], last: 'You: ship it', unread: false, agents: null, now: null },
];
const cardOf = (key) => { const at = html.indexOf(`data-key="${key}"`); return html.slice(at, html.indexOf('data-key=', at + 10) === -1 ? undefined : html.indexOf('data-key=', at + 10)); };
const html = renderToStaticMarkup(h(TeamStrip, { members, picked: 'me', onPick() {}, onMove() {} }));

describe('a card', () => {
  it('leaves out what they are on, and an AI teammate\'s job', () => {
    for (const words of ['Fix mobile inbox crowding', 'Brand colours for the launch', 'Waiting on you', 'Posts and outreach', 'Pushed the new colours', 'the deck is in']) {
      expect(html).not.toContain(words);
    }
  });

  it('keeps the face, the name and how many agents are working', () => {
    expect(html).toContain('src="https://example.com/sam.png"');
    expect(html).toContain('Maya Costa');
    expect(html).toContain('16 AGENTS');
    expect(html).toContain('3 AGENTS');
    expect(html).toContain('NOT RUNNING');
  });

  it('says whether a chat has something new', () => {
    expect(cardOf('room:r-launch')).toContain('New messages');
    expect(cardOf('room:r-design')).toContain('Chat');
    expect(cardOf('room:r-design')).not.toContain('New messages');
  });

  it('says on the Team how many agents its people run, and marks its chat when something is new', () => {
    expect(cardOf('room:r-team')).toContain('6 AGENTS');
    expect(cardOf('room:r-team')).toContain('class="ev-new"');
    expect(cardOf('room:r-team')).not.toContain('>New messages');
  });

  it('says nothing under someone who keeps their agents to themselves', () => {
    expect(cardOf('person:p-jun')).toContain('Jun Park');
    expect(cardOf('person:p-jun')).not.toMatch(/AGENT|RUNNING/);
  });
});

describe('the row', () => {
  it('fits narrower cards, so more of the team is in one row', () => {
    const min = Number(css.match(/\.ev-strip \{[^}]*minmax\((\d+)px/)[1]);
    expect(min).toBeLessThanOrEqual(150);
    expect(min).toBeGreaterThanOrEqual(130);
  });

  it('stacks the face over the name', () => {
    expect(css).toMatch(/\.ev-card \{[^}]*flex-direction: column/);
  });
});

describe('the Team card', () => {
  it('is called Team, because it opens everybody\'s work as well as the team\'s chat', () => {
    const got = buildMembers({ me: { id: 'p-me', name: 'Sam Rivera', avatarUrl: null }, people: [{ id: 'p-me', name: 'Sam Rivera', avatarUrl: null }],
      chats: [{ key: 'room:r-team', name: 'Northwind', faces: [], last: 'hi', at: 1, unread: false }], teamRoomId: 'r-team' });
    expect(got.find((m) => m.team)?.name).toBe('Team');
  });
});
