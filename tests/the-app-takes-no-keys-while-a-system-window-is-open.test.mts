// A PATH TYPED INTO THE FOLDER CHOOSER IS NOT A TASK.
//
// QA on the Linux box, 2026-10-27 (F-104). With the chooser open they pressed
// Ctrl+L and typed a path. The dialog took it, and so did the app behind it:
// the first task's box came back holding
// "/workspace/agentbox-test-repos/range-utils-js", which they had to delete by
// hand before they could write anything. A GTK dialog's modality is a hint to
// the window manager, and the one on that box passed the keys through.
//
// Measured on the rule rather than in a browser: this repo has no jsdom, and
// what went wrong is which listeners are attached over which span.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { whileSystemWindowIsOpen } from '../renderer/src/system-window.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A stand-in for the window, which records who is listening to what. */
function fakeWindow() {
  const on = new Map();
  return {
    on,
    addEventListener(type, fn) { on.set(type, [...(on.get(type) ?? []), fn]); },
    removeEventListener(type, fn) { on.set(type, (on.get(type) ?? []).filter((f) => f !== fn)); },
    /** Returns what the event was put through: the box gets the key only when
     *  nothing stopped it. */
    press(type = 'keydown') {
      const marks = { stopped: false, prevented: false };
      const e = { preventDefault() { marks.prevented = true; }, stopPropagation() { marks.stopped = true; } };
      for (const fn of on.get(type) ?? []) fn(e);
      return marks;
    },
    listening: () => [...on.values()].flat().length,
  };
}

const never = () => {};

describe('1. the keys pressed while the chooser is up', () => {
  it('reach the app before it opens and after it closes', async () => {
    const w = fakeWindow();
    expect(w.press().prevented).toBe(false);
    await whileSystemWindowIsOpen(async () => never(), w);
    expect(w.press().prevented).toBe(false);
    expect(w.listening()).toBe(0);
  });

  it('are dropped for as long as it is open', async () => {
    const w = fakeWindow();
    let whileOpen = null;
    await whileSystemWindowIsOpen(async () => { whileOpen = w.press(); }, w);
    expect(whileOpen).toEqual({ prevented: true, stopped: true });
  });

  it('are dropped however they were going to reach the box', async () => {
    const w = fakeWindow();
    const marks = {};
    await whileSystemWindowIsOpen(async () => {
      for (const kind of ['keydown', 'keypress', 'beforeinput', 'textInput', 'paste']) marks[kind] = w.press(kind);
    }, w);
    for (const [kind, mark] of Object.entries(marks)) expect(mark.prevented, kind).toBe(true);
  });
});

describe('2. the app hears again however the chooser ends', () => {
  it('after it is cancelled, which answers with nothing and is not an error', async () => {
    const w = fakeWindow();
    const answer = await whileSystemWindowIsOpen(async () => ({ path: null }), w);
    expect(answer).toEqual({ path: null });
    expect(w.press().prevented).toBe(false);
  });

  it('after it throws, which is the way a deaf app would have stayed deaf', async () => {
    const w = fakeWindow();
    await expect(whileSystemWindowIsOpen(async () => { throw new Error('no dialog'); }, w)).rejects.toThrow('no dialog');
    expect(w.listening()).toBe(0);
    expect(w.press().prevented).toBe(false);
  });

  it('only once the last of two overlapping ones has closed', async () => {
    const w = fakeWindow();
    let letSecondGo;
    const second = new Promise((go) => { letSecondGo = go; });
    const b = whileSystemWindowIsOpen(() => second, w);
    const a = whileSystemWindowIsOpen(async () => never(), w);
    await a;
    // The first chooser is still up, so the keys are still not the app's.
    expect(w.press().prevented).toBe(true);
    letSecondGo();
    await b;
    expect(w.press().prevented).toBe(false);
  });
});

describe('3. the calls that open one go through it', () => {
  const api = fs.readFileSync(path.join(root, 'renderer/src/api.ts'), 'utf8');

  it('the folder chooser, which is the one the path was typed into', () => {
    expect(api).toMatch(/whileSystemWindowIsOpen[\s\S]{0,180}?\(\) => zero\.chooseFolder/);
    expect(api).not.toMatch(/await zero\.chooseFolder/);
  });

  it('and the other two windows the app opens, for the same reason', () => {
    expect(api).toMatch(/whileSystemWindowIsOpen[\s\S]{0,180}?\(\) => zero\.engineBin/);
    expect(api).toMatch(/whileSystemWindowIsOpen[\s\S]{0,180}?\(\) => zero\.projectIcon\(/);
  });
});
