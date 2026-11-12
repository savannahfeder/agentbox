// WITH A TEAM, EACH INBOX STATE IS A TAB OF ITS OWN (2026-11-09).
//
// On a team the Inbox drew two tabs, Needs you and In progress, and In
// progress opened a board with Later and Done as columns. The owner, after
// using it: she strongly prefers In progress, Later and Done each in their own
// tab, as a list, with B to switch to the board. The header sky also showed
// only on Needs you, because the sky was gated off whatever the old In progress
// page was. Measured by rendering the tab row with a team and reading App.tsx.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const counts = { inbox: 4, progress: 2, snoozed: 3, done: 9 };
const team = (over = {}) => ({ on: false, onNeeds() {}, onEverything() {}, states: { away: false, onTab() {} }, ...over });
const draw = (props) => renderToStaticMarkup(h(StateTabs, { view: 'inbox', counts, onView() {}, team: team(), ...props }));
const labels = (html) => [...html.matchAll(/class="tm-tab[^"]*"[^>]*>([A-Za-z ]+)/g)].map((m) => m[1].trim());
const lit = (html) => [...html.matchAll(/class="tm-tab on"[^>]*>([A-Za-z ]+)/g)].map((m) => m[1].trim());

describe('the tab row with a team, on a computer', () => {
  it('is Needs you, In progress, Later and Done', () => {
    expect(labels(draw())).toEqual(['Needs you', 'In progress', 'Later', 'Done']);
  });

  it('lights the tab you are on', () => {
    expect(lit(draw({ view: 'progress' }))).toEqual(['In progress']);
    expect(lit(draw({ view: 'snoozed' }))).toEqual(['Later']);
    expect(lit(draw({ view: 'done' }))).toEqual(['Done']);
  });

  it('lights nothing while a teammate\'s place is open', () => {
    expect(lit(draw({ view: 'inbox', team: team({ on: true, states: { away: true, onTab() {} } }) }))).toEqual([]);
  });

  it('has no Everything else', () => {
    expect(draw()).not.toContain('Everything else');
  });
});

describe('the tab row with a team, on a phone', () => {
  it('is still Needs you and Everything else', () => {
    expect(labels(draw({ team: team({ states: undefined }) }))).toEqual(['Needs you', 'Everything else']);
  });
});

describe('in the app', () => {
  it('opens each tab as a list of its own, not one stacked list', () => {
    expect(app).toMatch(/states: !onPhone\(\) \? \{ away: !!evPick, onTab: \(v: View\) => goMine\(v\) \}/);
    expect(app).toMatch(/if \(!\(teamMode && onPhone\(\) && view !== 'inbox'/);
  });

  it('walks all four with Tab', () => {
    expect(app).toMatch(/if \(teamMode\) \{ goMine\(evPick \? 'inbox' : nextTab\(stateTabOrder, view, e\.shiftKey\)/);
  });

  it('starts each tab as the list, B switching to the board', () => {
    expect(app).toMatch(/evChosen \?\? 'list';/);
  });

  // Second round: B did nothing on Needs you, and the board sat under the In
  // progress tab without a Needs you column. B is the whole board, as without a team.
  it('lets B open the board from Needs you too, on a computer', () => {
    expect(app).toMatch(/if \(search === null && !teamShown && \(view !== 'inbox' \|\| !onPhone\(\)\)\) \{ e\.preventDefault\(\); setEvView\(flipEvView\(evView\)\)/);
  });

  it('draws your board as the one without a team: every column, Needs you too, and no tabs over it', () => {
    expect(app).toMatch(/const mineBoard = teamMode && !onPhone\(\) && evView === 'board' && !evPick && search === null;/);
    // `boardDrawn` holds this rule, which the tutorial's board beat reads too.
    expect(app).toMatch(/const boardDrawn = teamMode \? mineBoard : search === null && inboxDisplay\.view === 'board';/);
    expect(app).toMatch(/\{boardDrawn && !roomShown \? \(<>/);
    expect(app).toMatch(/order: evBoard \? evColumns\(columnOrder\) : columnOrder/);
    expect(app).toMatch(/teamMode && \(onPhone\(\) \? view !== 'inbox' : !!evPick\) && evView === 'board'/);
  });

  it('wears the dark sky on every tab, the board too, but not on a teammate\'s place', () => {
    const rule = app.match(/const skyOnInbox = [\s\S]*?;\n/)[0];
    expect(rule).toContain("['inbox', 'progress', 'snoozed', 'done']");
    expect(rule).not.toContain('!evOn');
    expect(rule).not.toContain('!onBoard');
    expect(rule).toContain('!evPick');
  });
});
