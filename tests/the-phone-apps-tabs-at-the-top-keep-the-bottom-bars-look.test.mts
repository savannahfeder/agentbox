// THE PHONE APP'S TABS STAY AT THE TOP (2026-10-28).
//
// Needs you, In progress, Later and Done moved from the foot of the phone app
// to under its title: "all that stuff is best placed at the top", and a line
// under the title and another under the tabs "doesn't really work well". They
// were then the bottom bar's row moved up, an underline under the picked word.
//
// 2026-11-22: the redesign drew them as pills, the picked one filled
// (the-phone-inbox-is-drawn-for-a-thumb-and-a-glance). Where they are is what
// this file still holds: inside the title bar, on the list, on Chats and on
// Files, with no line of their own, and never at the foot.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const theme = fs.readFileSync('mobile/src/ui/theme.ts', 'utf8');
const rules = fs.readFileSync('mobile/src/lib/tabs.ts', 'utf8');
const tabs = inbox.slice(inbox.indexOf('function Tabs('), inbox.indexOf('\n}\n', inbox.indexOf('function Tabs(')));

describe("the phone app's tabs, at the top", () => {
  it('are one row with no line of their own', () => {
    expect(theme).toMatch(/tabs: 52,/);
    expect(tabs).toMatch(/height: size\.tabs,/);
    expect(tabs).not.toMatch(/border(Top|Bottom)Width/);
    expect(tabs).not.toMatch(/foot/);
  });
  // Closer only on a screen too narrow for all of them (QA M-33,
  // tests/the-phones-tab-row-shows-it-goes-on-past-the-edge).
  it('start where the title does: a pill pads its word 12pt, so the row starts 12pt before it', () => {
    expect(rules).toMatch(/TAB_GAP = \{ loose: 4, tight: 0 \}/);
    expect(tabs).toMatch(/paddingLeft: size\.inset - 12, paddingRight: 8, gap: tight \? TAB_GAP\.tight : TAB_GAP\.loose/);
    expect(tabs).toMatch(/height: 36, paddingHorizontal: 12,/);
  });
  it('draw each word at 15pt in the one weight, picked or not', () => {
    // 15pt until large text pushes the row off the screen (the-phones-tabs-shrink-to-fit-a-small-screen-with-large-text).
    expect(tabs).toMatch(/const words = \{ fontSize: 15 \* fit\.scale, count: 12\.5 \* fit\.scale \}/);
    expect(tabs).not.toMatch(/font\.medium : font\.regular/);
  });
  it('keep each count beside its word, closer when the row is tight', () => {
    expect(rules).toMatch(/COUNT_GAP = \{ loose: 7, tight: 5 \}/);
    expect(tabs).toMatch(/marginLeft: tight \? COUNT_GAP\.tight : COUNT_GAP\.loose/);
  });
  it('mark the picked tab on the tab itself, not on the bar', () => {
    expect(tabs).toMatch(/backgroundColor: on === t\.id \? color\.graphite : 'transparent'/);
    expect(tabs).not.toMatch(/position: 'absolute'/);
  });
  it('are drawn inside the title bar, on the list, on Chats and on Files, and never at the foot', () => {
    expect(inbox).toMatch(/below=\{board \? undefined : <Tabs on=\{onEverything \? 'everything' : tab\} counts=\{counts\} pick=\{setPlace\} team=\{teamMode\} \/>\}/);
    expect(inbox).toMatch(/<ChatsPlace tabs=\{<Tabs on="chats"/);
    expect(inbox).toMatch(/<FilesPlace tabs=\{<Tabs on="files"/);
    expect(fs.readFileSync('mobile/src/ui/Teammates.tsx', 'utf8')).toMatch(/<TopBar title="Chats" right=\{[^\n]*below=\{tabs\} \/>/);
    expect(fs.readFileSync('mobile/src/ui/FilesPlace.tsx', 'utf8')).toMatch(/<TopBar title="Files" right=\{[^\n]*below=\{tabs\} \/>/);
    expect(inbox.match(/<Tabs /g)).toHaveLength(3);
  });
});
