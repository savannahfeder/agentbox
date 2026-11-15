// 2026-11-02: the multiplayer work drew sentences to cover design gaps: "Not
// sent yet" beside every reply box with words in it, "Nothing yet today from
// Margarette, David, Riley, Growth marketer, ..." under Today, and second
// sentences telling people how to use what they were looking at. The owner:
// never add misc text to get around a design problem. Measured by reading the
// renderer source for each sentence that was drawn.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as replyKeys from '../renderer/src/reply-keys';

const root = new URL('../renderer/src/', import.meta.url).pathname;
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'connections' ? [] : files(p);
  return /\.(tsx?|mjs)$/.test(e.name) ? [p] : [];
});
const source = files(root).map((f) => [path.relative(root, f), fs.readFileSync(f, 'utf8')]);
const drawing = (words) => source.filter(([, text]) => text.includes(words)).map(([f]) => f);

describe('a reply box with words in it says nothing about them', () => {
  it('no box draws "Not sent yet"', () => expect(drawing('Not sent yet')).toEqual([]));
  it('the helper that made it is gone', () => expect(replyKeys.unsentWords).toBeUndefined());
  it('the box still offers its Send key', () => expect(replyKeys.sendKeyFor(true)).toBeTruthy());
});

describe('Today does not list the people who did nothing', () => {
  for (const words of ['Nothing yet today from', 'Nothing yesterday from', 'Nothing this week from']) {
    it(`does not draw "${words} …"`, () => expect(drawing(words)).toEqual([]));
  }
  it('a day with nothing at all still says so, plainly', () => expect(drawing('Nothing moved yet today.')).toEqual(['team/TodayPage.tsx']));
});

describe('nothing on screen explains how to use itself', () => {
  for (const words of [
    'A thread’s menu marks it shipped',
    'A message’s More menu marks it a decision',
    'Drag a file here, or move one from its menu',
    'Message it or give it a task',
    'It opens here once it comes across',
    'Its holder hears when that finishes',
    'It opens when you point at it and shrinks when you leave',
    'The agent keeps this summary up to date',
    'Press again to use the page',
    'Files your team shares and your agents make will be here',
    'Your words are still',
    'The link is under the message',
    'Press it again if you meant it',
    'Press R to reply or N for a new thread',
    'The app is busy',
    'It was not sent.',
    'Quit and reopen it, then try again',
    'Those notes did not reach the agent. Try again',
    'The rest of its folder stays on this computer',
    'It does not start an agent',
    'They will see this thread',
    'start a thread you both see',
    'It shows as the next version once their computer has it',
    'They set themselves up from it',
    'Remove it to send the rest',
  ]) {
    it(`"${words}" is not drawn`, () => expect(drawing(words)).toEqual([]));
  }
});
