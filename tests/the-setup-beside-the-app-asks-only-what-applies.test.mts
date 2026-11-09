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
// every tool's Connect failing on a computer that cannot keep a sign-in.
import { describe, it, expect } from 'vitest';
import {
  setupSteps, stepLabel, connectTiles, CONNECT_FIRST, toolUse, typingInSetup, lookChoices, starterChoices, inviteList, setUpLines, tourChecklist,
} from '../renderer/src/setup-split.ts';

describe('which steps the setup shows', () => {
  it('shows every step on a team build with chats and teammates on', () => {
    expect(setupSteps({ chats: 3, team: true, teammates: true, project: true, tools: true })).toEqual(['chats', 'connect', 'invite', 'teammates', 'look']);
  });
  it('asks for a folder instead of chats when this computer has none', () => {
    expect(setupSteps({ chats: 0, team: true, teammates: true, project: true, tools: true })[0]).toBe('folder');
  });
  it('leaves out inviting on a build with no team cloud', () => {
    expect(setupSteps({ chats: 2, team: false, teammates: true, project: true, tools: true })).not.toContain('invite');
  });
  it('leaves out AI teammates while they are off', () => {
    expect(setupSteps({ chats: 2, team: true, teammates: false, project: true, tools: true })).not.toContain('teammates');
  });
  it('counts steps from the list it shows', () => {
    const steps = setupSteps({ chats: 1, team: false, teammates: false, project: true, tools: true });
    expect(stepLabel(steps, 'connect')).toBe('Step 2 of 3');
  });
  it('leaves out AI teammates when there is no project for them to work in', () => {
    expect(setupSteps({ chats: 0, team: false, teammates: true, project: false, tools: true })).toEqual(['folder', 'connect', 'look']);
  });
  it('leaves out connecting tools on a computer that cannot keep a sign-in', () => {
    expect(setupSteps({ chats: 1, team: false, teammates: false, project: true, tools: false })).toEqual(['chats', 'look']);
  });
  it('keeps AI teammates once a project exists, however it was made', () => {
    expect(setupSteps({ chats: 0, team: false, teammates: true, project: true, tools: true })).toContain('teammates');
  });
});

describe('the tools offered first', () => {
  const tile = (id, connected = false, access = 'sign_in') => ({ id, name: id, connected, access });
  it('offers the five tools an engineering team uses, in that order', () => {
    const tiles = ['figma', 'vercel', 'linear', 'notion', 'github', 'sentry', 'slack'].map((id) => tile(id));
    expect(connectTiles(tiles).map((t) => t.id)).toEqual(CONNECT_FIRST);
  });
  it('drops a tool this build does not carry instead of drawing an empty row', () => {
    expect(connectTiles([tile('github'), tile('linear')]).map((t) => t.id)).toEqual(['github', 'linear']);
  });
  it('says what each tool is for in a few words, never "Not connected"', () => {
    for (const id of CONNECT_FIRST) expect(toolUse(id)).toMatch(/^[A-Z][a-z]+( [a-z]+){1,3}$/);
  });
  it('never offers a tool its vendor has not opened to Agentbox', () => {
    expect(connectTiles([tile('github'), tile('linear', false, 'vendor_approval')]).map((t) => t.id)).toEqual(['github']);
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
    expect(setUpLines({ chats: 4, project: null, tools: 2, invited: 3, teammates: ['Quality lead'] }))
      .toEqual(['4 chats brought in', '2 tools connected', '3 teammates invited', 'Quality lead added']);
  });
  it('names the project made from a folder, and says nothing of steps skipped', () => {
    expect(setUpLines({ chats: 0, project: 'storefront', tools: 0, invited: 0, teammates: [] })).toEqual(['storefront is ready']);
  });
  it('uses the singular for one', () => {
    expect(setUpLines({ chats: 1, project: null, tools: 1, invited: 1, teammates: [] })).toEqual(['1 chat brought in', '1 tool connected', '1 teammate invited']);
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
