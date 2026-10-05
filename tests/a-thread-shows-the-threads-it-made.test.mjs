// A THREAD SHOWS THE THREADS IT MADE, IN LINE, WITH WHERE EACH ONE STANDS.
//
// Asked 2026-10-05 on w-2e8aa16f0f, with a picture of a finished task whose
// result said "I filed three threads under this one" and then named them only in
// prose: "it would be nice if, if an agent files different agents, you can see
// it in that task too. Just like what you've come up with in the messages but a
// component that we reuse whenever threads make other threads." The task drew
// none of its three children: the only child the pane knew about was the first
// unfinished one, for the "blocked by" line.
//
// The component is the list approved in the same thread for an agent answering
// in a chat: one bordered row per thread, its title and its state in the list's
// own words, and the row opens that thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { threadsMade, stateWord } from '../renderer/src/threads-made.ts';
import { ThreadsMade } from '../renderer/src/components/ThreadsMade.tsx';

const T = Date.parse('2026-10-05T10:00:00');
const row = (id, over = {}) => ({ id, product: 'team', title: id, status: 'open', createdAt: T, updatedAt: T, ...over });
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('which threads a thread made', () => {
  const parent = row('w-parent');
  const items = [
    parent,
    row('w-second', { parent: 'w-parent', createdAt: T + 2000 }),
    row('w-first', { parent: 'w-parent', createdAt: T + 1000 }),
    row('w-finished', { parent: 'w-parent', createdAt: T + 3000, status: 'done' }),
    row('w-grandchild', { parent: 'w-first', createdAt: T + 4000 }),
    row('w-elsewhere', { parent: 'w-parent', product: 'other', createdAt: T + 5000 }),
    row('w-unrelated', { createdAt: T + 6000 }),
  ];

  it('is every thread filed under it in its own project, oldest first, finished ones too', () => {
    expect(threadsMade(items, parent).map((i) => i.id)).toEqual(['w-first', 'w-second', 'w-finished']);
  });

  it('does not reach past its own children to theirs', () => {
    expect(threadsMade(items, parent).map((i) => i.id)).not.toContain('w-grandchild');
  });

  it('does not take a thread with the same parent id in another project', () => {
    expect(threadsMade(items, parent).map((i) => i.id)).not.toContain('w-elsewhere');
  });

  it('is nothing for a thread that made none', () => {
    expect(threadsMade(items, row('w-unrelated'))).toEqual([]);
  });
});

describe('the words for where a thread stands', () => {
  it('are the list’s own tab names', () => {
    expect(['waiting', 'running', 'scheduled', 'done'].map(stateWord)).toEqual(['Needs you', 'In progress', 'Later', 'Done']);
  });

  it('say nothing when the thread is in no tab', () => {
    expect(stateWord(null)).toBe('');
  });
});

describe('the list, drawn', () => {
  const opened = [];
  const html = renderToStaticMarkup(React.createElement(ThreadsMade, {
    rows: [{ id: 'w-a', title: 'Keep a pasted command exactly as typed', state: 'running' }, { id: 'w-b', title: 'Say why Send is off', state: 'waiting' }],
    onOpen: (id) => opened.push(id),
  }));

  it('is one pressable row per thread with its title and its state', () => {
    expect(html.match(/<button type="button" class="made-row"/g)).toHaveLength(2);
    expect(html).toContain('>Keep a pasted command exactly as typed<');
    expect(html).toContain('>In progress<');
    expect(html).toContain('>Needs you<');
  });

  it('draws nothing at all when there are no rows', () => {
    expect(renderToStaticMarkup(React.createElement(ThreadsMade, { rows: [], onOpen: () => {} }))).toBe('');
  });
});

describe('where it is drawn', () => {
  it('reaches the opened task with each child’s tab state, and the task draws it under the conversation', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/filed=\{threadsMade\(items, focused\)\.map\(\(i\) => \(\{ id: i\.id, title: [^,]+, state: stateOfMine\(i\), item: i \}\)\)\}/);
    const focus = read('renderer/src/components/Focus.tsx');
    expect(focus).toMatch(/<ThreadsMade rows=\{filed\}/);
  });
});
