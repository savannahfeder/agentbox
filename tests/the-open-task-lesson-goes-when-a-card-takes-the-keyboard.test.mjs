// THE "↵ Open task" PLATE GOES WHEN A CARD TAKES THE KEYBOARD.
//
// Seen on a Linux run on 2026-10-29: with the new-thread card open, a small
// box reading "↵ Open task" sat in the top-left at full brightness while
// everything else behind the card was dimmed. It reads as a stray label.
//
// It is the one-time lesson the first run leaves beside your first thread, and
// it is right to be there — until something takes the keyboard. App.tsx has
// held that rule for the ordinary hover plates since they were built ("a hint
// promises a key, so it may not be drawn where the key is swallowed"), and the
// lesson never read it: with the compose card open, ↵ puts a newline in the
// box and opens nothing.
//
// Measured on the rule, and on App.tsx to see the guard is the one it uses.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { showsOpenLesson } from '../renderer/src/first-run';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = { lessons: ['open', 'pick'], focused: false, fresh: false, view: 'inbox', modal: null };

describe('when the lesson is drawn', () => {
  it('is drawn on the list it teaches', () => {
    expect(showsOpenLesson(at)).toBe(true);
    expect(showsOpenLesson({ ...at, view: 'progress' })).toBe(true);
  });

  it('goes while any card has the keyboard', () => {
    // Every one of these takes ↵ for itself, so the plate would promise a key
    // that does something else or nothing at all.
    for (const modal of ['compose', 'filter', 'palette', 'reply', 'snooze', 'standing']) {
      expect(showsOpenLesson({ ...at, modal })).toBe(false);
    }
  });

  it('comes back when the card closes, because the lesson is not spent', () => {
    expect(showsOpenLesson({ ...at, modal: 'compose' })).toBe(false);
    expect(showsOpenLesson({ ...at, modal: null })).toBe(true);
  });

  it('goes for good once a thread has been opened, which is the lesson learnt', () => {
    expect(showsOpenLesson({ ...at, focused: true })).toBe(false);
    expect(showsOpenLesson({ ...at, lessons: ['pick'] })).toBe(false);
    expect(showsOpenLesson({ ...at, lessons: [] })).toBe(false);
  });

  it('is not drawn during the walk, or on a page with no list to open', () => {
    expect(showsOpenLesson({ ...at, fresh: true })).toBe(false);
    expect(showsOpenLesson({ ...at, view: 'snoozed' })).toBe(false);
    expect(showsOpenLesson({ ...at, view: 'done' })).toBe(false);
  });
});

describe('the screen asks that rule rather than keeping its own', () => {
  it('guards the plate with it, and redraws when the card opens or closes', () => {
    const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
    const block = app.slice(app.indexOf('const lessonAt = useLessonPlace('), app.indexOf('useEffect(() => { if (focused) dropLesson'));
    expect(block).toMatch(/showsOpenLesson\(/);
    expect(block).toMatch(/\[[^\]]*\bmodal\b[^\]]*\]\);\s*$/);
  });
});
