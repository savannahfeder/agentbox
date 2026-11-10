// KEYS ON HOME NEVER REACH A THREAD YOU CANNOT SEE (w-1bf65f4322, 2026-11-09).
//
// A power tester sent three tasks from Home with ⌘↵, then typed the fourth
// straight away. Home's box lets go of the cursor after a send (a rule made for
// the empty Inbox), so the first letter, "r", was the Reply key, aimed at the
// Inbox's selected row, which Home does not draw. The rest of the task went into
// that old thread's reply box and ⌘↵ sent it there; the next task went to a
// second old thread the same way. Another tester pressed E on Home and closed a
// thread nobody had picked.
//
// Measured on a copy of the app (live.mjs, browse.mjs): after ⌘↵ in Home's box,
// `look` showed no element holding the cursor. Now, while Home is on screen, no
// hidden Inbox row is under the keys, so E, L, R and 1 or 2 are words for
// Home's box, as they are on an empty Inbox (reply-keys.ts: keyOnTheList).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeCoversTheList } from '../renderer/src/home/home-model.ts';
import { keyOnTheList } from '../renderer/src/reply-keys.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer/src/App.tsx'), 'utf8');

const onHome = { homeOn: true, homeOpen: true, threadOpen: false, searching: false, settingsOpen: false, teamShown: false };

describe('Home covers the list', () => {
  it('while Home is the page on screen', () => {
    expect(homeCoversTheList(onHome)).toBe(true);
  });
  it('not once a thread, search, Settings or the Team page is in front of it', () => {
    expect(homeCoversTheList({ ...onHome, threadOpen: true })).toBe(false);
    expect(homeCoversTheList({ ...onHome, searching: true })).toBe(false);
    expect(homeCoversTheList({ ...onHome, settingsOpen: true })).toBe(false);
    expect(homeCoversTheList({ ...onHome, teamShown: true })).toBe(false);
  });
  it('not on the Inbox, and never on a phone, which has no Home', () => {
    expect(homeCoversTheList({ ...onHome, homeOpen: false })).toBe(false);
    expect(homeCoversTheList({ ...onHome, homeOn: false })).toBe(false);
  });
});

describe('with no row under the keys', () => {
  it('R, E, L and the option numbers go into the box', () => {
    for (const key of ['r', 'e', 'l', '1', '2']) expect(keyOnTheList({ key, justChanged: false, nothingToActOn: true })).toBe('nowhere');
  });
  it('and with a row there, they stay its shortcuts', () => {
    expect(keyOnTheList({ key: 'r', justChanged: false, nothingToActOn: false })).toBe('shortcut');
    expect(keyOnTheList({ key: 'e', justChanged: false, nothingToActOn: false })).toBe('shortcut');
  });
});

describe('App.tsx', () => {
  const pointed = app.slice(app.indexOf('const pointed: WorkItem | undefined'), app.indexOf('const keyTab ='));
  it('asks once whether Home covers the list', () => {
    expect(app).toMatch(/const homeCovers = homeCoversTheList\(/);
  });
  it('puts no row under the keys while Home covers the list', () => {
    expect(pointed).toMatch(/homeCovers \? undefined : current/);
  });
  it('still lets the tutorial aim at its own row', () => {
    expect(pointed.indexOf('walkOwn')).toBeLessThan(pointed.indexOf('homeCovers'));
  });
  // Measured after the first fix: R and E typed straight after a send still did
  // nothing, because the Inbox's other rows still counted as places J and K walk.
  // The retest (2026-11-10): back from Settings, the box is drawn again holding
  // the draft with the caret at its start, so the waking letter and the rest of
  // the sentence went in front of the draft.
  it('wakes the box with the caret after the draft, for a letter and for N', () => {
    const nowhere = app.slice(app.indexOf("if (means === 'nowhere')"), app.indexOf("if (means === 'nowhere')") + 300);
    expect(nowhere).toMatch(/focusAtEnd\(box\)/);
    const start = app.slice(app.indexOf('const startThread = () =>'), app.indexOf('const startThread = () =>') + 300);
    expect(start).toMatch(/focusAtEnd\(box\)/);
  });
  it('counts nothing on the hidden Inbox as something to act on', () => {
    const line = app.slice(app.indexOf('const nothingToActOn ='), app.indexOf('\n', app.indexOf('const nothingToActOn =')));
    expect(line).toMatch(/homeCovers \|\|/);
  });
});
