// A THREAD WAITING IN NEEDS YOU PUTS YOU IN NEEDS YOU, HOWEVER YOU OPENED IT
// (w-d7e203a6c9).
//
// "I will respond to a message in Needs You and there will still be a bunch of
// tasks left. It'll just bring me to the Everything Else page." Every thread in
// Needs you opens on the Needs you page ("2 of 15", arrows to the next), but
// whether an answer moves on reads `view`, the tab you were last on. Opened
// from Everything else (a notification, a teammate's Agents list, the queue
// arrows from a thread opened elsewhere), `view` was still In progress.
//
// Measured on the built renderer with a made-up team
// (scripts/lib/groups-stage.mjs): on Everything else, a notification opened a
// Needs you thread on "NEEDS YOU · 2 OF 15". A typed reply kept the thread open
// instead of moving on; E dropped the window on Everything else with 15 still
// waiting. Opened from the Needs you list, the same reply and E moved on.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opensIntoNeedsYou, replyMovesOn } from '../renderer/src/advance.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer', 'src', 'App.tsx'), 'utf8');

const waiting = { view: 'progress', onBoard: false, index: 1, searching: false, conversation: false, interrupted: false, walking: false };

describe('opening a thread that waits in Needs you', () => {
  it('from Everything else or In progress puts you in Needs you', () => {
    expect(opensIntoNeedsYou(waiting)).toBe(true);
    expect(opensIntoNeedsYou({ ...waiting, view: 'snoozed' })).toBe(true);
    expect(opensIntoNeedsYou({ ...waiting, view: 'done', index: 0 })).toBe(true);
  });
  it('so the answer on it then moves on, as it does from the Needs you list', () => {
    expect(replyMovesOn({ view: 'progress', onBoard: false, index: 1 })).toBe(false);
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 1 })).toBe(true);
  });
  it('changes nothing when you are already there', () => {
    expect(opensIntoNeedsYou({ ...waiting, view: 'inbox' })).toBe(false);
  });
});

describe('it leaves you where you were', () => {
  it('for a thread that is not waiting, so a chat opened from In progress stays yours', () => {
    expect(opensIntoNeedsYou({ ...waiting, index: -1 })).toBe(false);
  });
  it('from search, which has its own way back', () => {
    expect(opensIntoNeedsYou({ ...waiting, searching: true })).toBe(false);
  });
  it('on the board, whose Waiting column already moves on', () => {
    expect(opensIntoNeedsYou({ ...waiting, onBoard: true })).toBe(false);
  });
  it('in a conversation with a person', () => {
    expect(opensIntoNeedsYou({ ...waiting, conversation: true })).toBe(false);
  });
  it('when an urgent thread took the screen, which goes back to what you were reading', () => {
    expect(opensIntoNeedsYou({ ...waiting, interrupted: true })).toBe(false);
  });
  it('during the first-run walk, which moves the tabs itself', () => {
    expect(opensIntoNeedsYou({ ...waiting, walking: true })).toBe(false);
  });
});

describe('App.tsx', () => {
  it('asks it when a thread opens and moves the tab to Needs you', () => {
    expect(app).toMatch(/if \(opensIntoNeedsYou\(\{[\s\S]{0,400}?\}\)\) setView\('inbox'\);/);
  });
  it('only when the open thread changes, not when the one you sit on comes into Needs you', () => {
    const at = app.indexOf('if (opensIntoNeedsYou({');
    const effect = app.slice(app.lastIndexOf('useEffect(', at), at);
    expect(effect).toMatch(/if \(key === openedKey\.current\) return;/);
  });
});
