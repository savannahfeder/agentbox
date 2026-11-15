// A LINK IN A TABLE CELL OPENS FROM ITS TEXT, AND A ROW'S NAME OPENS ITS ONE LINK.
//
// Reading a table of viral videos (w-707f3b3df8, 2026-11-05), the person wanted
// the first field to open the video. The first column was always drawn as
// plain text, the link sat in a column of its own, and a cell written
// `[text](url)` showed its brackets and address as raw characters. Measured on
// that file: 0 of 10 names opened anything, and a `[Watch](https://...)` cell
// read as 37 characters of markdown.
import { describe, it, expect } from 'vitest';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readTable, tableFromGrid, cellLink, markdownLink, shownText, sortRows, logoFor } from '../renderer/src/table-file.ts';
import { TableView, gridFromHast } from '../renderer/src/components/TableView.tsx';
globalThis.React = React;

const VIDEOS = [
  'Example,Link,Format,Views',
  '@maker: a skit about founders,https://www.tiktok.com/@maker/video/111,Skit,100',
  '@builder: three agents at once,https://www.tiktok.com/@builder/video/222,Parallel,200',
  '@coder: a dating skit,,Skit,300',
].join('\n');

describe('a cell written [text](url)', () => {
  it('reads as its text and its address', () => {
    expect(markdownLink('[Watch](https://www.tiktok.com/@a/video/1)')).toEqual({ text: 'Watch', href: 'https://www.tiktok.com/@a/video/1' });
    expect(markdownLink('  [Acme](acme.com) ')).toEqual({ text: 'Acme', href: 'https://acme.com' });
    expect(markdownLink('[Paris](https://en.wikipedia.org/wiki/Paris_(disambiguation))')?.href).toBe('https://en.wikipedia.org/wiki/Paris_(disambiguation)');
    expect(shownText('[Watch](https://x.com/a)')).toBe('Watch');
  });
  it('is not a link when it only looks like one', () => {
    expect(markdownLink('see [Watch](https://x.com/a) later')).toBeNull();
    expect(markdownLink('[Watch]')).toBeNull();
    expect(markdownLink('[Watch](not a link)')).toBeNull();
    expect(markdownLink('[Run](javascript:alert(1))')).toBeNull();
    expect(markdownLink('[](https://x.com)')).toBeNull();
    expect(shownText('[draft] notes')).toBe('[draft] notes');
  });
  it('is a link in any column, the first one included', () => {
    const t = tableFromGrid([['Video', 'Notes'], ['[Founder skit](https://tiktok.com/@a/video/1)', '[Script](https://docs.example.com/s)'], ['Plain', 'Nothing here']]);
    expect(cellLink(t, t.rows[0], 0)).toEqual({ text: 'Founder skit', href: 'https://tiktok.com/@a/video/1' });
    expect(cellLink(t, t.rows[0], 1)).toEqual({ text: 'Script', href: 'https://docs.example.com/s' });
    expect(cellLink(t, t.rows[1], 0)).toBeNull();
    expect(cellLink(t, t.rows[1], 1)).toBeNull();
  });
  it('makes a column of them a link column, which sorts by the words shown', () => {
    const t = tableFromGrid([['Name', 'Video'], ['a', '[Zebra](https://z.com)'], ['b', '[Apple](https://a.com)'], ['c', '[Mango](https://m.com)']]);
    expect(t.columns[1].kind).toBe('link');
    expect(sortRows(t, t.rows, { col: 1, dir: 'asc' }).map((r) => r[0])).toEqual(['b', 'c', 'a']);
  });
  it("gives a row its company's logo when the website is written that way", () => {
    const t = tableFromGrid([['Company', 'Website'], ['Acme', '[acme.com](https://acme.com)'], ['Globex', '[globex.io](https://globex.io)']]);
    expect(logoFor(t, t.rows[0])).toBe('acme.com');
  });
});

