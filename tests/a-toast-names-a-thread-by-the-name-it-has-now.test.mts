// A TOAST NAMES A THREAD BY THE NAME IT HAS NOW (w-34443a206b).
//
// Testers on 2026-11-22 saw it 13 times: a toast or Back named a thread by a
// name it no longer had. Two causes, read in App.tsx. Reopen, the close of a
// task between people, "do it in this thread" and a repeat's reopen named the
// thread by `title`, the words it was started with, where every row draws its
// name (rowTitle). And an undo entry keeps the words it was made with, so a Z
// pressed after a rename named the thread as it was. Measured on the toast
// strings in App.tsx and on namedNow, which an undo now reads its words through.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { namedNow } from '../renderer/src/undo-window';

const app = fs.readFileSync(path.join(import.meta.dirname, '..', 'renderer/src/App.tsx'), 'utf8');

describe('the words an undo says', () => {
  it('carry the name the thread has now', () => {
    expect(namedNow('Reopened: Fix the cart', 'Fix the cart', 'Cart total is wrong')).toBe('Reopened: Cart total is wrong');
    expect(namedNow('reopen “Fix the cart”', 'Fix the cart', 'Cart total is wrong')).toBe('reopen “Cart total is wrong”');
  });

  it('are left alone when the name has not changed or is not in them', () => {
    expect(namedNow('Reopened: Fix the cart', 'Fix the cart', 'Fix the cart')).toBe('Reopened: Fix the cart');
    expect(namedNow('Undid your reply', 'Fix the cart', 'Cart total is wrong')).toBe('Undid your reply');
    expect(namedNow('Reopened: Fix the cart', '', 'Cart total is wrong')).toBe('Reopened: Fix the cart');
    expect(namedNow('Reopened: Fix the cart', 'Fix the cart', '')).toBe('Reopened: Fix the cart');
  });

  it('are what Z shows, for the question and for what it did', () => {
    const from = app.indexOf('const { take: last, rest, instant } = nextUndo(undoStack, now);');
    const undo = app.slice(from, app.indexOf("return 'done' as const;", from));
    expect(undo).toMatch(/showToast\(undoAsk\(nowNamed\(last\.undoes\)\)\)/);
    expect(undo).toMatch(/const label = nowNamed\(last\.label\)/);
  });
});

describe('every toast that names a thread', () => {
  it('names it as its row does, never by the words it started with', () => {
    expect(app).not.toMatch(/clipToSentence\(item\.title, TOAST_TITLE\)/);
    expect(app).not.toMatch(/clipToSentence\(child\.title, TOAST_TITLE\)/);
  });
});
