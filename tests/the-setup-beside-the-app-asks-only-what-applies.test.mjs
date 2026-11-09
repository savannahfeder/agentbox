// THE SETUP BESIDE THE APP ASKS ONLY WHAT APPLIES (w-fbe5e95dea, 2026-11-09).
//
// The approved design is steps on the left and the real app on the right,
// filling in as you go: bring in your chats or pick a folder, connect tools,
// invite your team, add AI teammates, pick a look, then the inbox. Most people
// using it are not on a team, so a step that cannot apply on this build is not
// shown at all rather than shown and skipped. Measured against the designs in
// the thread's final-flow folder. Two synthetic testers then found the AI
// teammates step offered after the folder was skipped, where it can only answer
// "make a project first", and four sky looks offered on a copy with Home off,
// where a sky is never drawn and picking one changed nothing on screen, and
// every tool's Connect failing on a computer that cannot keep a sign-in; the
// founder then cut the tools step altogether.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  setupSteps, stepLabel, typingInSetup, setupStartsOn, tourCount, lookChoices, starterChoices, inviteList, setUpLines, tourChecklist,
} from '../renderer/src/setup-split.ts';

describe('which steps the setup shows', () => {
  it('shows every step on a team build with chats and teammates on', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: true, project: true })).toEqual(['chats', 'invite', 'teammates', 'look']);
  });
  it('asks for a folder instead of chats when this computer has none', () => {
    expect(setupSteps({ chats: 0, team: true, teammates: true, project: true })[0]).toBe('folder');
  });
  it('leaves out inviting on a build with no team cloud', () => {
    expect(setupSteps({ chats: 2, team: false, teammates: true, project: true })).not.toContain('invite');
  });
  it('leaves out AI teammates while they are off', () => {
    expect(setupSteps({ chats: 2, team: true, teammates: false, project: true })).not.toContain('teammates');
  });
  it('counts steps from the list it shows', () => {
    const steps = setupSteps({ chats: 1, team: false, teammates: false, project: true });
    expect(stepLabel(steps, 'look')).toBe('Step 2 of 2');
  });
  it('leaves out AI teammates when there is no project for them to work in', () => {
    expect(setupSteps({ chats: 0, team: false, teammates: true, project: false })).toEqual(['folder', 'look']);
  });
  // The founder (2026-11-09): "kill the connections page since their claude/codex will already have connections".
  it('never asks to connect tools', () => {
    expect(setupSteps({ chats: 1, team: true, teammates: true, project: true })).not.toContain('connect');
  });
  it('keeps AI teammates once a project exists, however it was made', () => {
    expect(setupSteps({ chats: 0, team: false, teammates: true, project: true })).toContain('teammates');
  });
});

describe('the looks offered', () => {
  it('puts the look you have first, then the dark orange sky', () => {
    expect(lookChoices('sage', true).slice(0, 2)).toEqual(['sage', 'ember']);
  });
  it('does not offer the light pink sky unless you already wear it', () => {
    expect(lookChoices('light', true)).not.toContain('dusk-light');
    expect(lookChoices('dusk-light', true)[0]).toBe('dusk-light');
  });
  it('lists each look once', () => {
    const l = lookChoices('ember', true);
    expect(new Set(l).size).toBe(l.length);
  });
  it('offers only Light and Dark where no sky is drawn, the one you have first', () => {
    expect(lookChoices('dark', false)).toEqual(['dark', 'light']);
    expect(lookChoices('light', false)).toEqual(['light', 'dark']);
  });
  it('counts a sky you wear without Home as its own light or dark', () => {
    expect(lookChoices('dusk', false)).toEqual(['dark', 'light']);
    expect(lookChoices('sage', false)).toEqual(['light', 'dark']);
  });
});

describe('the AI teammates offered', () => {
  const starters = [
    { starter: 'chief', name: 'Chief of staff', ask: 'Be the one I talk to' },
    { starter: 'quality', name: 'Quality lead', ask: 'Find bugs before your users do' },
    { starter: 'maintainer', name: 'Maintainer', ask: 'Fix what gets filed' },
    { starter: 'marketing', name: 'Marketing lead', ask: 'Post about what we build' },
  ];
  it('offers the engineering jobs first and only real starters', () => {
    expect(starterChoices(starters).map((s) => s.starter)).toEqual(['quality', 'maintainer', 'chief']);
  });
  it('offers nothing when every starter is already on the team', () => {
    expect(starterChoices([])).toEqual([]);
  });
});

describe('the people invited', () => {
  it('keeps each address once and drops what is not an address', () => {
    expect(inviteList(['maya@northwind.dev', 'Maya@Northwind.dev ', 'theo', ''])).toEqual(['maya@northwind.dev']);
  });
});

describe('what the last screen says was set up', () => {
  it('says only what happened, in counts', () => {
    expect(setUpLines({ chats: 4, project: null, invited: 3, teammates: ['Quality lead'] }))
      .toEqual(['4 chats brought in', '3 teammates invited', 'Quality lead added']);
  });
  it('names the project made from a folder, and says nothing of steps skipped', () => {
    expect(setUpLines({ chats: 0, project: 'storefront', invited: 0, teammates: [] })).toEqual(['storefront is ready']);
  });
  it('uses the singular for one', () => {
    expect(setUpLines({ chats: 1, project: null, invited: 1, teammates: [] })).toEqual(['1 chat brought in', '1 teammate invited']);
  });
});

