// ⌘K OFFERED "GROUPS" AND NEVER A GROUP.
//
// Measured on main at 971d2d96: App.tsx hands the palette
// `groups={roomsUi.groups}` and `onPickGroup={(key) => roomsUi.pickGroup(key)}`,
// and the object `useRooms` hands back has neither key. `Palette` defaults
// `groups` to `[]`, so `groups.map` drew nothing: the command bar listed the
// Groups page and not one of the groups you are in, on every Mac with a team.
// `npm run typecheck` said so in two lines; nothing else did.
//
// `the-command-bar-finds-groups-and-usage` reads App.tsx as text, so it asserts
// that App asks for the groups and cannot see that nobody answers. The rule
// below is the general form of that gap, because `roomsUi` has twenty keys and
// a twenty-first will be read the same way: every `roomsUi.<name>` App.tsx
// reads has to be a name the hook returns.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Palette } from '../renderer/src/components/Palette';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const hook = read('renderer/src/team/rooms/useRooms.tsx');

// The one object the hook hands back, from `return {` to the `};` that closes
// the function. A key of it starts a line at four spaces or follows a comma on
// such a line; anything deeper is an argument or a JSX prop, which is how
// `onPick={pickGroup}` read as a key that was handed back when it was not.
const handedBack = hook.slice(hook.lastIndexOf('\n  return {'), hook.lastIndexOf('\n  };'));
const keyLines = handedBack.split('\n').filter((l) => /^ {4}\S/.test(l)).map((l) => l.replace(/\([^)]*\)/g, '()'));
const handsBack = (name) => keyLines.some((l) => new RegExp(`(^ {4}|,\\s*)${name}\\s*[,:]`).test(l));

describe('what the app asks of useRooms', () => {
  // THE DEFECT, by its name.
  it('hands back the groups and the way to pick one, which the command bar reads', () => {
    expect(handsBack('groups')).toBe(true);
    expect(handsBack('pickGroup')).toBe(true);
  });

  // THE RULE, so the twenty-first key cannot repeat it.
  it('hands back every key the app reads off it', () => {
    const asked = [...new Set([...app.matchAll(/roomsUi\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))];
    expect(asked.length).toBeGreaterThan(10);
    expect(asked.filter((name) => !handsBack(name))).toEqual([]);
  });

  // THE CASE THAT MUST NOT MATCH: the check has to be able to fail, which is
  // the whole lesson of the dead guard this repository found last week.
  it('says a name it does not hand back is missing', () => {
    expect(handsBack('noSuchKey')).toBe(false);
    // An argument of one of those keys is not a key: `direct` is the second
    // argument of `sidebarGroups`, and `pickGroup` was a prop passed inside it.
    expect(handsBack('direct')).toBe(false);
    // And it reads a key however it is written: on its own, with a value, or
    // spanning two lines.
    expect(handsBack('live')).toBe(true);
    expect(handsBack('roomName')).toBe(true);
    expect(handsBack('sidebarGroups')).toBe(true);
  });
});

describe('the command bar itself', () => {
  const draw = (props) => renderToStaticMarkup(createElement(Palette, {
    products: [], order: [], look: 'dark', onSetLook() {}, onClose() {}, onSearch() {},
    roomsOn: true, onGroups() {}, onPickGroup() {}, ...props,
  }));

  it('draws a row for each group it is given', () => {
    const html = draw({ groups: [{ key: 'room:a', name: 'Design' }, { key: 'room:b', name: 'Ship it' }] });
    expect(html).toContain('Design');
    expect(html).toContain('Ship it');
  });

  // THE BOUNDARY EITHER SIDE: given none it still offers the page, which is
  // exactly the screen the defect left behind, and off a team it offers neither.
  it('offers the Groups page with no groups, and nothing at all with rooms off', () => {
    expect(draw({ groups: [] })).toContain('Groups');
    expect(draw({ groups: [{ key: 'room:a', name: 'Design' }], roomsOn: false })).not.toContain('Design');
  });
});
