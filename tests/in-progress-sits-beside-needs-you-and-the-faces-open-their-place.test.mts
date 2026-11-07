// IN PROGRESS SITS BESIDE NEEDS YOU, AND THE FACES OPEN THEIR PLACE (2026-10-30).
//
// The owner: "sometimes I need to go to agents that are in progress ... Right
// now I don't see a path to doing so." On the three-panel home the only way in
// was your own row in the team panel, and that panel took 260px of a 1440px
// window. The panel is gone. A small row of faces sits at the end of the Needs
// you line, and "In progress 3" is the second word on it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NeedsFaces } from '../renderer/src/team/everything/TeamStrip.tsx';
import { faceRow, pressOpensIn } from '../renderer/src/team/everything/place.ts';
import { stackRows } from '../renderer/src/threads/stack-rules.ts';

const read = (p) => fs.readFileSync(new URL(`../renderer/src/${p}`, import.meta.url), 'utf8');
const app = read('App.tsx');
const pages = read('threads/Pages.tsx');
const m = (key, kind, over = {}) => ({ key, kind, name: key, ...over });
const TEAM = 'room:r-team';

describe('the faces at the end of the Needs you line', () => {
  const row = faceRow([m('theirmate:p:t2', 'mate'), m(TEAM, 'chat', { team: true }), m('person:p', 'person'), m('room:r-x', 'chat'), m('mate:t1', 'mate'), m('me', 'me')]);

  it('run You, Team, people, then AI teammates', () => {
    expect(row.map((x) => x.key)).toEqual(['me', TEAM, 'person:p', 'mate:t1', 'theirmate:p:t2']);
  });

  it('leave a group chat out: it is not someone on the team', () => {
    expect(row.some((x) => x.key === 'room:r-x')).toBe(false);
  });

  it('are not drawn with nobody else on the team', () => {
    expect(faceRow([m('me', 'me')])).toEqual([]);
  });
});

describe('what a face says', () => {
  const draw = (waits) => renderToStaticMarkup(h(NeedsFaces, {
    members: [m('me', 'me', { agents: 0, now: null }), m('person:dev', 'person', { name: 'Dev', agents: 0, now: null }), m('mate:t1', 'mate', { name: 'Quality lead', letter: 'Q', agents: 0, now: null })],
    picked: null, waits: new Map(waits), onPick() {},
  }));

  it('wears a dot and says so when something of theirs is in your list', () => {
    const html = draw([['person:dev', 1]]);
    expect(html.match(/ev-cd/g)).toHaveLength(1);
    expect(html).toContain('Waiting on you');
  });

  it('wears no dot when nothing of theirs is', () => {
    expect(draw([])).not.toContain('ev-cd');
  });

  it('never wears a dot on you', () => {
    expect(draw([['me', 2]])).not.toContain('ev-cd');
  });

  it('says only the name when there is no state to say', () => {
    const html = renderToStaticMarkup(h(NeedsFaces, { members: [m('me', 'me'), m('person:dev', 'person', { name: 'Dev', agents: null, now: null })], picked: null, waits: new Map(), onPick() {} }));
    expect(html).toContain('<b>Dev</b></span>');
  });

  it('draws an AI teammate with the dashed mark', () => {
    expect(draw([])).toContain('ev-ai');
  });
});

describe('what pressing a face opens', () => {
  it('a person or an AI teammate opens their place', () => {
    for (const key of ['person:p', 'mate:t1', 'theirmate:p:t2']) expect(pressOpensIn(key, TEAM)).toBe('place');
  });

  it('you and the team do not open a place', () => {
    expect(pressOpensIn('me', TEAM)).toBe('board');
    expect(pressOpensIn(TEAM, TEAM)).toBe('board');
  });

  it('a group chat is not a place either', () => {
    expect(pressOpensIn('room:r-x', TEAM)).toBe('chat');
  });
});

describe('the home has no panel', () => {
  it('draws no team rail', () => {
    expect(app).not.toMatch(/TeamRail|HomeSplit/);
    expect(fs.existsSync(new URL('../renderer/src/team/everything/TeamRail.tsx', import.meta.url))).toBe(false);
  });

  it('offers no choice of layout', () => {
    expect(pages).not.toContain('>One list<');
    expect(pages).not.toContain('>Two tabs<');
    expect(pages).not.toContain('Team beside Needs you');
  });
});

describe('In progress beside Needs you', () => {
  // Your AI teammates' runs are yours too, led by their names
  // (your-ai-teammates-threads-sit-on-your-board-under-their-names).
  const rows = [
    { id: 'running', status: 'open', updatedAt: 5 },
    { id: 'waits-on-dev', status: 'blocked', updatedAt: 4 },
    { id: 'a-mates-run', status: 'open', labels: ['teammate:t-1'], updatedAt: 3 },
  ];

  it('opens on In progress, with Later and Done today under it', () => {
    const s = stackRows({ progress: rows, later: [{ id: 'l', updatedAt: 1 }], done: [], dayStart: 0, folded: new Set() });
    expect(s.sections.map((x) => x.label)).toEqual(['In progress', 'Later']);
    expect(s.rows.map((i) => i.id)).toEqual(['running', 'waits-on-dev', 'a-mates-run', 'l']);
  });

  it('is the second word on the line, and is the same number the list draws', () => {
    expect(pages).toMatch(/team\?\.progress && <button.*onClick=\{team\.onEverything\}>In progress/);
    expect(app).toMatch(/progress: !onPhone\(\) \? \{ count: mineShown \? shownCount\(progressTab\) : 0/);
    expect(app).toMatch(/stackRows\(\{ progress: shownAs\(progressTab, 'progress'\)/);
  });

  it('is what Tab goes to from Needs you, and Tab comes back', () => {
    expect(app).toMatch(/if \(teamMode\) \{ if \(view === 'inbox' && !evPick\) pickMember\('me'\); else goNeedsYou\(\); return; \}/);
  });

  it('opens as a list without a team, and as the board, with Later and Done, with one', () => {
    expect(app).toMatch(/evChosen \?\? \(homeLayout === 'list' \? 'list' : 'board'\)/);
  });
});
