// "These components are super buggy. Some of the components are just far below
// where they should be." A thread a teammate sent you sits in its chat as the
// inbox's own row, and that row has five cells: thread, status, project,
// priority, time. The chat gave it three columns, so priority wrapped under
// the thread's name and the time under the status. The chat's rule also beat
// the inbox's own steps for a narrow list, which drop priority and then
// project. Measured on the photo stage at 1512 wide: priority and time sat
// 20px below the row's other cells; after, all five share one top.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../renderer/src/api', () => ({ api: new Proxy({}, { get: () => async () => ({ ok: false }) }) }));
const { RowCells } = await import('../renderer/src/threads/Pages.tsx');

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const pages = read('renderer/src/threads/pages.css');
const chat = read('renderer/src/teammates/teammates.css');

// The tracks in a grid-template-columns value, counting minmax(…) as one.
const tracks = (value) => value.trim().split(/\s+(?![^(]*\))/).length;
const columnsIn = (css, sel) => {
  const body = css.match(new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';
  return body.match(/grid-template-columns: ([^;]+);/)?.[1] ?? null;
};
const step = (width) => pages.match(new RegExp(`@container th \\(max-width: ${width}px\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';

// The grid's tracks come from variables; a step sets them, and `initial` drops a track.
const gridRule = (css) => css.match(/\n\.th-grid \{[^}]*\}/)[0];
const varsIn = (body) => Object.fromEntries([...body.matchAll(/(?:^|\n)\s*\.th-grid(?:, \.th-grid\.with-person)? \{([^}]*)\}/g)]
  .flatMap((m) => [...m[1].matchAll(/--th-([a-z]+): ([^;]+);/g)].map((v) => [v[1], v[2]])));
const columnsWith = (css, ...bodies) => {
  const v = Object.assign({}, ...[gridRule(css), ...bodies].map(varsIn));
  return gridRule(css).match(/grid-template-columns: ([^;]+);/)[1].replace(/ ?var\(--th-([a-z]+),\)/g, (_, n) => (v[n] && v[n] !== 'initial' ? ` ${v[n]}` : ''));
};

describe('a thread in a teammate\'s chat', () => {
  it('is drawn as five cells, as the inbox draws it', () => {
    const html = renderToStaticMarkup(React.createElement(RowCells, { title: 'Two cuts of the launch video are ready', where: 'Kestrel', priority: 5, updatedAt: 0, now: 6 * 60_000 }));
    const cells = html.match(/^<div class="row-main th-grid">([\s\S]*)<\/div>$/)?.[1].match(/<div class="th-cell-[a-z]+/g) ?? [];
    expect(cells).toEqual(['<div class="th-cell-title', '<div class="th-cell-state', '<div class="th-cell-proj', '<div class="th-cell-prio', '<div class="th-cell-when']);
  });

  it('gets no columns of its own from the chat, which would beat the inbox\'s narrow steps', () => {
    expect(columnsIn(chat, '.tq-inrows .th-grid')).toBeNull();
    expect(chat).not.toMatch(/\.tq-inrows[^{]*\.th-grid[^{]*\{[^}]*grid-template-columns/);
  });

  it('has a column for every cell at full width', () => {
    expect(tracks(columnsWith(pages))).toBe(5);
  });

  it('drops priority, and its column, on a narrower list', () => {
    expect(step(915)).toMatch(/\.th-grid > \.th-col-prio \{ display: none; \}/);
    expect(tracks(columnsWith(pages, step(915)))).toBe(4);
  });

  it('drops project as well, and its column, on a narrow one', () => {
    expect(step(785)).toMatch(/\.th-grid > \.th-col-proj \{ display: none; \}/);
    expect(tracks(columnsWith(pages, step(915), step(785)))).toBe(3);
  });

  it('does not count a minmax as two columns', () => {
    expect(tracks('minmax(0, 1fr) 104px 84px')).toBe(3);
  });
});
