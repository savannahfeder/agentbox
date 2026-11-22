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
// whatever the team state was (a fourth, the side summary's "Visible to" row,
// went with that panel):
//   - the empty inbox: "Start a thread and an agent picks it up, or message a
//     teammate."
// The walk's two went with the walk (2026-11-21); the empty inbox is pinned here.

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { InboxClear } from '../renderer/src/threads/Pages';

const TEAM_WORDS = /\bteam\b|teammate|Visible to/i;
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// The empty inbox has no sentence of its own since w-4e9f957f97: it is the
// heading over the New thread box, whose To menu is where a teammate is offered.
describe('the empty inbox', () => {
  const draw = () => text(renderToStaticMarkup(React.createElement(InboxClear, { slot: () => {} })));
  it('names no teammate', () => {
    expect(draw()).not.toMatch(TEAM_WORDS);
    expect(draw()).toMatch(/Nothing needs you/);
  });
});
