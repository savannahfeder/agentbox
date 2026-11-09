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
import { offerOnNewProject } from '../renderer/src/tutorial.ts';

const read = (f) => fs.readFileSync(new URL(`../renderer/src/${f}`, import.meta.url), 'utf8');

describe('the tutorial offer after a new project', () => {
  it('is not made while a task is being written', () => {
    expect(offerOnNewProject({ made: true, walking: false, offered: false, writing: true })).toBe(false);
  });

  it('is still made when nothing is being written', () => {
    expect(offerOnNewProject({ made: true, walking: false, offered: false, writing: false })).toBe(true);
    expect(offerOnNewProject({ made: true, walking: false, offered: false })).toBe(true);
  });

  it('is told whether the task box is open or holds words', () => {
    expect(read('App.tsx')).toMatch(/offerOnNewProject\(\{[\s\S]{0,400}?writing: modalNow\.current === 'compose' \|\| clearWriting/);
  });
});

describe('the task box after a new project', () => {
  it('takes the keyboard back when the project it is pointed at arrives', () => {
    expect(read('threads/ThreadComposer.tsx')).toMatch(/if \(selectProject\) \{ pickProject\(selectProject\); textRef\.current\?\.focus\(\); \}/);
  });
});
