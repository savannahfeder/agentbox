// A REPLY KEEPS YOU ON THE THREAD UNLESS YOU ARE CLEARING YOUR INBOX (2026-10-13).
//
// "I quite often will just stick with one chat ... go into in progress, click
// the chat and then just stick with it ... every time I send a message brings
// me back to the in progress list view." And the other half: going through the
// inbox "you'll have to go back to the inbox every single time you want to go
// to the next" if it always stayed.
//
// Read in renderer/src/App.tsx: every reply and every picked option went
// through `leaveResolved`, which closes the thread. On Needs you the next one
// then opened (./advance); on any other list there is no next, so she was put
// back on the list. Agreed rule: where she opened the thread decides. Working
// through Needs you with another thread waiting there, a reply moves on to it.
// Anywhere else, or with nothing left to move to, she stays on the thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { replyMovesOn } from '../renderer/src/advance.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

describe('after a reply', () => {
  it('moves on when she is working through Needs you and another thread waits there', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 2, inboxSize: 5 })).toBe(true);
  });
  it('and on the board, whose Waiting column is the inbox', () => {
    expect(replyMovesOn({ view: 'progress', onBoard: true, index: 0, inboxSize: 3 })).toBe(true);
  });
  it('stays when she opened it from In progress', () => {
    expect(replyMovesOn({ view: 'progress', onBoard: false, index: -1, inboxSize: 5 })).toBe(false);
  });
  it('stays when she opened it from any other list', () => {
    expect(replyMovesOn({ view: 'done', onBoard: false, index: -1, inboxSize: 5 })).toBe(false);
    expect(replyMovesOn({ view: 'all', onBoard: false, index: 3, inboxSize: 5 })).toBe(false);
  });
  it('stays on Needs you when this was the last thread waiting, rather than leaving her on an empty list', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: 0, inboxSize: 1 })).toBe(false);
  });
  it('stays on Needs you when the thread was not in it (opened from search or an alert)', () => {
    expect(replyMovesOn({ view: 'inbox', onBoard: false, index: -1, inboxSize: 4 })).toBe(false);
  });
});

describe('App.tsx asks it', () => {
  it('for a typed reply', () => {
    expect(app).toMatch(/const stay = staysOnTheTask\(item, text, engine\) \|\| talking \|\| !!pick \|\| !movesOn\(item\);/);
  });
  it('for a picked option', () => {
    expect(app).toMatch(/`Option \$\{option\.n\} → \$\{item\.productName\}`, undefined, !movesOn\(item\),/);
  });
});