describe('the step list beside the tour', () => {
  it('ticks what the tour has taught and lights the next one', () => {
    const list = tourChecklist(['start', 'compose', 'open']);
    expect(list.map((r) => r.state)).toEqual(['done', 'done', 'now', 'todo', 'todo']);
  });
  it('counts answering by either a choice or a reply', () => {
    expect(tourChecklist(['start', 'compose', 'open', 'reply'])[2].state).toBe('done');
  });
  it('lights the step the tour is pointing at, which is Open one when chats came in', () => {
    const list = tourChecklist([], '⌘', 'open');
    expect(list.find((r) => r.state === 'now').label).toBe('Open one');
    expect(list.filter((r) => r.state === 'now')).toHaveLength(1);
  });
  it('keeps a done row ticked when the tour points back at it, and lights the next one instead', () => {
    const list = tourChecklist(['start', 'compose', 'open'], '⌘', 'working');
    expect(list.map((r) => r.state)).toEqual(['done', 'done', 'now', 'todo', 'todo']);
  });
  it('has every row done once the tour is over', () => {
    expect(tourChecklist(['start', 'compose', 'open', 'choose', 'close', 'palette']).every((r) => r.state === 'done')).toBe(true);
  });
});

describe('the keyboard while the setup is open', () => {
  // After the folder picker closed, focus went back to the composer drawn
  // behind the setup: Enter did nothing and letters went into a hidden box.
  const el = (inSetup, field) => ({ closest: (sel) => (sel.includes('.setup-split') ? inSetup : sel.includes('input') ? field : false) });
  it('counts a box in the setup as typing', () => {
    expect(typingInSetup(el(true, true))).toBe('typing');
  });
  it('counts the rest of the setup as keys for its buttons', () => {
    expect(typingInSetup(el(true, false))).toBe('keys');
  });
  it('takes keys aimed at the hidden app behind it for the setup', () => {
    expect(typingInSetup(el(false, true))).toBe('behind');
    expect(typingInSetup(null)).toBe('keys');
  });
});

describe('the look a new install starts on', () => {
  // The founder, on the first try of the real app: it opened on the inbox in
  // plain dark, offered only Light and Dark, and should start on Home with the
  // dark orange sky.
  it('turns Home on and wears the dark orange sky when nothing was chosen', () => {
    expect(setupStartsOn({ home: null, sky: null })).toEqual({ home: true, sky: 'ember' });
  });
  it('keeps a sky someone already chose', () => {
    expect(setupStartsOn({ home: '1', sky: 'sage' })).toEqual({ home: true, sky: null });
  });
  it('leaves Home off when someone turned it off', () => {
    expect(setupStartsOn({ home: '0', sky: null })).toEqual({ home: false, sky: null });
  });
});

describe('the app behind the setup', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
  // Chats brought in landed in the inbox while the preview's new-thread box had
  // the keyboard, and the app moved that box into its dialog over the preview.
  it('never moves the new-thread box into its dialog during the first run', () => {
    expect(app).toMatch(/const clearMoves = !fresh && view === 'inbox'/);
  });
  it('takes the keyboard off the app behind it when it opens', () => {
    expect(split).toMatch(/document\.activeElement as HTMLElement \| null\)\?\.blur\(\)/);
  });
});

describe('the walkthrough list beside the app', () => {
  const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');
  // ⌘K and the new-thread card centred on the whole window, half over the list.
  it('centres the dialogs on the app, not the window', () => {
    expect(css).toMatch(/:root\[data-tour-list\] \.modal-backdrop \{ left: var\(--tl-w\)/);
  });
});

describe('the walkthrough counter', () => {
  // A tester saw it go from 3 of 5 back to 2 of 5 when the tour pointed back at Open one.
  it('counts what is done, so it never goes backwards', () => {
    expect(tourCount(tourChecklist(['start', 'compose', 'open'], '⌘', 'working'))).toBe('3 of 5');
    expect(tourCount(tourChecklist(['start', 'compose', 'open'], '⌘', 'open'))).toBe('3 of 5');
  });
  it('starts at 1 and stops at the last', () => {
    expect(tourCount(tourChecklist([]))).toBe('1 of 5');
    expect(tourCount(tourChecklist(['start', 'compose', 'open', 'choose', 'close', 'palette']))).toBe('5 of 5');
  });
});

describe('the walkthrough highlight', () => {
  // The founder: "highlights are buggy". The box round a row took in its words
  // and icons but not the unread dot, which pages.css draws as the row's
  // ::before, so the dot sat outside the box.
  const tour = fs.readFileSync(new URL('../renderer/src/components/Tour.tsx', import.meta.url), 'utf8');
  it('takes in a mark the row draws as ::before', () => {
    expect(tour).toMatch(/getComputedStyle\(el, '::before'\)/);
  });
});

describe('the walkthrough teaches E in one press', () => {
  // The founder: "why is it asking me to hit e twice?" The tour says press E to
  // close, and the one-time warning about closing a thread whose agent waits on
  // you took the first press.
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('does not stop the close the tour is teaching', () => {
    expect(app).toMatch(/const teachingClose = !!tour && tourLive\(tour\) && !tour\.done\.includes\('close'\)/);
    expect(app).toMatch(/if \(!chosen && !teachingClose && nudgeOnStopped\(\[item\], 'E'\)\) return;/);
  });
});
