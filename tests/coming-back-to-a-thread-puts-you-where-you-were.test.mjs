// COMING BACK TO A THREAD PUTS YOU WHERE YOU WERE (w-f55ea5cd53, 2026-11-08).
//
// "An urgent task will interrupt my current task but then I'll go back to the
// previous task ... All of that gets lost and I have to find myself scrolling
// back." Measured by reading the code: the interruption hands back the right
// thread (interrupt.ts: taskToReturnTo), but every piece of where she was in it
// was reset on the change of thread. The file beside it was closed
// (App.tsx: "THE PANE BELONGS TO THE TASK"), Show what the agent did folded
// (ItemThread.tsx: setEarlierOpen(false)), the steps she opened folded
// (Thread.tsx: setRunsOpen(new Set())), the conversation opened at its end
// (Focus.tsx: "clicking into a task always ends at the bottom") and a film
// started again from 0:00.
//
// Now a thread keeps where she was for as long as the window is open, and
// coming back to it puts her there, after an interruption or any other way back,
// unless the agent has answered since she left. Then it opens at the new answer
// as before, because that answer is what she came back for.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forgetPlaces, keepPlace, leavePlace, placeKey, placeToReturnTo } from '../renderer/src/thread-place.ts';
import { keepFilmTime, keptFilmTime } from '../renderer/src/kept-scroll.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '..', p), 'utf8');

const A = placeKey({ product: 'astral', id: 'w-1' });
const B = placeKey({ product: 'astral', id: 'w-2' });

describe('where she was in a thread', () => {
  beforeEach(() => forgetPlaces());

  it('comes back when nothing new was answered', () => {
    keepPlace(A, { earlier: true, whole: true, runs: ['run-3'] });
    leavePlace(A, 1000, { top: 4200, doc: { product: 'astral', src: 'designs/w-1/plan.md' }, mode: 'focus' });
    expect(placeToReturnTo(A, 1000)).toEqual({
      news: 1000, top: 4200, doc: { product: 'astral', src: 'designs/w-1/plan.md' }, mode: 'focus',
      earlier: true, whole: true, runs: ['run-3'],
    });
  });

  it('can be come back to more than once', () => {
    leavePlace(A, 1000, { top: 900 });
    expect(placeToReturnTo(A, 1000)?.top).toBe(900);
    leavePlace(A, 1000, {});
    expect(placeToReturnTo(A, 1000)?.top).toBe(900);
  });

  it('is not used once the agent has answered since she left', () => {
    leavePlace(A, 1000, { top: 4200, earlier: true });
    expect(placeToReturnTo(A, 1001)).toBeNull();
    // and is not used later either, when the answer has been read
    leavePlace(A, 1001, {});
    expect(placeToReturnTo(A, 1001)?.top).toBeUndefined();
    expect(placeToReturnTo(A, 1001)?.earlier).toBeUndefined();
  });

  it('is nothing for a thread she has not left yet', () => {
    keepPlace(A, { earlier: true });
    expect(placeToReturnTo(A, 1000)).toBeNull();
    expect(placeToReturnTo(B, 0)).toBeNull();
  });

  it('belongs to its own thread', () => {
    leavePlace(A, 5, { top: 300 });
    leavePlace(B, 5, { top: 700 });
    expect(placeToReturnTo(A, 5)?.top).toBe(300);
    expect(placeToReturnTo(B, 5)?.top).toBe(700);
    expect(placeKey({ product: 'other', id: 'w-1' })).not.toBe(A);
  });

  it('closing the file before leaving is remembered as closed', () => {
    leavePlace(A, 5, { doc: { product: 'astral', src: 'a.md' } });
    leavePlace(A, 5, { doc: null });
    expect(placeToReturnTo(A, 5)?.doc).toBeNull();
  });
});

describe('a film opened again', () => {
  it('starts where it was left', () => {
    keepFilmTime('file:///x/demo.mp4', 42.5, false);
    expect(keptFilmTime('file:///x/demo.mp4')).toBe(42.5);
  });
  it('starts again from the top once it was watched to the end, or never played', () => {
    keepFilmTime('file:///x/demo.mp4', 61, true);
    expect(keptFilmTime('file:///x/demo.mp4')).toBe(0);
    expect(keptFilmTime('file:///x/never.mp4')).toBe(0);
  });
});

describe('the app uses it', () => {
  const app = read('renderer/src/App.tsx');
  const thread = read('renderer/src/components/ItemThread.tsx');
  const folds = read('renderer/src/components/Thread.tsx');
  const focus = read('renderer/src/components/Focus.tsx');
  const film = read('renderer/src/components/FilmPlayer.tsx');

  it('writes the place down when she leaves a thread and reads it when she comes back', () => {
    expect(app).toMatch(/leavePlace\(/);
    expect(app).toMatch(/placeToReturnTo\(/);
    // the file and its full-screen view ride the reload's own door back in
    expect(app).toMatch(/pendingDoc\.current = \{ id: .*mode: back\.mode/);
    expect(app).toMatch(/if \(wanted\.doc && wanted\.mode\) setArtifactMode\(wanted\.mode\)/);
  });

  it('a thread folds open again where she opened it', () => {
    expect(thread).toMatch(/placeToReturnTo\(/);
    expect(thread).toMatch(/keepPlace\(/);
    expect(folds).toMatch(/kept\?\.runs/);
  });

  it('the conversation can be put back more than once, not only after a reload', () => {
    expect(focus).not.toMatch(/resumed\.current === item\.id/);
  });

  it('a film keeps its time', () => {
    expect(film).toMatch(/keepFilmTime\(/);
    expect(film).toMatch(/keptFilmTime\(/);
  });
});
