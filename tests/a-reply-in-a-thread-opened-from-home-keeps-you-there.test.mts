// A REPLY IN A THREAD OPENED FROM HOME KEEPS YOU THERE (w-1bf65f4322, 2026-11-09).
//
// In a power test two of three testers opened a thread from Home, replied, and
// were moved off it, five times between them: "Sending a reply takes me out of
// the conversation to Home", "takes me straight to a different task". Home sits
// on the Inbox view, so replyMovesOn read the thread as one being cleared from
// Needs you and moved on to the next, or to Home when none was left. Opening a
// thread from Home is choosing that thread, the same as coming back to it with
// O, so a reply now stays on it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replyMovesOn } from '../renderer/src/advance.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer/src/App.tsx'), 'utf8');

describe('a reply in a thread waiting in Needs you', () => {
  it('stays when the thread was opened from Home', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, fromHome: true })).toBe(false);
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 4, fromHome: true })).toBe(false);
  });
  it('still moves on when it was opened from the Inbox', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, fromHome: false })).toBe(true);
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0 })).toBe(true);
  });
});

describe('App.tsx', () => {
  const openRow = app.slice(app.indexOf('const homeOpenRow'), app.indexOf('const skyOnInbox'));
  it('marks a thread Home opens', () => {
    expect(openRow).toMatch(/openedFromHome\.current\.add\(keyOf\(item\)\)/);
  });
  it('asks the mark for every reply', () => {
    expect(app).toMatch(/replyMovesOn\(\{[^}]*fromHome: openedFromHome\.current\.has\(keyOf\(item\)\)/);
  });
});
