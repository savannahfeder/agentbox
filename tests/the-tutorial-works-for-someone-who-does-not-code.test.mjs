// THE TUTORIAL WORKS FOR SOMEBODY WHO DOES NOT CODE.
//
// A persona test of an executive assistant on the team build (2026-10-01)
// found four faults in the first run, and this file pins the fix for each.
//
// 1. A BLANK SCREEN AT BOTH ENDS. After "Start the tutorial" the inbox stayed
//    empty with no hint for over thirty seconds. The first beat rang
//    `button[aria-label="New thread"]`, and the team header's New thread button
//    carries no such label, so `Ringed` found nothing and drew nothing. The tab
//    tour near the end rang tabs the team layout does not draw either, so the
//    walk went blank again and she had to press Skip.
// 2. WORDS FOR PROGRAMMERS. "Run dozens of coding agents", "Works with Claude
//    Code and Codex", "Pick its folder" with no way past it for somebody who
//    has no code folder, and practice threads about sign-in routes and dead code.
// 3. NOTHING ABOUT THE TEAM PAGE OR MESSAGING A PERSON, which is half the product.
// 4. POLISH. Done counted two rows that still needed her ("DONE 2 · ALL 2"),
//    the clearing beat drew two E keys under "Press E", the demo panel ran off
//    the right edge at 1440x900, and coach cards sat over the tabs.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR, COPY, FLOOR_OF, START, TEAM_TABS, TEAM_TAB_NAMES, advance, coach, teamTab,
} from '../renderer/src/onboarding.ts';
import { PRACTICE_ANSWER, PRACTICE_ROWS, PRACTICE_TASK, PRACTICE_TASK_TRACE } from '../shared/first-run-practice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const view = read('renderer/src/components/Onboarding.tsx');
const pages = read('renderer/src/threads/Pages.tsx');
const app = read('renderer/src/App.tsx');
const css = read('renderer/src/styles.css');

const JARGON = /\b(code|coding|Claude Code|Codex|dozens|keys|repo|repository|terminal|CLI)\b/i;

describe('1. the walk is never a blank screen', () => {
  it('rings the New thread button the team header really draws', () => {
    // The header's button: class th-new, data-hint new-task, no aria-label.
    expect(pages).toMatch(/className="th-new" data-hint="new-task"/);
    expect(ANCHOR.make.some((s) => s.includes('[data-hint="new-task"]') || s.includes('.th-new'))).toBe(true);
    // The old layout's plus still comes first, so that layout is untouched.
    expect(ANCHOR.make[0]).toBe('button[aria-label="New thread"]');
  });

  it('says what to do on the first beat, and says it names the button too', () => {
    const say = coach('make', 0);
    expect(`${say.lead}${say.key}${say.tail}`).toMatch(/New thread/);
    expect(say.key).toBe('N');
  });

  it('draws the card even when the thing it points at is not on the screen', () => {
    // `if (!geo) return null` was the whole of the blank screen. A beat with no
    // anchor now prints its card in a fixed place after a short grace.
    const ringed = view.slice(view.indexOf('function Ringed('), view.indexOf('function Finished('));
    expect(ringed).toMatch(/adrift/);
    expect(ringed).not.toMatch(/if \(!geo\) return null;/);
  });

  it('tours the tabs the team layout draws', () => {
    expect(ANCHOR.where).toContain('.th-bar .tm-tabs');
    // The tab buttons carry no data-tab, so the tour finds one by its place,
    // and the order it counts in is the order Pages.tsx draws.
    const block = pages.slice(pages.indexOf('export const INBOX_TABS'), pages.indexOf('];', pages.indexOf('export const INBOX_TABS')));
    expect([...block.matchAll(/view: '(\w+)'/g)].map((m) => m[1])).toEqual([...TEAM_TABS]);
    expect(teamTab('progress')).toBe('.th-bar .tm-tab:nth-child(2)');
    expect(teamTab('nowhere')).toBeNull();
    expect(view).toMatch(/teamTab\(goingTo\)/);
  });

  it('names the tab as well as the key, where the strip has names', () => {
    const labels = [...pages.slice(pages.indexOf('export const INBOX_TABS')).matchAll(/label: '([^']+)'|label: DONE\.short/g)]
      .slice(0, 5).map((m) => m[1] ?? 'Done');
    expect(TEAM_TABS.map((v) => TEAM_TAB_NAMES[v])).toEqual(labels);
    const tabs = ['inbox', 'progress', 'snoozed', 'done'];
    const named = coach('where', 0, { view: 'inbox', tabs, tabNames: TEAM_TAB_NAMES });
    expect(`${named.lead}${named.key}${named.tail}`).toBe('Press ⌘2 or click Running to see where it all went.');
    const onward = coach('where', 0, { view: 'progress', tabs, tabNames: TEAM_TAB_NAMES });
    expect(onward.tail).toMatch(/^ or click Scheduled /);
    // The old layout's strip has its own words and gets no name.
    expect(coach('where', 0, { view: 'inbox', tabs }).tail).toBe(' to see where it all went.');
  });
});

