// THE USER STAYS ON THE ROW A COMMAND RUNS ON, AND THE WAY OUT OF IT IS THE INBOX.
//
// The rule, set when `/usage` started putting its table on the row: running
// `/usage` or any other command that needs a response keeps the user on that
// task, following it into In Progress, instead of returning to the inbox. This
// applies only where the agent's response has to be seen. Escape, or the back
// button, from that screen goes back to the inbox, even when the task is In
// Progress and even after the agent has returned its content. Normally a task
// opened from In Progress returns to In Progress; this is the one exception.
//
// THREE THINGS A LATER EDIT COULD QUIETLY UNDO, which is why they are here:
//
//   ONLY A COMMAND STAYS. Every other reply hands work to somebody else and
//   advances the user to the next task, which is older behaviour (advance.ts).
//   If `staysOnTheTask` ever said yes to an ordinary message, answering
//   anything would strand the user on the row they just cleared.
//
//   THE PANE'S COPY OF THE ROW HAS TO BE REFRESHED. `focused` is the item as it
//   was when it was opened. Staying on a row without that effect is staying on
//   a row that can never show the answer, which was the predicted bug.
//
//   THE WAY OUT DOES NOT ASK WHICH TAB THE USER CAME FROM. A command answers
//   `blocked`, which is an inbox row, so In progress no longer holds it.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshCopy, staysOnTheTask, stillFollowing, wayOut } from '../renderer/src/stay-with-a-command';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

const row = { product: 'agentbox', id: 'w-1', status: 'blocked' };

describe('which sends keep her on the task', () => {
  it('every one of the commands she can pick from the menu does', () => {
    for (const text of ['/usage', '/cost', '/context', '/model', '/compact', '/mcp']) {
      expect(staysOnTheTask(row, text), text).toBe(true);
    }
  });

  it('a command with an argument does too, because the answer still comes back', () => {
    expect(staysOnTheTask(row, '/goal ship the landing page')).toBe(true);
  });

  it('an ordinary reply does not: it advances her to the next task, as it always has', () => {
    expect(staysOnTheTask(row, 'merge it')).toBe(false);
    expect(staysOnTheTask(row, 'Option 1: merge it')).toBe(false);
  });

  it('a slash in the middle of a sentence is a path, not a command', () => {
    expect(staysOnTheTask(row, 'look in reports/w-5d1ad29efa/usage.html')).toBe(false);
  });

  it('a word that is not one of the eight does not, because it will not run either', () => {
    expect(staysOnTheTask(row, '/resume')).toBe(false);
    expect(staysOnTheTask(row, '/doctor')).toBe(false);
  });

  it('an agent row never does: its reply goes over a socket and has no row to come back to', () => {
    expect(staysOnTheTask({ ...row, agent: { pid: 42 } }, '/usage')).toBe(false);
  });
});

describe('how long she is following it', () => {
  const following = { product: 'agentbox', id: 'w-1' };

  it('while she is on that row, she is still following it', () => {
    expect(stillFollowing(following, { product: 'agentbox', id: 'w-1' })).toEqual(following);
  });

  it('leaving the task keeps the follow alive for one render, which is what answers where to', () => {
    expect(stillFollowing(following, null)).toEqual(following);
  });

  it('an urgent row taken over the top of it ends the follow', () => {
    expect(stillFollowing(following, { product: 'agentbox', id: 'w-2' })).toBe(null);
  });

  it('the same id in another product is another row', () => {
    expect(stillFollowing(following, { product: 'zero', id: 'w-1' })).toBe(null);
  });
});

describe('where closing the task leaves her', () => {
  const following = { product: 'agentbox', id: 'w-1' };

  it('her inbox, when she was watching a command answer on it', () => {
    expect(wayOut(following, null)).toBe('inbox');
  });

  it('and it does not ask which tab she opened it from: that is the exception she named', () => {
    // There is no view in this call at all. In progress and Closed cannot get a
    // different answer out of it than the inbox does.
    expect(wayOut.length).toBe(2);
  });

  it('nothing moves while the task is still open', () => {
    expect(wayOut(following, { product: 'agentbox', id: 'w-1' })).toBe('stay');
  });

  it('an ordinary task closes where it always closed', () => {
    expect(wayOut(null, null)).toBe('stay');
  });
});

describe('the app is wired to all three', () => {
  it('a command send skips the advance instead of clearing the pane', () => {
    // AND IT IS ASKED WITH THE ROW'S ENGINE SINCE 2026-09-05. Codex knows none
    // of the eight, so a `/usage` typed by hand on such a row runs an ordinary
    // turn -- and staying on it meant Escape and the back arrow both left her in
    // her inbox, waiting for a table that was never coming. The word is handed
    // in from the pane, which is where main's answer already is.
    expect(app).toMatch(/const stay = staysOnTheTask\(item, text, engine\)/);
    expect(app).toMatch(/if \(!stay\) leaveResolved\(item\)/);
  });

  it('and the pane it stays on is refreshed from the store, or the answer never lands on it', () => {
    // The rule moved into `freshCopy` on, when it stopped being only about a
    // command. A followed row still takes every copy it is handed, which is the
    // case this file is for; the gate is tested next door in
    // an-answer-written-while-she-reads-the-row-reaches-her-screen.test.mjs.
    expect(app).toMatch(/const fresh = freshCopy\(items, focused, following\)/);
    expect(app).toMatch(/if \(fresh\) setFocused\(fresh\)/);
    const watched = { product: 'agentbox', id: 'w-1' };
    expect(freshCopy([{ product: 'agentbox', id: 'w-1', updatedAt: 1 }], { product: 'agentbox', id: 'w-1', updatedAt: 1 }, watched))
      .toEqual({ product: 'agentbox', id: 'w-1', updatedAt: 1 });
  });

  it('and the way out is written against the state, not against Escape and the arrow', () => {
    expect(app).toMatch(/wayOut\(following, focused\) !== 'inbox'/);
    expect(app).toMatch(/setFollowing\(null\);\s*\n\s*setView\('inbox'\);/);
    // Escape and the back arrow are untouched: both still only close the task.
    expect(app).toMatch(/if \(e\.key === 'Escape'\) \{ if \(escapeClosesDoc\(openDoc\)\) closeArtifact\(\); else setFocused\(null\); \}/);
  });
});
