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
  setupSteps, stepLabel, typingInSetup, setupLook, tourCount, lookChoices, starterChoices, inviteList, setUpLines, tourChecklist,
} from '../renderer/src/setup-split.ts';

describe('which steps the setup shows', () => {
  // The founder (2026-11-09): "we are making login required so this is not a
  // logical flow, anything that requires login should come after that step".
  it('signs in as a step of its own, after the first one, before inviting', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: true, project: true, signedIn: false, plan: 'pro' })).toEqual(['chats', 'account', 'plan', 'invite', 'pay', 'teammates', 'look']);
  });
  it('skips the sign-in step for someone already signed in', () => {
    expect(setupSteps({ chats: 0, team: true, teammates: false, project: true, signedIn: true, plan: 'pro' })).toEqual(['folder', 'plan', 'invite', 'pay', 'look']);
  });
  it('has no sign-in step on a build with no account to sign in to', () => {
    expect(setupSteps({ chats: 0, team: false, teammates: false, project: true, signedIn: false })).toEqual(['folder', 'look']);
  });
  it('shows every step on a team build with chats and teammates on', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: true, project: true, signedIn: true, plan: 'pro' })).toEqual(['chats', 'plan', 'invite', 'pay', 'teammates', 'look']);
  });
  it('asks for a folder instead of chats when this computer has none', () => {
    expect(setupSteps({ chats: 0, team: true, teammates: true, project: true })[0]).toBe('folder');
  });
  it('leaves out inviting on a build with no team cloud', () => {
    expect(setupSteps({ chats: 2, team: false, teammates: true, project: true })).not.toContain('invite');
  });
  it('leaves out AI teammates while they are off', () => {
    expect(setupSteps({ chats: 2, team: true, teammates: false, project: true, plan: 'pro' })).not.toContain('teammates');
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
  it('puts the look you have first, then Match my system, then the dark orange sky', () => {
    expect(lookChoices('sage', true).slice(0, 3)).toEqual(['sage', 'match', 'ember']);
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
  // The founder: "For macs in dark mode the onboarding will be default dark
  // orange and light mode will be the light green sky".
  // As the pair that follows the Mac since w-fbe5e95dea (2026-11-10): she
  // switched macOS to light during the setup and it stayed dark.
  // Nothing picked wears the pair by main's own rule (w-1bf65f4322), so the setup ticks Match my system.
  it('wears the pair: dark orange on a dark Mac, light green on a light one', () => {
    expect(setupLook({ skies: true, picked: false, worn: 'ember', light: false })).toBe('match');
    expect(setupLook({ skies: true, picked: false, worn: 'sage', light: true })).toBe('match');
  });
  it('keeps a sky someone already chose', () => {
    expect(setupLook({ skies: true, picked: true, worn: 'dusk', light: false })).toBe('dusk');
  });
});

describe('the first page', () => {
  // The founder picked the sky design, "with a better title like 'An inbox for hundreds of agents'".
  const first = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
  it('says what the app is', () => {
    expect(first).toContain('An inbox for hundreds of agents.');
    expect(first).not.toContain('Give your agents an inbox');
  });
  it('stands on the sky the setup will wear', () => {
    expect(first).toMatch(/<WelcomeSky dark=\{/);
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
  // Then the founder saw "1 OF 5" with Open one, the second row, lit.
  it('agrees with the lit row when the tour starts further down', () => {
    expect(tourCount(tourChecklist([], '⌘', 'open'))).toBe('2 of 5');
  });
  // Round six: Send opened the thread, the tour lit Write back (3), Escape went
  // back to Home and lit Open one, and the count, kept from going back, still said 3.
  it('is drawn off the rows as they are now, with no floor kept from before', () => {
    const list = fs.readFileSync(new URL('../renderer/src/components/TourList.tsx', import.meta.url), 'utf8');
    expect(list).toMatch(/\{tourCount\(rows\)\}/);
    expect(list).not.toMatch(/furthest/);
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

describe('the app preview in its panel', () => {
  // The founder: the borders were "all blending in (our background) with the
  // other background". Clipping the app at the panel's edges cut off its
  // outline and shadow on every side, top and left included.
  const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
  it('is cut only at the right and bottom edges, so its outline shows', () => {
    expect(split).toMatch(/--ss-clip', `inset\(-\d+px \$\{at\.right\}px -\d+px -\d+px\)`/);
  });
});

describe('the app beside the walkthrough', () => {
  // The founder: "it went from being nice and curved to this (sharp borders)".
  const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');
  it('is a rounded window in a panel, as in the setup', () => {
    expect(css).toMatch(/:root\[data-tour-list\] #root \{[^}]*border-radius: 14px/);
  });
});

describe('the chats step', () => {
  // A wall of the person's own sessions as terminals was tried here; the
  // founder: "kill the terminals page it's too busy". The step shows the app
  // filling in, like every other step.
  const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../renderer/src/components/setup-split.css', import.meta.url), 'utf8');
  it('draws no terminals', () => {
    expect(split).not.toMatch(/<Terminal\b|ss-wall/);
    expect(css).not.toMatch(/ss-wall|ss-term/);
  });
  it('keeps the app beside it', () => {
    expect(css).not.toMatch(/data-setup-step="chats"\] #root \{[^}]*opacity: 0/);
  });
  it('says what it does', () => {
    expect(split).toContain("'Add your recent agents.'");
  });
});

describe('the walkthrough on Home', () => {
  // The founder, on the first walkthrough tip over Home: "this is far too
  // cluttered, this shouldn't be here (the presets under this). doesnt look
  // like our home screen". The suggestions stay in the New thread dialog and
  // the empty inbox; Home keeps its own look and the tip asks for words.
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('offers no suggestions in the box on Home', () => {
    expect(app).toMatch(/ideas=\{[^}]*!\(homeShown && modal !== 'compose'\)[^}]*\? FIRST_IDEAS : null\}/);
  });
});

describe('going back to a step already done', () => {
  // Testers went Back and were asked to choose a folder again while the app
  // behind showed the project it had made, and were offered "Make 1 teammate"
  // for a teammate already made. A step done shows what it did.
  const split = fs.readFileSync(new URL('../renderer/src/components/SetupSplit.tsx', import.meta.url), 'utf8');
  it('shows the folder already chosen, with a way to choose another', () => {
    expect(split).toMatch(/step === 'folder'[\s\S]{0,400}done\.project \?/);
    expect(split).toContain("quiet('Choose another'");
  });
  it('shows the chats already brought in instead of bringing them in again', () => {
    expect(split).toMatch(/step === 'chats'[\s\S]{0,300}done\.chats \?/);
  });
  it('clears the picks once teammates are made, and lists them as added', () => {
    expect(split).toMatch(/setPicked\(new Set\(\)\); setOwn\(''\)/);
    expect(split).toMatch(/done\.teammates\.map\(/);
  });
});

describe('opening counts however the thread was opened', () => {
  // Sending the first thread opens it, so the Open one tip never shows; a tester
  // wrote back and the list still had Open one unticked and the count stuck at 3 of 5.
  it('ticks Open one once a thread has been written back to', () => {
    const list = tourChecklist(['start', 'compose', 'reply']);
    expect(list[1].state).toBe('done');
    expect(tourCount(list)).toBe('4 of 5');
  });
  it('ticks Open one once a thread has been closed', () => {
    expect(tourChecklist(['close'])[1].state).toBe('done');
  });
  it('does not tick it for sending alone', () => {
    expect(tourChecklist(['start', 'compose'])[1].state).not.toBe('done');
  });
});
