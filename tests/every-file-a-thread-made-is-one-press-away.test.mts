// EVERY FILE A THREAD MADE IS ONE PRESS AWAY.
//
// The owner, 2026-11-02, on a thread of 97 messages: "Many threads produce many
// many many different artifacts, tons of them. The issue is that there's no
// way to find them after that. Right now I don't see any artifacts and I have
// to scroll up to even access the previous artifact." Only a teammate's thread
// listed its files (its summary panel); your own agent's thread listed none.
// Its top bar now carries a Files button with the count, opening the list,
// newest first, each file once at its newest version.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { filesMadeHere } from '../renderer/src/threads/thread-files.ts';
import { ThreadFilesButton } from '../renderer/src/threads/ThreadFiles.tsx';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const said = (ts, result) => ({ ts, source: 'agent', patch: { result } });

describe('the files a thread made', () => {
  const lines = [
    said(1, 'Drafted it in [plan.md](plan.md).'),
    said(2, 'Here is the cover: [cover.png](cover.png)'),
    said(3, 'Rewrote the plan: [plan.md](plan-v2.md)'),
  ];

  it('lists each file once, newest first', () => {
    const files = filesMadeHere(lines, []);
    expect(files.map((f) => f.src)).toEqual(['plan-v2.md', 'cover.png']);
  });

  it('counts the notes on any version of a file', () => {
    const files = filesMadeHere(lines, [{ file: 'cover.png' }, { file: 'cover.png' }]);
    expect(files.find((f) => f.src === 'cover.png').notes).toBe(2);
  });

  it('is empty for a thread that named no file', () => {
    expect(filesMadeHere([said(1, 'Done, no files.')], [])).toEqual([]);
  });
});

describe('the Files button', () => {
  const files = [{ src: 'plan-v2.md', name: 'plan.md', notes: 0, at: 3 }, { src: 'cover.png', name: 'cover.png', notes: 2, at: 2 }];

  it('says how many files, and opens a list naming each', () => {
    const shut = renderToStaticMarkup(React.createElement(ThreadFilesButton, { files, onOpen: () => {} }));
    expect(shut).toMatch(/aria-label="Files in this thread \(2\)"/);
    expect(shut).toMatch(/<b[^>]*>2<\/b>/);
    const open = renderToStaticMarkup(React.createElement(ThreadFilesButton, { files, onOpen: () => {}, startOpen: true }));
    expect(open).toMatch(/plan\.md[\s\S]*cover\.png/);
    expect(open).toContain('2 notes');
  });

  it('is not drawn for a thread with no files', () => {
    expect(renderToStaticMarkup(React.createElement(ThreadFilesButton, { files: [], onOpen: () => {} }))).toBe('');
  });

  it('sits in the thread\'s top bar, the size of its other buttons', () => {
    expect(read('renderer/src/components/Focus.tsx')).toMatch(/files=\{<ThreadFilesButton /);
    expect(read('renderer/src/threads/ThreadMenu.tsx')).toMatch(/\{files\}/);
    expect(read('renderer/src/threads/summary.css')).toMatch(/\.ts-done\.ts-files \{[^}]*height: 30px/);
  });
});