describe("a row's name opens its one link", () => {
  it('opens the link column of its own row', () => {
    const t = readTable(VIDEOS, 'viral.csv');
    expect(cellLink(t, t.rows[0], 0)).toEqual({ text: '@maker: a skit about founders', href: 'https://www.tiktok.com/@maker/video/111' });
    expect(cellLink(t, t.rows[1], 0)?.href).toBe('https://www.tiktok.com/@builder/video/222');
  });
  it('stays plain text when its row has no link', () => {
    const t = readTable(VIDEOS, 'viral.csv');
    expect(cellLink(t, t.rows[2], 0)).toBeNull();
  });
  it('stays plain text when the table has two link columns, since it cannot know which', () => {
    const t = readTable('Company,Website,LinkedIn\nAcme,acme.com,https://linkedin.com/company/acme\nGlobex,globex.io,https://linkedin.com/company/globex', 'leads.csv');
    expect(t.columns[1].kind).toBe('link');
    expect(t.columns[2].kind).toBe('link');
    expect(cellLink(t, t.rows[0], 0)).toBeNull();
  });
  it('stays plain text when the table has no link column', () => {
    const t = readTable('Name,Stage\nAcme,Won\nGlobex,Lost\nInitech,Won', 'deals.csv');
    expect(cellLink(t, t.rows[0], 0)).toBeNull();
  });
  it('uses its own [text](url) over the row link', () => {
    const t = readTable('Example,Link\n[Own](https://own.example.com),https://other.example.com\nB,https://b.example.com', 'v.csv');
    expect(cellLink(t, t.rows[0], 0)?.href).toBe('https://own.example.com');
  });
  it('opens a bare address written in the first column', () => {
    const t = readTable('Video,Views\nhttps://www.tiktok.com/@a/video/1,100\nhttps://www.tiktok.com/@b/video/2,200', 'v.csv');
    expect(cellLink(t, t.rows[0], 0)).toEqual({ text: 'tiktok.com/@a/video/1', href: 'https://www.tiktok.com/@a/video/1' });
  });
  it('after a rank, the name is the column after it', () => {
    const t = readTable('#,Example,Link\n1,First,https://a.example.com\n2,Second,https://b.example.com', 'v.csv');
    expect(t.ranked).toBe(true);
    expect(cellLink(t, t.rows[0], 1)?.href).toBe('https://a.example.com');
  });
});

describe('the drawn table', () => {
  const draw = (text, path = 'viral.csv') => renderToStaticMarkup(h(TableView, { text, path, mode: 'preview' }));
  it('draws the name as a link to its row video', () => {
    const html = draw(VIDEOS);
    expect(html).toMatch(/<a[^>]*href="https:\/\/www\.tiktok\.com\/@maker\/video\/111"[^>]*>@maker: a skit about founders<\/a>/);
    expect(html).not.toMatch(/<a[^>]*>@coder: a dating skit<\/a>/);
  });
  it('draws [text](url) as its text, with no brackets left over', () => {
    const html = draw('Name,Notes\nAcme,[Read the brief](https://docs.example.com/brief)\nGlobex,Plain words', 'n.csv');
    expect(html).toMatch(/<a[^>]*href="https:\/\/docs\.example\.com\/brief"[^>]*>Read the brief<\/a>/);
    expect(html).not.toContain('](');
  });
  it('a markdown table in a message keeps the address of a cell that is a link', () => {
    const cell = (children) => ({ type: 'element', tagName: 'td', children });
    const node = { type: 'element', tagName: 'table', children: [
      { type: 'element', tagName: 'tr', children: [{ type: 'element', tagName: 'th', children: [{ type: 'text', value: 'Video' }] }] },
      { type: 'element', tagName: 'tr', children: [cell([{ type: 'element', tagName: 'a', properties: { href: 'https://x.com/a' }, children: [{ type: 'text', value: 'Watch' }] }])] },
      { type: 'element', tagName: 'tr', children: [cell([{ type: 'text', value: 'see ' }, { type: 'element', tagName: 'a', properties: { href: 'https://x.com/b' }, children: [{ type: 'text', value: 'this' }] }])] },
      { type: 'element', tagName: 'tr', children: [cell([{ type: 'element', tagName: 'a', properties: { href: 'https://x.com/c' }, children: [{ type: 'text', value: 'https://x.com/c' }] }])] },
    ] };
    expect(gridFromHast(node)).toEqual([['Video'], ['[Watch](https://x.com/a)'], ['see this'], ['https://x.com/c']]);
  });
});