describe('2. the words work for an engineer and for an assistant', () => {
  const setup = () => [
    COPY.head, COPY.headSub, COPY.folderHead, COPY.folderLede, COPY.folderRecent,
    COPY.folderNone, COPY.nameInNone, COPY.handHead, COPY.handLine, COPY.leaveLine,
    COPY.offerLine, COPY.finishHead, COPY.finishLine,
    ...(COPY.finishNext ?? [undefined]), ...COPY.intro.flatMap((s) => [s.head, s.line]),
  ];

  it('has no jargon and no em dashes on any setup screen', () => {
    for (const line of setup()) {
      expect(typeof line, String(line)).toBe('string');
      expect(line, line).not.toMatch(JARGON);
      expect(line, line).not.toMatch(/—/);
    }
  });

  it('lets somebody with no folder carry on, and still gives them a project', () => {
    const at = { ...START, step: 'folder', name: '' };
    const on = advance(at, { t: 'noFolder' });
    expect(on.folder).toBeNull();
    expect(on.name.trim().length).toBeGreaterThan(0);
    // A name she typed herself survives the choice.
    expect(advance({ ...at, name: 'Board prep' }, { t: 'noFolder' }).name).toBe('Board prep');
    // A name that was only the old folder's proposal does not.
    const fromFolder = advance(at, { t: 'folder', path: '/Users/x/dev/agentbox-v2' });
    expect(advance(fromFolder, { t: 'noFolder' }).name).not.toBe(fromFolder.name);
    // The screen offers the way past, and the name screen says where the work goes.
    expect(view).toMatch(/COPY\.folderNone/);
    expect(view).toMatch(/COPY\.nameInNone/);
  });

  it('practises on everyday threads, not on code', () => {
    const CODEY = /\b(code|tests?|route|CI|tsconfig|src|npm|commit|deploy|imports?|fixture|lint)\b/i;
    for (const row of PRACTICE_ROWS) {
      for (const words of [row.title, row.body, row.result]) expect(words, words).not.toMatch(CODEY);
    }
    for (const words of [PRACTICE_TASK.title, PRACTICE_TASK.body, PRACTICE_ANSWER]) {
      expect(words, words).not.toMatch(CODEY);
    }
    for (const line of PRACTICE_TASK_TRACE) expect(line, line).not.toMatch(/\bsrc\/|npm /);
  });
});

describe('3. the walk names the Team page and messaging a person', () => {
  it('ends by saying it is over and what to try next', () => {
    expect(COPY.finishHead).toMatch(/tutorial/i);
    expect(COPY.finishHead).toMatch(/finished|done/i);
    const next = (COPY.finishNext ?? []).join(' ');
    expect(next).toMatch(/thread/);
    expect(next).toMatch(/\bTeam\b/);
    expect(next).toMatch(/message/i);
    expect(view).toMatch(/COPY\.finishNext/);
  });
});

describe('4. polish', () => {
  it('does not count a thread that still needs you as done', () => {
    // "DONE 2 · ALL 2" while two rows still needed her: an agent's done on a
    // thread she wrote waits in Needs you until she closes it, and Done counted
    // it as well. Done now leaves out every row Needs you is showing.
    expect(app).toMatch(/const done = useMemo\([\s\S]{0,240}needsYou\.has\(i\.id\)/);
  });

  it('draws the clearing lights as dots, not as a second and third E', () => {
    const lights = view.slice(view.indexOf('function Lights('), view.indexOf('function Lights(') + 2400);
    expect(lights).not.toMatch(/<kbd/);
    expect(coach('clear', 0).caps).toBe(2);
  });

  it('keeps the demo panel inside the window', () => {
    const block = css.slice(css.indexOf('.fr-piece {'), css.indexOf(':root[data-skin] .fr-piece {'));
    expect(block).not.toMatch(/right:\s*-\d+px/);
  });

  it('keeps coach cards off the tabs', () => {
    expect(FLOOR_OF).toMatch(/\.th-bar/);
  });
});
