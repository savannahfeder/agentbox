// A GROUP PAGE NAMES THE OPEN GROUP AND LISTS EVERY GROUP BESIDE IT (w-dcaa2c122e, 2026-10-24).
//
// Of five ways drawn to switch groups, the list down the page's left was
// liked, with two faults: "This option 3 doesn't have a clear label for which
// one you're in. There's no clear header", and the rows were "too far indented
// to the left ... put that little orange dot somewhere else ... without taking
// up so much space on the left."
// Measured on the stage at 1710 by 1063: the open group's name was nowhere on
// the page but in the message box's placeholder, under a bar reading only
// "Groups"; a row's words started 76 points into the column, behind a gutter
// kept for the dot. Now the bar reads "Groups" over the column and the group's
// name over its chat, and a row's words start 52 points in, the dot at the end
// of its second line.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GroupsColumn, GroupsHead } from '../renderer/src/team/rooms/GroupsColumn.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../renderer/src/team/rooms/rooms.css');
const hook = read('../renderer/src/team/rooms/useRooms.tsx');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1);
};

const group = (name, o = {}) => ({ key: `room:${name}`, name, faces: [], at: 0, unread: false, pinned: false, last: 'Last thing said', ...o });
const rows = [group('Northwind', { unread: true }), group('General'), group('Founders', { unread: true })];
const column = (current) => renderToStaticMarkup(createElement(GroupsColumn, { rows, current, now: 0, onOpen() {} }));
const rowOf = (html, name) => html.split('<button').find((b) => b.includes(`>${name}<`)) ?? '';

describe('the bar over a group', () => {
  const head = (current) => renderToStaticMarkup(createElement(GroupsHead, { current, onFind() {} }));
  it('names the open group, as a heading, over its chat', () => {
    const html = head(group('Northwind'));
    expect(html).toMatch(/<h1 class="workspace-title gc-head-group">.*Northwind.*<\/h1>/);
  });
  it('says Groups over the column, with the finder’s key beside it', () => {
    const html = head(group('Northwind'));
    expect(html).toContain('gc-col-title">Groups</span>');
    expect(html).toContain('aria-label="Find a group"');
    expect(html).toContain('<kbd>G</kbd>');
  });
  it('falls back to Groups when no group is open', () => {
    expect(head(undefined)).toMatch(/gc-head-group">.*Groups.*<\/h1>/);
  });
  it('is cut on the column’s own line', () => {
    expect(rule('.gc-list')).toContain('width: 300px;');
    expect(rule('.gc-head-col')).toContain('width: 300px;');
    expect(rule('.gc-head')).toContain('margin-left: -44px;');
  });
});

describe('the column', () => {
  it('lights the open group', () => {
    expect(rowOf(column('room:General'), 'General')).toContain('aria-current="page"');
    expect(rowOf(column('room:General'), 'Northwind')).not.toContain('aria-current');
  });
  it('marks something new with a dot at the end of the second line', () => {
    const row = rowOf(column('room:General'), 'Founders');
    expect(row).toMatch(/class="gc-2">.*<i class="gc-dot" aria-label="New messages"><\/i><\/span>/);
  });
  it('puts no dot on the group you are reading, or on one with nothing new', () => {
    expect(rowOf(column('room:Northwind'), 'Northwind')).not.toContain('gc-dot');
    expect(rowOf(column('room:Northwind'), 'General')).not.toContain('gc-dot');
  });
  it('keeps no gutter on the left for the dot, and starts its rows 20 points in', () => {
    expect(rule('.gc-row')).toContain('padding: 9px 16px 9px 20px;');
    expect(rule('.gc-row')).not.toContain('--text-x');
    expect(css).not.toMatch(/\.gc-row[^{]*::before/);
    expect(rule('.gc-head-col')).toContain('padding: 0 16px 0 20px;');
  });
});

describe('in the app', () => {
  it('every group page carries the column and the bar, with no trial left to pick between', () => {
    expect(hook).toContain("list={<GroupsColumn rows={rows} current={`room:${open.id}`}");
    expect(hook).toContain('heading = { title: <GroupsHead current={currentRow}');
    expect(fs.existsSync(new URL('../renderer/src/team/rooms/GroupSwitch.tsx', import.meta.url))).toBe(false);
    expect(hook).not.toContain('readSwitchLook');
    expect(css).not.toMatch(/\.gs-[a-z]/);
  });
});
