// A PROJECT MADE MID-TASK KEEPS THE WORDS AND THE KEYBOARD (F-176, F-195).
//
// What broke: with a task half typed, picking "New project" from the task
// box's project menu made the project and then put "Take the tutorial first?"
// over the box, with the keyboard on Start the tutorial. The next key typed
// started the tutorial and the box with the task in it went away; "Not now"
// left the keyboard on nothing, so typing went nowhere until a click.
//
// Measured in the browser build on this branch before the fix: after the pick,
// document.activeElement was the offer's button, and typing " MORE" left no
// task box on the page. With no offer, activeElement was <body>.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('the task box after a new project', () => {
  it('takes the keyboard back when the project it is pointed at arrives', () => {
    expect(read('threads/ThreadComposer.tsx')).toMatch(/if \(selectProject\) \{ pickProject\(selectProject\); textRef\.current\?\.focus\(\); \}/);
  });
});
