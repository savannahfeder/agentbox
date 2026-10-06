// FINISHING A TASK OPENED FROM THE BOARD OPENS THE NEXT ONE, WHATEVER TAB THE
// LIST WAS LAST ON.
//
// Reported 2026-10-05 (w-34eb858714): "every time I submit a task here and
// it's under Waiting, it doesn't bring me back to the next task. Instead it
// brings me back to the task board page." The board is meant for the same
// flow as the list: finish one, land on the next, until there are none.
//
// The cause: the board hides the tabs but the page still remembers the one
// the list was last on (`view` in App.tsx), and the effect that opens the next
// task ran only when that hidden tab was Needs you. Measured headless on the
// fixture inbox (scripts/probe-the-board-moves-on.mjs) against the build her
// app was running: the list last on Needs you, E on the first Waiting card
// opened the next task; the list last on All, or on Done, the same press put
// her back on the board. Two of three starting tabs dropped her.
//
// The Waiting column IS the inbox, so on the board the advance runs whatever
// the hidden tab says. In the list it still runs only on Needs you, because a
// task finished from the Done or All tab is not her working down her inbox.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceLandsHere } from '../renderer/src/advance';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

describe('on the board', () => {
  // Her case: the list was last on another tab, then B.
  it.each(['done', 'all', 'progress', 'snoozed'])('advances when the hidden tab is %s', (view) => {
    expect(advanceLandsHere({ view, onBoard: true })).toBe(true);
  });

  it('advances when the hidden tab is Needs you, as it already did', () => {
    expect(advanceLandsHere({ view: 'inbox', onBoard: true })).toBe(true);
  });
});

describe('in the list', () => {
  it('advances on Needs you', () => {
    expect(advanceLandsHere({ view: 'inbox', onBoard: false })).toBe(true);
  });

  // The case that must NOT change: the Done and All tabs are not the inbox, so
  // finishing a task there is not working down it.
  it.each(['done', 'all', 'progress', 'snoozed'])('does not advance on the %s tab', (view) => {
    expect(advanceLandsHere({ view, onBoard: false })).toBe(false);
  });
});

// THE SAME HIDDEN TAB NAMED THE WAY BACK. Photographed on the fixed build: a
// Waiting task opened from the board read "DONE / ONBOARDING: …" at the top,
// because the list had last been on Done. On the board there is no tab, and
// the page Esc goes back to is headed Threads, so that is what it says.
describe('the way back from a task opened on the board', () => {
  const crumb = app.slice(app.indexOf('crumbFrom={'), app.indexOf('inlineArtifacts=', app.indexOf('crumbFrom={')));

  it('says Threads, not the tab the list was last on', () => {
    expect(crumb).toMatch(/onBoard \? 'Threads'/);
  });

  // In the list it still names the tab, as w-922f66bb06 approved.
  it('still names the tab in the list', () => {
    expect(crumb).toContain("INBOX_TABS.find((t) => t.view === view)?.label");
    expect(crumb.indexOf("onBoard ? 'Threads'")).toBeLessThan(crumb.indexOf('INBOX_TABS.find'));
  });
});

describe('the effect that opens the next task', () => {
  const start = app.indexOf('const next = nextAfterAdvance(');
  const effect = app.slice(app.lastIndexOf('useEffect(', start), app.indexOf('}, [', start));

  it('asks the rule rather than testing the tab itself', () => {
    expect(effect).toContain('advanceLandsHere(');
    expect(effect).not.toMatch(/view !== 'inbox'/);
  });

  // On the board the keyboard counts places in the board's own reading order,
  // not the inbox's, so the highlight has to be found by id there.
  it('puts the keyboard on the opened card by its id, not by its inbox place', () => {
    expect(effect).toMatch(/list\.findIndex\(/);
  });
});
