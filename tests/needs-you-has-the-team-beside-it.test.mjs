// NEEDS YOU HAS THE TEAM BESIDE IT.
//
// The owner, 2026-11-02: "a very large portion of people will still want
// messages from their team to be accessible and easily visible". The panel
// beside Needs you came back, then Team took its place: a row in the sidebar
// holding everyone's day and a page for each person. What stays beside Needs
// you is the row of the team's faces, each saying when it waits on you and
// opening that person's page in Team. Before this, the two-tab layout drew a
// different set of faces in the same corner, so which one you saw depended on
// a choice in View and filters.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NeedsFaces } from '../renderer/src/team/everything/TeamStrip.tsx';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const m = (key, kind, over = {}) => ({ key, kind, name: key, agents: 0, now: null, ...over });
const members = [m('me', 'me'), m('person:p-dev', 'person', { name: 'Dev Patel' }), m('person:p-so', 'person', { name: 'Sofia Reyes' })];
const draw = (waits) => renderToStaticMarkup(React.createElement(NeedsFaces, { members, picked: null, waits, onPick: () => {} }));

describe('the faces beside Needs you', () => {
  it('name the team, and mark the one who waits on you', () => {
    const html = draw(new Map([['person:p-dev', 1]]));
    expect(html).toContain('aria-label="Your team"');
    expect(html).toMatch(/aria-label="Open Dev Patel"[^>]*><[^]*?ev-cd/);
    expect(html.match(/ev-cd/g)).toHaveLength(1);
  });

  it('mark nobody when nobody waits on you', () => {
    expect(draw(new Map())).not.toContain('ev-cd');
  });
});

describe('in the app', () => {
  const app = read('renderer/src/App.tsx');

  it('are the one set of faces on that line, whatever was picked before', () => {
    expect(app).toMatch(/corner: onPhone\(\) \? null\n\s+: <NeedsFaces /);
    expect(app).not.toContain('<CornerFaces');
  });

  it('open a person on their page in Team', () => {
    expect(app).toMatch(/pressOpensIn\(key, evTeamKey \? `room:\$\{evTeamKey\}` : null\) === 'place'\) \{ openChatsPlace\(key\); return; \}/);
  });
});
