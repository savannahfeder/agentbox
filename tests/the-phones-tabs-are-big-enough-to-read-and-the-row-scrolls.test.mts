// THE PHONE'S TABS ARE BIG ENOUGH TO READ AND THE ROW SCROLLS (2026-11-23).
//
// "The text at the top with Needs you, In progress, Later, and Done is really,
// really small... assume that they're going to scroll to get further access to
// the menu rather than see it all at once." Measured from the tab code: six
// tabs were made to fit one screen, so the gaps closed up and the words shrank
// from 15pt to as little as 10.5pt (0.7). The words are 17pt now and never
// shrink; the row scrolls, brings the picked tab to its middle, and puts the
// three places a phone is opened for first.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as rules from '../mobile/src/lib/tabs';
import { TAB_WORDS, tabScrollTo, moreToTheLeft } from '../mobile/src/lib/tabs';
import { bottomTabs } from '../mobile/src/lib/groups';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const tabs = inbox.slice(inbox.indexOf('function Tabs('), inbox.indexOf('\n}\n', inbox.indexOf('function Tabs(')));

describe('the tab words', () => {
  it('are 17pt, with a smaller count', () => {
    expect(TAB_WORDS).toEqual({ fontSize: 17, count: 13.5 });
    expect(tabs).toMatch(/fontSize: TAB_WORDS\.fontSize/);
    expect(tabs).toMatch(/fontSize: TAB_WORDS\.count/);
  });
  it('never shrink or close up to fit: nothing scales or tightens them', () => {
    expect(Object.keys(rules)).not.toContain('tabsScale');
    expect(Object.keys(rules)).not.toContain('tabsTighten');
    expect(Object.keys(rules)).not.toContain('TABS_SMALLEST');
    expect(tabs).not.toMatch(/scale|tight/);
  });
  it('sit in a pill a thumb can hit', () => {
    expect(tabs).toMatch(/height: 40, paddingHorizontal: 12,/);
  });
});

describe('the order', () => {
  const labels = (team: boolean, board = false) => bottomTabs(team, board).map((t) => t.label);
  it('puts Needs you, In progress and Chats first, then the rest', () => {
    expect(labels(true)).toEqual(['Needs you', 'In progress', 'Chats', 'Later', 'Done', 'Files']);
  });
  it('keeps the four states together with no team', () => {
    expect(labels(false)).toEqual(['Needs you', 'In progress', 'Later', 'Done', 'Files']);
  });
  it('leaves the board\'s row as it was', () => {
    expect(labels(true, true)).toEqual(['Board', 'Chats', 'Files']);
  });
});

describe('where the row scrolls to for the picked tab', () => {
  const row = { view: 400, content: 700 };
  it('stays at the start for a tab in the first half of the screen', () => {
    expect(tabScrollTo({ x: 8, width: 120 }, row)).toBe(0);
    expect(tabScrollTo({ x: 140, width: 120 }, row)).toBe(0);
  });
  it('brings a tab further along to the middle', () => {
    expect(tabScrollTo({ x: 300, width: 100 }, row)).toBe(150);
  });
  it('stops at the row\'s end rather than scroll past it', () => {
    expect(tabScrollTo({ x: 620, width: 72 }, row)).toBe(300);
  });
  it('does not move a row that fits, or one not measured yet', () => {
    expect(tabScrollTo({ x: 300, width: 100 }, { view: 400, content: 380 })).toBe(0);
    expect(tabScrollTo({ x: 300, width: 100 }, { view: 400, content: 400 })).toBe(0);
    expect(tabScrollTo({ x: 300, width: 100 }, { view: 0, content: 0 })).toBe(0);
  });
  it('is where the row goes when a tab is picked, and where the next page\'s row starts', () => {
    expect(tabs).toMatch(/scrollTo\(\{ x: tabScrollTo\(/);
    expect(tabs).toMatch(/contentOffset=\{\{ x: rowAt\.x, y: 0 \}\}/);
    expect(tabs).toMatch(/<ScrollView ref=\{row\} horizontal/);
  });
});

describe('the row\'s left edge', () => {
  it('fades once tabs have scrolled off it', () => {
    expect(moreToTheLeft({ x: 110 })).toBe(true);
    expect(moreToTheLeft({ x: 2 })).toBe(true);
  });
  it('does not fade at the start, give or take a pixel', () => {
    expect(moreToTheLeft({ x: 0 })).toBe(false);
    expect(moreToTheLeft({ x: 1 })).toBe(false);
    expect(moreToTheLeft({ x: -30 })).toBe(false);
  });
  it('is drawn from that rule, as the right one is from its own', () => {
    expect(tabs).toMatch(/moreToTheLeft\(span\) && <EdgeFade side="left" \/>/);
    expect(tabs).toMatch(/moreToTheRight\(span\) && <EdgeFade side="right" \/>/);
  });
});
