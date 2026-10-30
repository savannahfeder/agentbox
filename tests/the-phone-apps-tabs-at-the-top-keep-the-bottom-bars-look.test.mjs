// THE PHONE APP'S TABS AT THE TOP KEEP THE BOTTOM BAR'S LOOK (2026-10-28).
//
// When Needs you, In progress, Later and Done moved from the foot of the phone
// app to under its title, they were redrawn as the web app draws them: 18pt
// apart, each count 6pt from its word, the picked word in medium, and the mark
// on the bar's line. The ask was the opposite: "the nav at the bottom is very
// good so just shift that ui upward, without messing much with spacing". So the
// row is the bottom bar as it was (48pt tall, 22pt apart, each count 13pt from
// its word at 11pt, every word regular, the mark under the word itself), moved
// up into the title bar. The title bar's own line is the one line under it; the
// bottom bar's line along its top is gone, since a line under the title and
// another under the tabs "doesn't really work well".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const inbox = fs.readFileSync('mobile/src/app/index.tsx', 'utf8');
const theme = fs.readFileSync('mobile/src/ui/theme.ts', 'utf8');
const tabs = inbox.slice(inbox.indexOf('function Tabs('), inbox.indexOf('\n}\n', inbox.indexOf('function Tabs(')));

describe("the phone app's tabs, now at the top", () => {
  it('are the bottom bar\'s 48pt row, with no line of their own', () => {
    expect(theme).toMatch(/tabs: 48,/);
    expect(tabs).toMatch(/height: size\.tabs,/);
    expect(tabs).not.toMatch(/border(Top|Bottom)Width: 1/);
    expect(tabs).not.toMatch(/foot/);
  });
  it('sit 22pt apart from the title\'s left edge, as they did at the bottom', () => {
    expect(tabs).toMatch(/paddingLeft: size\.inset, paddingRight: 8, gap: 22/);
    expect(tabs).not.toMatch(/gap: 18/);
  });
  it('draw each word at 15pt in regular, picked or not', () => {
    expect(tabs).toMatch(/fontSize: 15, lineHeight: 30, color: on === t\.id \? color\.text : color\.dim/);
    expect(tabs).not.toMatch(/font\.medium : font\.regular/);
  });
  it('keep each count 13pt from its word, at 11pt', () => {
    expect(tabs).toMatch(/fontSize: 11, lineHeight: 30, fontFamily: font\.medium, marginLeft: 13, color: color\.faint/);
  });
  it('underline the picked word itself, not the bar', () => {
    expect(tabs).toMatch(/height: 32, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: on === t\.id \? color\.accent : 'transparent'/);
    expect(tabs).not.toMatch(/position: 'absolute'/);
  });
  it('are drawn inside the title bar, on the list, on Groups and on Chats, and never at the foot', () => {
    expect(inbox).toMatch(/below=\{board \? undefined : <Tabs on=\{tab\} counts=\{counts\} pick=\{setPlace\} groups=\{groups\.on\} \/>\}/);
    expect(inbox).toMatch(/<GroupsPlace tabs=\{<Tabs on="groups"/);
    expect(inbox).toMatch(/<ChatsPlace tabs=\{<Tabs on="chats"/);
    expect(fs.readFileSync('mobile/src/ui/Teammates.tsx', 'utf8')).toMatch(/<TopBar title="Chats" right=\{[^\n]*below=\{tabs\} \/>/);
    expect(inbox.match(/<Tabs /g)).toHaveLength(3);
  });
});
