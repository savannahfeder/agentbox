// A THREAD YOU CAME BACK TO WITH O KEEPS YOU AFTER A REPLY (w-e0b79b0a06, 2026-11-03).
//
// "Every time after I send a message, it brings me to the next thread and then
// I have to hit O. I do this continuously." Working one thread from Needs you,
// every reply moved on (advance.ts: replyMovesOn), and O was the way back each
// time. Reopening it also put the file beside it back at the top: "it even
// brings me to the wrong position in the artifact I was working in."
//
// Measured by reading the code: replyMovesOn had no input for "she came back
// here on purpose", and DocStage and CodeStage mount a fresh scroll box at the
// top each time a file opens. Now coming back with O (or the toast, or the
// Sent-to line, which all call openToastRow) marks the thread, a reply on a
// marked thread stays, and a file opens where it was last left, a next version
// of it (name-v47 after name-v46) included.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replyMovesOn } from '../renderer/src/advance.ts';
import { keepScroll, keptScroll, scrollKey } from '../renderer/src/kept-scroll.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');

describe('a reply from Needs you', () => {
  it('stays on a thread you came back to', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 2, cameBack: true })).toBe(false);
    expect(replyMovesOn({ view: 'progress', onBoard: true, index: 0, cameBack: true })).toBe(false);
  });
  it('still moves on from a thread you did not come back to', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 2, cameBack: false })).toBe(true);
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 2 })).toBe(true);
  });
});

describe('App.tsx', () => {
  const app = read('renderer/src/App.tsx');
  const openToastRow = app.slice(app.indexOf('const openToastRow'), app.indexOf('/* ------------------------------- keyboard'));
  it('marks the thread O opens', () => {
    expect(openToastRow).toMatch(/openedWithO\.current\.add\(keyOf\(row\)\)/);
  });
  it('asks the mark for every reply', () => {
    expect(app).toMatch(/replyMovesOn\(\{[^}]*cameBack: openedWithO\.current\.has\(keyOf\(item\)\)/);
  });
});

describe('where a file opens', () => {
  it('is where it was left', () => {
    keepScroll(scrollKey('p', 'designs/w-1/notes.md'), 1800);
    expect(keptScroll(scrollKey('p', 'designs/w-1/notes.md'))).toBe(1800);
  });
  it('and a next version opens there too', () => {
    keepScroll(scrollKey('p', 'designs/w-1/accepted-applications-v46.md'), 2400);
    expect(keptScroll(scrollKey('p', 'designs/w-1/accepted-applications-v47.md'))).toBe(2400);
  });
  it('but another file, the same name in another folder, or another project starts at the top', () => {
    keepScroll(scrollKey('p', 'designs/w-1/a.md'), 900);
    expect(keptScroll(scrollKey('p', 'designs/w-1/b.md'))).toBe(0);
    expect(keptScroll(scrollKey('p', 'designs/w-2/a.md'))).toBe(0);
    expect(keptScroll(scrollKey('q', 'designs/w-1/a.md'))).toBe(0);
  });
  it('and back at the top it forgets', () => {
    keepScroll(scrollKey('p', 'c.md'), 500);
    keepScroll(scrollKey('p', 'c.md'), 0);
    expect(keptScroll(scrollKey('p', 'c.md'))).toBe(0);
  });
  it('in the file beside a thread, documents and code both', () => {
    expect(read('renderer/src/components/DocText.tsx')).toContain('useKeptScroll(scroller, scrollKey(product, src))');
    expect(read('renderer/src/components/DocPane.tsx')).toContain('useKeptScroll(codeBox, scrollKey(doc.product, src))');
    expect(read('renderer/src/components/DocPane.tsx')).toContain('<div className="code-scroll" ref={setCodeBox}>');
  });
  it('and in the versions view', () => {
    const stage = read('renderer/src/components/ArtifactStage.tsx');
    expect(stage.match(/useKeptScroll\(scroller, scrollKey\(product, path\)\)/g)?.length).toBe(2);
  });
});
