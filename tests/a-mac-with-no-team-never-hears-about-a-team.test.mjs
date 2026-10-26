// A MAC WITH NO TEAM NEVER HEARS ABOUT A TEAM.
//
// Asked before launch (w-db6f5e331e): multiplayer "should not be usable by
// anyone outside of us", and for everyone else "I don't think it needs to be
// mentioned at all".
//
// What was measured before this change. Team mode itself was already off for
// the public: it only starts when cloud/team.config.json is in the app folder,
// and neither the npm package nor the desktop build carries that file. But four
// sentences reached a person with no team regardless, because they were drawn
// whatever the team state was:
//   - the summary panel's "Visible to: Team" row, with a Team / Chosen people
//     menu (a thread with no visibility reads as "team" when there is no team);
//   - the walk's "who" beat: "Every thread goes to an agent, or to a person on
//     your team.";
//   - the walk's last card: "Open Team to see what your teammates are working
//     on...";
//   - the empty inbox: "Start a thread and an agent picks it up, or message a
//     teammate."
// Each is pinned both ways here: gone with no team, still there with one.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SummaryPanel } from '../renderer/src/threads/Summary';
import { InboxClear } from '../renderer/src/threads/Pages';
import { COACHED, COPY, coach } from '../renderer/src/onboarding';

const TEAM_WORDS = /\bteam\b|teammate|Visible to/i;
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const NOW = Date.now();
const item = {
  id: 'w-1', product: 'north', productName: 'Northwind', title: 'Send the terms', status: 'open',
  kind: 'task', labels: [], priority: 5, createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
};
const team = { state: { since: 0, signedIn: true }, me: 'p-me', byId: new Map(), products: new Map() };

describe('the summary panel', () => {
  const draw = (t) => text(renderToStaticMarkup(React.createElement(SummaryPanel, { item, items: [item], team: t })));
  it('has no Visible to row when there is no team', () => {
    expect(draw(null)).not.toMatch(TEAM_WORDS);
  });
  it('still has it on a team', () => {
    expect(draw(team)).toMatch(/Visible to/);
  });
});

describe('the walk', () => {
  // THE "WHO" BEAT IS GONE (2026-10-06), the one card that named a team in the
  // middle of the walk: single player, so a thread only ever goes to an agent.
  // What is pinned now is the whole walk: no card in it names a team on a
  // Mac with no team, in any half of any beat.
  it('names no team on any card of the walk, on a Mac with no team', () => {
    expect(coach('who', 0, {})).toBeNull();
    for (const step of COACHED) {
      for (const ctx of [{}, { opened: true }, { picking: true }, { palette: true }, { board: true }, { replies: 1 }]) {
        const say = coach(step, 0, ctx);
        if (say) expect(`${say.quiet} ${say.lead}${say.tail}`, `${step} ${JSON.stringify(ctx)}`).not.toMatch(TEAM_WORDS);
      }
    }
  });
  it('ends with a next step that names no team', () => {
    expect(COPY.finishNext.join(' ')).not.toMatch(TEAM_WORDS);
    expect(COPY.finishNext.join(' ')).toMatch(/thread/);
  });
  it('adds the Team line only on a team', () => {
    expect(COPY.finishNextTeam.join(' ')).toMatch(/\bTeam\b/);
    const view = fs.readFileSync(new URL('../renderer/src/components/Onboarding.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/team \? COPY\.finishNextTeam : \[\]/);
  });
});

// The empty inbox has no sentence of its own since w-4e9f957f97: it is the
// heading over the New thread box, whose To menu is where a teammate is offered.
describe('the empty inbox', () => {
  const draw = () => text(renderToStaticMarkup(React.createElement(InboxClear, { slot: () => {} })));
  it('names no teammate', () => {
    expect(draw()).not.toMatch(TEAM_WORDS);
    expect(draw()).toMatch(/Nothing needs you/);
  });
});
