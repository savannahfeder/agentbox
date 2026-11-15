// MOVING A THREAD TO LATER OFFERED NO UNDO.
//
// QA batch 002, F-50, on the Linux desktop build (Oct 24 2026): "Hover a Needs
// you row, press L, type 5m, press Enter. Toast: 'Moved to Later. Back today,
// 1:19 pm' with no Undo." Z did take it back, so the undo entry had been on the
// pile the whole time and only the toast was silent.
//
// Measured off App.tsx the same way. Every action held behind the grace window
// says the key through `deferCommit`, which writes the tail itself, so those
// were all fine. The actions that write STRAIGHT AWAY raise their own toast and
// push their own entry, and four of them never named the key at all: moving to
// Later, bringing one back from Later, moving a thread to another project, and
// closing a ticked selection.
//
// The tail is a flag rather than copy: `toastParts` strips it and draws the
// Undo cap, so the words never reach the screen. It is one exported sentence
// now (`SAYS_UNDO`), and this test holds every pushUndo in App.tsx to raising a
// toast that carries one.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAYS_UNDO, toastParts } from '../renderer/src/toast-parts.ts';
import { sentLine } from '../renderer/src/compose-says.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

/**
 * Every `const name = useCallback(` body in App.tsx that pushes an undo entry,
 * as { name, body }. The body runs to the `}, [deps]);` that closes it.
 */
function callbacksThatPushUndo(src) {
  const lines = src.split('\n');
  const out = new Map();
  lines.forEach((line, i) => {
    if (!line.includes('pushUndo(')) return;
    let top = i;
    while (top >= 0 && !/^ {2}const (\w+) = useCallback/.test(lines[top])) top -= 1;
    if (top < 0) return;
    const name = /^ {2}const (\w+) = useCallback/.exec(lines[top])[1];
    if (out.has(name)) return;
    let end = i;
    while (end < lines.length && !/^ {2}}, \[/.test(lines[end])) end += 1;
    out.set(name, lines.slice(top, end + 1).join('\n'));
  });
  return out;
}

const pushers = callbacksThatPushUndo(app);
// The one that raises no toast of its own: the compose card pushes through it
// and says the send in its caller's words, which are `sentLine`'s below.
const SAYS_IT_AT_ITS_CALLER = 'noteNewTask';

describe('the sentence that promises Z', () => {
  it('is drawn as the Undo key, not read as part of the news', () => {
    expect(toastParts(`Moved to Later. Back today, 1:19 pm${SAYS_UNDO}`))
      .toEqual({ line: 'Moved to Later. Back today, 1:19 pm', undo: true });
  });

  // The case that must NOT match: a toast explaining Z keeps its own words.
  it('leaves a toast that is about Z alone', () => {
    expect(toastParts('Press Z again to undo moving it to Later.').undo).toBe(false);
  });
});

describe('every action that puts something on the undo pile', () => {
  it('is found, and moving to Later is one of them', () => {
    expect([...pushers.keys()]).toContain('snoozeUntil');
    expect(pushers.size).toBeGreaterThanOrEqual(8);
  });

  for (const [name, body] of pushers) {
    if (name === SAYS_IT_AT_ITS_CALLER) continue;
    it(`${name} tells you the key`, () => {
      expect(body.includes('deferCommit(') || /SAYS_UNDO|Z to undo/.test(body)).toBe(true);
    });
  }

  it(`${SAYS_IT_AT_ITS_CALLER} is said by the line its caller raises`, () => {
    for (const held of [false, true]) {
      expect(toastParts(sentLine({ to: 'Kestrel', held })).undo).toBe(true);
    }
    expect(toastParts(sentLine({ to: 'Kestrel', threads: 3 })).undo).toBe(true);
  });
});

describe('moving a thread to Later', () => {
  const body = pushers.get('snoozeUntil') ?? '';

  it('names the key, on the one row and on many', () => {
    expect(body).toMatch(/`Later: \$\{moved\}\. Back \$\{label\.toLowerCase\(\)\}\$\{SAYS_UNDO\}`/);
  });

  // AND NAMES THE THREAD, which is the half the toast was missing: the row
  // leaves the list as the toast is said, so "Moved to Later" named nothing
  // you could check it against. Every other toast of this family does
  // ("Done: Add"), and `rowTitle` is the one that answers for an agent's row
  // as well as a thread's.
  it('names what it moved, clipped the way every toast clips a title', () => {
    expect(body).toMatch(/const moved = picked\.length > 1 \? `\$\{picked\.length\} threads` : clipToSentence\(rowTitle\(picked\[0\]\), TOAST_TITLE\);/);
  });

  // The case that must not match: the write was refused, so nothing was put
  // off and there is nothing to take back.
  it('says nothing about Z when the store refused the write', () => {
    const refused = /Could not move it to Later: [^`]*`/.exec(body);
    expect(refused).not.toBeNull();
    expect(refused[0]).not.toContain('SAYS_UNDO');
  });
});

describe('bringing one back from Later, moving a thread, and closing a ticked set', () => {
  it('each name the key on every count they say', () => {
    for (const name of ['unsnooze', 'moveToProject', 'batchDone']) {
      const body = pushers.get(name) ?? '';
      const toasts = [...body.matchAll(/showToast\(/g)];
      expect(toasts.length, `${name} raises a toast`).toBeGreaterThan(0);
      expect(body, `${name} names the key`).toContain('SAYS_UNDO');
    }
  });
});
