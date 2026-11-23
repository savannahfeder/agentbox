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
  it('start where the title does: a pill pads its word 12pt, so the row starts 12pt before it', () => {
    expect(rules).toMatch(/TAB_GAP = 4;/);
    expect(tabs).toMatch(/paddingLeft: size\.inset - 12, paddingRight: 8, gap: TAB_GAP \}\}/);
    expect(tabs).toMatch(/height: 40, paddingHorizontal: 12,/);
  });
  it('draw each word at 17pt in the one weight, picked or not', () => {
    expect(rules).toMatch(/TAB_WORDS = \{ fontSize: 17, count: 13\.5 \}/);
    expect(tabs).toMatch(/fontSize: TAB_WORDS\.fontSize/);
    expect(tabs).not.toMatch(/font\.medium : font\.regular/);
  });
  it('keep each count beside its word', () => {
    expect(rules).toMatch(/COUNT_GAP = 7;/);
    expect(tabs).toMatch(/marginLeft: COUNT_GAP,/);
  });
  it('mark the picked tab on the tab itself, not on the bar', () => {
    expect(tabs).toMatch(/backgroundColor: on === t\.id \? color\.graphite : 'transparent'/);
    expect(tabs).not.toMatch(/position: 'absolute'/);
  });
  it('are drawn inside the title bar, on the list, on Chats and on Files, and never at the foot', () => {
    expect(inbox).toMatch(/below=\{<Tabs on=\{tab\} counts=\{board \? \{ \.\.\.counts, inbox: 0 \} : counts\} pick=\{setPlace\} team=\{teamMode\} board=\{!!board\} \/>\}/);
    expect(inbox).toMatch(/<ChatsPlace tabs=\{<Tabs on="chats"/);
    expect(inbox).toMatch(/<FilesPlace tabs=\{<Tabs on="files"/);
    expect(fs.readFileSync('mobile/src/ui/Teammates.tsx', 'utf8')).toMatch(/<TopBar title="Chats" right=\{[^\n]*below=\{tabs\} \/>/);
    expect(fs.readFileSync('mobile/src/ui/FilesPlace.tsx', 'utf8')).toMatch(/<TopBar title="Files" right=\{[^\n]*below=\{tabs\} \/>/);
    expect(inbox.match(/<Tabs /g)).toHaveLength(3);
  });
});
