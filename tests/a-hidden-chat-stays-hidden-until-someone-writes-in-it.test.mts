// A HIDDEN CHAT STAYS HIDDEN UNTIL SOMEONE WRITES IN IT (w-b5f23cff71).
//
// "A lot of these chats, I want to kind of hide. I don't want to really see
// them anymore and they're taking up space." Everything else drew a card for
// every chat you were ever in (the screenshot had four chats beside the
// people), with no way to put one away. Now a chat or a
// person's card can be hidden. A hidden chat comes back by itself when it
// moves again, the way an archived conversation does; a person stays hidden
// until you show them. "N hidden" under the cards opens a list of their names,
// each with Show.
//
// AND A HIDDEN CARD NEVER COMES BACK INTO THE GRID GREYED OUT. The first build
// drew them faded among the others when "N hidden" was pressed: "when I say
// 'hide,' I want to hide certain threads so they don't take up space. When you
// just gray them out, it defeats the purpose."
//
// The list hangs under "N hidden" outside the cards' own scroll box: drawn
// inside it on the first try, it opened clipped to nothing (built app, shot i).
import { describe, it, expect } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { splitHidden, hideMember, readHidden, writeHidden } from '../renderer/src/team/everything/members.ts';
import { HiddenList, TeamStrip } from '../renderer/src/team/everything/TeamStrip.tsx';

const me = { key: 'me', kind: 'me', name: 'You', agents: 1, now: null };
const team = { key: 'room:r-team', kind: 'chat', team: true, name: 'Team chat', faces: [], agents: 3, now: null, at: 50 };
const crit = { key: 'room:r-crit', kind: 'chat', name: 'Design crit', faces: [], agents: null, now: null, at: 40 };
const sam = { key: 'person:p-sam', kind: 'person', name: 'Sam Ortiz', agents: null, now: null };
const ada = { key: 'mate:t-ada', kind: 'mate', name: 'Ada', letter: 'A', agents: 0, now: null };
const members = [me, team, crit, sam, ada];

describe('which cards are hidden', () => {
  it('leaves out a chat you hid, and keeps the rest in order', () => {
    const { shown, hidden } = splitHidden(members, { 'room:r-crit': 40 });
    expect(shown.map((m) => m.key)).toEqual(['me', 'room:r-team', 'person:p-sam', 'mate:t-ada']);
    expect(hidden.map((m) => m.key)).toEqual(['room:r-crit']);
  });

  it('shows a hidden chat again once something new is said in it', () => {
    expect(splitHidden([{ ...crit, at: 41 }], { 'room:r-crit': 40 }).shown).toHaveLength(1);
    expect(splitHidden([{ ...crit, at: 40 }], { 'room:r-crit': 40 }).shown).toHaveLength(0);
  });

  it('keeps a hidden person hidden: a person card has no messages to bring it back', () => {
    expect(splitHidden([sam], hideMember({}, sam)).hidden).toHaveLength(1);
  });

  it('never hides you or an AI teammate', () => {
    expect(hideMember({}, me)).toEqual({});
    expect(hideMember({}, ada)).toEqual({});
    expect(hideMember({}, crit)).toEqual({ 'room:r-crit': 40 });
  });

  it('remembers what you hid between launches, and survives a broken store', () => {
    const box = new Map();
    const store = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
    writeHidden({ 'room:r-crit': 40 }, store);
    expect(readHidden(store)).toEqual({ 'room:r-crit': 40 });
    box.set('agentbox.everything.hidden', '[oops');
    expect(readHidden(store)).toEqual({});
  });
});

describe('the cards', () => {
  const strip = (props = {}) => renderToStaticMarkup(h(TeamStrip, { members: [me, team, sam, ada], picked: 'me', onPick() {}, onMove() {}, onHide() {}, ...props }));

  it('offer Hide on a chat and on a person, never on you or an AI teammate', () => {
    const html = strip();
    expect(html.match(/aria-label="Hide [^"]+"/g)).toEqual(['aria-label="Hide Team chat"', 'aria-label="Hide Sam Ortiz"']);
  });

  it('never draw a hidden one among them, faded or otherwise', () => {
    const html = strip({ members: [me, team, ada] });
    expect(html).not.toContain('data-key="room:r-crit"');
    expect(html).not.toContain('data-key="person:p-sam"');
    expect(html).not.toMatch(/ev-card[^"]*away/);
  });

  it('say how many are hidden, and nothing when none is', () => {
    expect(renderToStaticMarkup(h(HiddenList, { hidden: [crit, sam], onShow() {} }))).toMatch(/class="ev-hidden"[^>]*>2 hidden</);
    expect(renderToStaticMarkup(h(HiddenList, { hidden: [], onShow() {} }))).toBe('');
  });

  it('list the hidden ones by name when opened, each with Show', () => {
    const html = renderToStaticMarkup(h(HiddenList, { hidden: [crit, sam], onShow() {}, startOpen: true }));
    expect(html).toContain('Design crit');
    expect(html).toContain('Sam Ortiz');
    expect(html.match(/aria-label="Show [^"]+"/g)).toEqual(['aria-label="Show Design crit"', 'aria-label="Show Sam Ortiz"']);
    expect(html).not.toContain('ev-card');
  });
});

